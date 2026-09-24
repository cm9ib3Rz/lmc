// Throwaway reference LMC assembler + interpreter, used only to verify the example programs.
const fs = require('fs');
const path = require('path');
const OPS = { ADD: 100, SUB: 200, STA: 300, LDA: 500, BRA: 600, BRZ: 700, BRP: 800, INP: 901, OUT: 902, HLT: 0, COB: 0, DAT: null };

function assemble(src) {
  const lines = [];
  for (const raw of src.split(/\r?\n/)) {
    const t = raw.replace(/\/\/.*$/, '').trim();
    if (!t) continue;
    const parts = t.split(/\s+/);
    let label = null;
    if (!(parts[0].toUpperCase() in OPS)) label = parts.shift();
    const mn = parts.shift().toUpperCase();
    lines.push({ label, mn, operand: parts[0] });
  }
  const sym = {};
  lines.forEach((l, i) => { if (l.label) sym[l.label] = i; });
  const mem = new Array(100).fill(0);
  lines.forEach((l, i) => {
    if (l.mn === 'DAT') mem[i] = l.operand === undefined ? 0 : parseInt(l.operand, 10);
    else if (l.mn === 'INP' || l.mn === 'OUT' || l.mn === 'HLT' || l.mn === 'COB') mem[i] = OPS[l.mn];
    else {
      const a = /^\d+$/.test(l.operand) ? parseInt(l.operand, 10) : sym[l.operand];
      if (a === undefined) throw new Error('undefined label ' + l.operand);
      mem[i] = OPS[l.mn] + a;
    }
  });
  return { mem, sym, lines };
}

function run(mem0, inputs, trace) {
  const mem = mem0.slice(); let pc = 0, acc = 0, out = [], inp = inputs.slice(), steps = 0, rows = [];
  while (steps++ < 10000) {
    const mar = pc, cir = mem[mar]; pc++;
    const op = Math.floor(cir / 100), ad = cir % 100;
    const before = { pc: mar, cir, acc };
    let halted = false;
    if (cir === 0) halted = true;
    else if (op === 1) acc += mem[ad];
    else if (op === 2) acc -= mem[ad];
    else if (op === 3) mem[ad] = acc;
    else if (op === 5) acc = mem[ad];
    else if (op === 6) pc = ad;
    else if (op === 7) { if (acc === 0) pc = ad; }
    else if (op === 8) { if (acc >= 0) pc = ad; }
    else if (cir === 901) acc = inp.shift();
    else if (cir === 902) out.push(acc);
    else throw new Error('bad instruction ' + cir);
    rows.push({ ...before, accAfter: acc, pcAfter: pc });
    if (halted) return { out, rows, mem };
  }
  throw new Error('step limit');
}

module.exports = { assemble, run };

if (require.main === module) {
  const dir = process.argv[2];
  const tests = JSON.parse(fs.readFileSync(path.join(dir, 'tests.json'), 'utf8'));
  let bad = 0;
  for (const t of tests) {
    const { mem } = assemble(fs.readFileSync(path.join(dir, t.program), 'utf8'));
    const { out } = run(mem, t.inputs);
    const ok = JSON.stringify(out) === JSON.stringify(t.outputs);
    if (!ok) bad++;
    console.log((ok ? 'PASS ' : 'FAIL ') + t.program + ' in=' + JSON.stringify(t.inputs) + ' out=' + JSON.stringify(out) + ' expected=' + JSON.stringify(t.outputs));
  }
  console.log(bad ? bad + ' FAILED' : 'ALL PASS');
  process.exit(bad ? 1 : 0);
}
