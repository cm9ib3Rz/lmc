import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import tests from '../../programs/tests.json';
import testsX from '../../programs/x/tests-x.json';
import { Machine, assemble, decodeExtended, disassembleExtended, type AssembledProgram } from './index';

const plain = import.meta.glob('../../programs/*.lmc', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const extra = import.meta.glob('../../programs/x/*.lmc', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const all = { ...plain, ...extra };
/** Programs that rewrite their own instructions: the extended LMC's two-word instructions break them. */
const SELF_MODIFYING = new Set(['array-sum-indexed.lmc', 'sieve.lmc']);
const source = (name: string) => {
  const key = Object.keys(all).find((k) => k.endsWith('/' + name));
  if (!key) throw new Error(`No program ${name}`);
  return all[key];
};

function asm(src: string): AssembledProgram {
  const r = assemble(src, { dialect: 'extended' });
  if (!r.ok) throw new Error(r.errors.map((e) => `line ${e.line}: ${e.message}`).join('\n'));
  return r.program;
}
const errs = (src: string) => {
  const r = assemble(src, { dialect: 'extended' });
  if (r.ok) throw new Error('expected assembly to fail');
  return r.errors;
};
function machine(src: string, inputs: number[] = [], pcIncrement: 'early' | 'late' = 'early') {
  const p = asm(src);
  return new Machine(p.memory, { dialect: 'extended', dataAddresses: p.dataAddresses, pcIncrement }, inputs);
}

describe('extended dialect: assembler', () => {
  it('encodes each mode with the mode digit and an operand word', () => {
    const p = asm('LDA #5\nLDA 5\nLDA (5)\nLDA 5,X\nHLT');
    expect(p.memory.slice(0, 9)).toEqual([510, 5, 500, 5, 520, 5, 530, 5, 0]);
    expect(p.lines.map((l) => [l.addr, l.mode, l.words])).toEqual([
      [0, 'immediate', [510, 5]],
      [2, 'direct', [500, 5]],
      [4, 'indirect', [520, 5]],
      [6, 'indexed', [530, 5]],
      [8, undefined, [0]],
    ]);
    expect(p.size).toBe(9);
    expect(p.dialect).toBe('extended');
  });

  it('assembles the new instructions and uses two mailboxes per instruction with an operand', () => {
    const p = asm('LDX #0\nloop LDA data,X\nINX\nTXA\nBRA loop\ndata DAT 4');
    expect(p.symbols).toEqual({ loop: 2, data: 8 });
    expect(p.memory.slice(0, 9)).toEqual([410, 0, 530, 8, 903, 904, 600, 2, 4]);
    expect(p.size).toBe(9);
  });

  it('accepts `data, X` and `data ,X` as indexed', () => {
    expect(asm('LDA data, X\ndata DAT').memory.slice(0, 2)).toEqual([530, 2]);
    expect(asm('LDA data ,X\ndata DAT').memory.slice(0, 2)).toEqual([530, 2]);
  });

  it('is case-insensitive for ,X and keeps the plain aliases', () => {
    expect(asm('LDA 5,x').memory.slice(0, 2)).toEqual([530, 5]);
    expect(asm('STO 5\nLOAD (6)').memory.slice(0, 4)).toEqual([300, 5, 520, 6]);
  });

  it('rejects modes an instruction does not allow, with a reason', () => {
    expect(errs('STA #5')[0].message).toMatch(/cannot take an immediate value/);
    expect(errs('STA #5')[0].message).toMatch(/constant cannot be stored into/);
    expect(errs('BRA (5)')[0].message).toMatch(/BRA cannot take an indirect operand/);
    expect(errs('BRZ 5,X')[0].message).toMatch(/BRZ cannot take an indexed operand/);
    expect(errs('LDX (5)')[0].message).toMatch(/LDX cannot take an indirect operand/);
  });

  it('rejects bad operands and out-of-range values', () => {
    expect(errs('LDA #1000')[0].message).toMatch(/outside 0 to 999/);
    expect(errs('LDA #abc')[0].message).toMatch(/# followed by a number/);
    expect(errs('LDA #-5')[0].message).toMatch(/# followed by a number/);
    expect(errs('LDA (100)')[0].message).toMatch(/out of range/);
    expect(errs('LDA (missing)')[0].message).toMatch(/Undefined label 'missing'/);
    expect(errs('LDA 5,X,X')[0].message).toMatch(/not a valid operand/);
  });

  it('reports a program that is too long, counting two words per instruction', () => {
    const fifty = Array.from({ length: 50 }, () => 'LDA 0').join('\n');
    expect(assemble(fifty, { dialect: 'extended' }).ok).toBe(true); // exactly 100 words: every mailbox is available
    const e = errs(fifty + '\nHLT');
    expect(e[0]).toMatchObject({ line: 51 });
    expect(e[0].message).toMatch(/two/);
  });

  it('accepts everything the standard dialect does, apart from the machine code', () => {
    for (const t of tests) {
      expect(assemble(source(t.program), { dialect: 'extended' }).ok, t.program).toBe(true);
    }
  });

  it('decodes and disassembles', () => {
    expect(decodeExtended(530)).toEqual({ mnemonic: 'LDA', mode: 'indexed', length: 2 });
    expect(decodeExtended(410)).toEqual({ mnemonic: 'LDX', mode: 'immediate', length: 2 });
    expect(decodeExtended(903)).toEqual({ mnemonic: 'INX', length: 1 });
    for (const bad of [310, 420, 640, 505, 840, 906, 998, -1, 1000]) expect(decodeExtended(bad), String(bad)).toBeUndefined();
    expect(disassembleExtended(530, 21, (a) => (a === 21 ? 'data' : undefined))).toBe('LDA data,X');
    expect(disassembleExtended(510, 5)).toBe('LDA #5');
    expect(disassembleExtended(520, 12)).toBe('LDA (12)');
    expect(disassembleExtended(904, undefined)).toBe('TXA');
    expect(disassembleExtended(500, undefined)).toBe('LDA …');
  });
});

describe('extended dialect: machine', () => {
  it('runs every extended example program (programs/x/tests-x.json)', () => {
    for (const t of testsX) {
      const m = machine(source(t.program), t.inputs);
      expect(m.run().reason, t.program).toBe('halted');
      expect(m.output, t.program).toEqual(t.outputs);
    }
  });

  it('runs every plain example unchanged, except the self-modifying ones, which cannot work here', () => {
    for (const t of tests) {
      const m = machine(source(t.program), t.inputs);
      const result = m.run();
      if (SELF_MODIFYING.has(t.program)) {
        const worked = result.reason === 'halted' && JSON.stringify(m.output) === JSON.stringify(t.outputs);
        expect(worked, t.program + ' should not work with two-word instructions').toBe(false);
        if (t.program === 'array-sum-indexed.lmc') expect(m.error).toMatch(/Illegal instruction 501/);
      } else {
        expect(result.reason, t.program).toBe('halted');
        expect(m.output, t.program).toEqual(t.outputs);
      }
    }
  });

  it('matches the LMC-X reference oracle: machine code and memory accesses, instruction by instruction', () => {
    const oracle = createRequire(import.meta.url)('../../docs/reference-oracle/lmcx-oracle.js');
    const cases = [...testsX, ...tests.filter((t) => !SELF_MODIFYING.has(t.program))];
    for (const t of cases) {
      const src = source(t.program);
      const ref = oracle.assemble(src);
      expect(asm(src).memory, t.program + ' machine code').toEqual(ref.mem);

      const rows = oracle.run(ref.mem, t.inputs).rows as { pc: number; cir: number; fetches: number; dataReads: number }[];
      const m = machine(src, t.inputs);
      const actual: number[][] = [];
      while (m.status === 'ready') {
        const steps = m.stepInstruction();
        if (steps.length === 0) break;
        const fetches = steps.filter((s) => s.phase === 'fetch' && s.rtn === 'MDR ← [MAR]').length;
        const dataReads = steps.filter((s) => s.phase === 'execute' && s.read !== undefined).length;
        actual.push([steps[0].addr, m.cir, fetches, dataReads]);
      }
      expect(actual, t.program).toEqual(rows.map((r) => [r.pc, r.cir, r.fetches, r.dataReads]));
    }
  });

  it('LDA needs 3 / 2 / 4 / 3 memory accesses for direct / immediate / indirect / indexed', () => {
    const accesses = (op: string) => {
      const m = machine(`${op}\nHLT\nd DAT 12`);
      return m
        .stepInstruction()
        .filter((s) => s.rtn === 'MDR ← [MAR]').length;
    };
    // counting the opcode fetch, the operand fetch and the data reads
    expect(accesses('LDA d')).toBe(3);
    expect(accesses('LDA #5')).toBe(2);
    expect(accesses('LDA (d)')).toBe(4);
    expect(accesses('LDA d,X')).toBe(3);
  });

  it('shows OCR-style register transfers for each mode, including the operand fetch into the OPR', () => {
    const rtns = (op: string) => machine(`${op}\nHLT\nd DAT 12`).stepInstruction().map((s) => s.rtn);
    const fetchOpcode = ['MAR ← PC', 'PC ← PC + 1', 'MDR ← [MAR]', 'CIR ← MDR', 'decode CIR'];
    const fetchOperand = ['MAR ← PC', 'PC ← PC + 1', 'MDR ← [MAR]', 'OPR ← MDR'];
    expect(rtns('LDA d')).toEqual([...fetchOpcode, ...fetchOperand, 'MAR ← OPR', 'MDR ← [MAR]', 'ACC ← MDR']);
    expect(rtns('LDA #5')).toEqual([...fetchOpcode, ...fetchOperand, 'ACC ← OPR']);
    expect(rtns('LDA (d)')).toEqual([...fetchOpcode, ...fetchOperand, 'MAR ← OPR', 'MDR ← [MAR]', 'MAR ← MDR', 'MDR ← [MAR]', 'ACC ← MDR']);
    expect(rtns('LDA d,X')).toEqual([...fetchOpcode, ...fetchOperand, 'MAR ← OPR + X', 'MDR ← [MAR]', 'ACC ← MDR']);
  });

  it('the operand fetch is a fetch-phase step, so the phase indicator can show it', () => {
    const m = machine('LDA #5\nHLT');
    const phases: string[] = [];
    while (m.atInstructionBoundary || phases.length === 0 || m.status === 'ready') {
      const next = m.nextPhase;
      const step = m.stepMicro();
      if (!step) break;
      expect(step.phase).toBe(next);
      phases.push(step.phase);
      if (step.instructionEnd) break;
    }
    expect(phases).toEqual(['fetch', 'fetch', 'fetch', 'fetch', 'decode', 'fetch', 'fetch', 'fetch', 'fetch', 'execute']);
  });

  it('the PC advances by the instruction length, and the late fetch order applies to the operand fetch too', () => {
    const m = machine('LDA #5\nHLT', [], 'late');
    const steps = m.stepInstruction();
    expect(steps.map((s) => s.rtn)).toEqual([
      'MAR ← PC', 'MDR ← [MAR]', 'CIR ← MDR', 'PC ← PC + 1', 'decode CIR',
      'MAR ← PC', 'MDR ← [MAR]', 'OPR ← MDR', 'PC ← PC + 1', 'ACC ← OPR',
    ]);
    expect(m.pc).toBe(2);
    expect([m.acc, m.opr, m.cir]).toEqual([5, 5, 510]);
  });

  it('indexed and indirect stores write to the effective address', () => {
    const src = 'LDX #2\nLDA #9\nSTA data,X\nSTA (ptr)\nHLT\nptr DAT 30\ndata DAT 0';
    const m = machine(src);
    m.run();
    expect(m.memory[asm(src).symbols.data + 2]).toBe(9);
    expect(m.memory[30]).toBe(9);
  });

  it('INX, TXA and LDX work on the index register', () => {
    const m = machine('LDX #5\nINX\nINX\nTXA\nOUT\nHLT');
    m.run();
    expect(m.output).toEqual([7]);
    expect(m.x).toBe(7);
  });

  it('LDX direct loads the index register from memory', () => {
    const m = machine('LDX five\nTXA\nOUT\nHLT\nfive DAT 5');
    m.run();
    expect(m.output).toEqual([5]);
  });

  it('errors clearly on bad effective addresses (no wrap-around)', () => {
    const idx = machine('LDX #5\nLDA 99,X\nHLT');
    expect(idx.run().reason).toBe('error');
    expect(idx.error).toMatch(/no mailbox 104/);
    expect(idx.error).toMatch(/99 \+ X, and X is 5/);

    const ptr = machine('LDA (p)\nHLT\np DAT 500');
    expect(ptr.run().reason).toBe('error');
    expect(ptr.error).toMatch(/no mailbox 500/);

    const store = machine('LDX #99\nSTA 5,X\nHLT');
    expect(store.run().reason).toBe('error');
    expect(store.error).toMatch(/no mailbox 104 to store into/);
  });

  it('branching into an operand word is an illegal instruction', () => {
    const m = machine('BRA 1\nHLT');
    expect(m.run().reason).toBe('error');
    expect(m.error).toMatch(/Illegal instruction 1 at mailbox 01/);
  });

  it('reads past the end of memory when an operand word would be at mailbox 100', () => {
    const memory = new Array<number>(100).fill(0);
    memory[0] = 600; // BRA 99
    memory[1] = 99;
    memory[99] = 500; // LDA ..., whose operand word would be mailbox 100
    const m = new Machine(memory, { dialect: 'extended' });
    expect(m.run().reason).toBe('error');
    expect(m.error).toMatch(/ran past the end of memory/);
  });

  it('snapshot/restore covers X and OPR, and reset clears them', () => {
    const m = machine('LDX #3\nLDA #1\nHLT');
    m.stepInstruction();
    const snap = m.snapshot();
    expect([m.x, m.opr]).toEqual([3, 3]);
    m.run();
    m.restore(snap);
    expect([m.x, m.opr]).toEqual([3, 3]);
    m.reset();
    expect([m.x, m.opr]).toEqual([0, 0]);
  });

  it('the standard dialect never touches X or OPR', () => {
    const p = assemble('INP\nOUT\nHLT');
    if (!p.ok) throw new Error('assemble');
    const m = new Machine(p.program.memory, {}, [4]);
    m.run();
    expect([m.x, m.opr]).toEqual([0, 0]);
    expect(m.dialect).toBe('standard');
  });
});
