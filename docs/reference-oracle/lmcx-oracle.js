// Throwaway reference assembler + interpreter for "LMC-X": a HYPOTHETICAL, NON-OCR extension of the LMC
// with addressing modes (see docs/OCR_LMC_Reference.md section 7.1). Used only to check the examples.
//
// Instructions are VARIABLE LENGTH, like a 6502/6809-style CPU: an opcode word, then (for most
// instructions) ONE operand word in the next mailbox.
//
//   opcode word = 3 digits   O M S     O = operation (same digit as plain LMC)
//                                      M = addressing mode (0 direct, 1 immediate, 2 indirect, 3 indexed)
//                                      S = 0, except the "misc" group 9: 901 INP, 902 OUT, 903 INX, 904 TXA
//   operand word = 000-999   (an address 00-99, or for immediate mode any value 0-999)
//
// Source syntax is a superset of plain LMC, so plain LMC programs assemble (to different, longer machine code).
const fs = require('fs');
const path = require('path');

const BASE = { ADD: 100, SUB: 200, STA: 300, LDX: 400, LDA: 500, BRA: 600, BRZ: 700, BRP: 800 };
const ZERO = { INP: 901, OUT: 902, INX: 903, TXA: 904, HLT: 0, COB: 0 };
const ALLOWED = { ADD: [0, 1, 2, 3], SUB: [0, 1, 2, 3], LDA: [0, 1, 2, 3], STA: [0, 2, 3], LDX: [0, 1], BRA: [0], BRZ: [0], BRP: [0] };
const isMn = (s) => { const u = s.toUpperCase(); return u in BASE || u in ZERO || u === 'DAT'; };

function parseOperand(s) {
  let m;
  if ((m = /^#(\d+)$/.exec(s))) return { mode: 1, num: parseInt(m[1], 10) };
  if ((m = /^\((\w+)\)$/.exec(s))) return { mode: 2, ref: m[1] };
  if ((m = /^(\w+),X$/i.exec(s))) return { mode: 3, ref: m[1] };
  return { mode: 0, ref: s };
}

function assemble(src) {
  const lines = [];
  for (const raw of src.split(/\r?\n/)) {
    const t = raw.replace(/\/\/.*$/, '').trim();
    if (!t) continue;
    const parts = t.split(/\s+/);
    let label = null;
    if (!isMn(parts[0])) label = parts.shift();
    lines.push({ label, mn: parts.shift().toUpperCase(), operand: parts[0] });
  }
  // Pass 1: addresses (instruction length matters, so this pass is essential)
  const sym = {};
  let addr = 0;
  for (const l of lines) {
    l.addr = addr;
    if (l.label) sym[l.label] = addr;
    l.len = l.mn in BASE ? 2 : 1;
    addr += l.len;
  }
  if (addr > 100) throw new Error('program too large: ' + addr + ' words');
  // Pass 2: code
  const mem = new Array(100).fill(0);
  for (const l of lines) {
    if (l.mn === 'DAT') { mem[l.addr] = l.operand === undefined ? 0 : parseInt(l.operand, 10); continue; }
    if (l.mn in ZERO) { if (l.operand !== undefined) throw new Error(l.mn + ' takes no operand'); mem[l.addr] = ZERO[l.mn]; continue; }
    if (l.operand === undefined) throw new Error(l.mn + ' needs an operand');
    const p = parseOperand(l.operand);
    if (!ALLOWED[l.mn].includes(p.mode)) throw new Error(l.mn + ' does not allow mode ' + p.mode);
    let opr;
    if (p.mode === 1) { opr = p.num; if (opr > 999) throw new Error('immediate too large: ' + opr); }
    else {
      opr = /^\d+$/.test(p.ref) ? parseInt(p.ref, 10) : sym[p.ref];
      if (opr === undefined || opr > 99) throw new Error('bad operand ' + l.operand);
    }
    mem[l.addr] = BASE[l.mn] + p.mode * 10;
    mem[l.addr + 1] = opr;
  }
  return { mem, sym, lines };
}

function run(mem0, inputs, ix0 = 0) {
  const mem = mem0.slice();
  let pc = 0, acc = 0, ix = ix0, steps = 0;
  const out = [], inp = inputs.slice(), rows = [];
  const rd = (a) => { if (a < 0 || a > 99) throw new Error('address out of range ' + a); return mem[a]; };
  while (steps++ < 10000) {
    const at = pc;
    let fetches = 1, dataReads = 0;
    const cir = rd(pc++);
    const op = Math.floor(cir / 100), mode = Math.floor(cir / 10) % 10, sub = cir % 10;
    if (cir === 0) { rows.push({ pc: at, cir, fetches, dataReads }); return { out, rows, mem }; }
    if (op === 9) {
      if (mode !== 0 || sub < 1 || sub > 4) throw new Error('illegal instruction ' + cir);
      if (sub === 1) acc = inp.shift(); else if (sub === 2) out.push(acc); else if (sub === 3) ix++; else acc = ix;
      rows.push({ pc: at, cir, fetches, dataReads, acc, ix });
      continue;
    }
    if (op < 1 || op > 8 || sub !== 0) throw new Error('illegal instruction ' + cir);
    const names = { 1: 'ADD', 2: 'SUB', 3: 'STA', 4: 'LDX', 5: 'LDA', 6: 'BRA', 7: 'BRZ', 8: 'BRP' };
    if (!ALLOWED[names[op]].includes(mode)) throw new Error('illegal mode ' + mode + ' for ' + names[op]);
    const opr = rd(pc++); fetches++;                 // operand fetch: PC advances by 2 in total
    const ea = () => {
      if (mode === 0) return opr;
      if (mode === 2) { const p = rd(opr); dataReads++; return p; }
      if (mode === 3) return opr + ix;
    };
    const val = () => { if (mode === 1) return opr; const e = ea(); dataReads++; return rd(e); };
    if (op === 1) acc += val();
    else if (op === 2) acc -= val();
    else if (op === 3) mem[ea()] = acc;
    else if (op === 4) ix = val();
    else if (op === 5) acc = val();
    else if (op === 6) pc = opr;
    else if (op === 7) { if (acc === 0) pc = opr; }
    else if (op === 8) { if (acc >= 0) pc = opr; }
    rows.push({ pc: at, cir, opr, mode, fetches, dataReads, acc, ix });
  }
  throw new Error('step limit');
}

module.exports = { assemble, run };

if (require.main === module) {
  const dir = process.argv[2];
  const tests = JSON.parse(fs.readFileSync(path.join(dir, process.argv[3] || 'tests.json'), 'utf8'));
  let bad = 0;
  for (const t of tests) {
    let out;
    try {
      const { mem } = assemble(fs.readFileSync(path.join(dir, t.program), 'utf8'));
      out = run(mem, t.inputs).out;
    } catch (e) { out = 'ERROR: ' + e.message; }
    const ok = JSON.stringify(out) === JSON.stringify(t.outputs);
    if (!ok) bad++;
    console.log((ok ? 'PASS ' : 'FAIL ') + t.program + ' in=' + JSON.stringify(t.inputs) + ' out=' + JSON.stringify(out) + ' expected=' + JSON.stringify(t.outputs));
  }
  console.log(bad ? bad + ' FAILED' : 'ALL PASS');
  process.exit(bad ? 1 : 0);
}
