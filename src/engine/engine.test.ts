import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import tests from '../../programs/tests.json';
import { Machine, assemble, disassemble, type AssembledProgram } from './index';

const sources = import.meta.glob('../../programs/*.lmc', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const programSource = (name: string) => {
  const key = Object.keys(sources).find((k) => k.endsWith('/' + name));
  if (!key) throw new Error(`No program ${name}`);
  return sources[key];
};

function assembleOk(src: string): AssembledProgram {
  const result = assemble(src);
  if (!result.ok) throw new Error(result.errors.map((e) => `line ${e.line}: ${e.message}`).join('\n'));
  return result.program;
}

function errorsOf(src: string) {
  const result = assemble(src);
  if (result.ok) throw new Error('expected assembly to fail');
  return result.errors;
}

function machineFor(src: string, inputs: number[] = []) {
  const program = assembleOk(src);
  return new Machine(program.memory, { dataAddresses: program.dataAddresses }, inputs);
}

describe('example programs (programs/tests.json)', () => {
  for (const t of tests) {
    it(`${t.program} with inputs [${t.inputs}]`, () => {
      const m = machineFor(programSource(t.program), t.inputs);
      const result = m.run();
      expect(result.reason).toBe('halted');
      expect(m.output).toEqual(t.outputs);
    });
  }

  it('matches the throwaway reference oracle instruction by instruction', () => {
    const oracle = createRequire(import.meta.url)('../../docs/reference-oracle/lmc-oracle.js');
    for (const t of tests) {
      const src = programSource(t.program);
      const rows = oracle.run(oracle.assemble(src).mem, t.inputs).rows as { pc: number; cir: number; accAfter: number; pcAfter: number }[];
      const expected = rows.map(({ pc, cir, accAfter, pcAfter }) => ({ pc, cir, accAfter, pcAfter }));

      const m = machineFor(src, t.inputs);
      const actual: typeof expected = [];
      while (m.status === 'ready') {
        const steps = m.stepInstruction();
        if (steps.length === 0) break;
        actual.push({ pc: steps[0].addr, cir: m.cir, accAfter: m.acc, pcAfter: m.pc });
      }
      expect(actual, t.program).toEqual(expected);
    }
  });
});

describe('assembler', () => {
  it('assembles countdown.lmc to the documented listing', () => {
    const p = assembleOk(programSource('countdown.lmc'));
    expect(p.memory.slice(0, 7)).toEqual([901, 705, 902, 206, 601, 0, 1]);
    expect(p.symbols).toEqual({ loop: 1, end: 5, one: 6 });
    expect(p.memory.slice(7).every((w) => w === 0)).toBe(true);
    expect(p.memory).toHaveLength(100);
    expect(p.dataAddresses).toEqual([6]);
  });

  it('records source line numbers and labels', () => {
    const p = assembleOk('// hello\n\nstart INP\n  OUT\n  HLT');
    expect(p.lines.map((l) => [l.line, l.addr, l.mnemonic, l.label])).toEqual([
      [3, 0, 'INP', 'start'],
      [4, 1, 'OUT', undefined],
      [5, 2, 'HLT', undefined],
    ]);
  });

  it('is case-insensitive for mnemonics and labels, and accepts COB', () => {
    const p = assembleOk('Loop inp\n sta X\n bra LOOP\n cob\nx dat');
    expect(p.memory.slice(0, 5)).toEqual([901, 304, 600, 0, 0]);
  });

  it('accepts numeric operands and DAT values, including negatives', () => {
    const p = assembleOk('LDA 2\nHLT\nDAT -7');
    expect(p.memory.slice(0, 3)).toEqual([502, 0, -7]);
  });

  it('reports every error with its line number', () => {
    const errors = errorsOf('INP\nADD missing\nHLT 5\nSTA\nx DAT\nx DAT');
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 6]);
    expect(errors[0].message).toMatch(/Undefined label 'missing'/);
    expect(errors[1].message).toMatch(/does not take an operand/);
    expect(errors[2].message).toMatch(/needs an operand/);
    expect(errors[3].message).toMatch(/already defined/);
  });

  it('rejects bad labels, unknown instructions and out-of-range values', () => {
    expect(errorsOf('9lives INP')[0].message).toMatch(/cannot start with a digit/);
    expect(errorsOf('add ADD x')[0].message).toMatch(/instruction name/);
    expect(errorsOf('LDX 5')[0].message).toMatch(/Unknown instruction 'LDX'/);
    expect(errorsOf('OTU')[0].message).toMatch(/Unknown instruction 'OTU'/);
    expect(errorsOf('LDA 100')[0].message).toMatch(/out of range/);
    expect(errorsOf('x DAT 1000')[0].message).toMatch(/outside/);
    expect(errorsOf('x DAT abc')[0].message).toMatch(/whole number/);
    expect(errorsOf('LDA 1 2')[0].message).toMatch(/Unexpected '2'/);
  });

  it('rejects an empty program and one that is too long', () => {
    expect(errorsOf('// nothing here\n')[0].message).toMatch(/empty/);
    const long = Array.from({ length: 101 }, () => 'DAT').join('\n');
    expect(errorsOf(long)[0]).toMatchObject({ line: 101 });
    expect(assemble(Array.from({ length: 100 }, () => 'DAT').join('\n')).ok).toBe(true);
  });

  it('disassembles machine words', () => {
    expect(disassemble(705)).toBe('BRZ 5');
    expect(disassemble(901)).toBe('INP');
    expect(disassemble(902)).toBe('OUT');
    expect(disassemble(0)).toBe('HLT');
    expect(disassemble(410)).toBeUndefined();
    expect(disassemble(903)).toBeUndefined();
    expect(disassemble(-5)).toBeUndefined();
    expect(disassemble(305, (a) => (a === 5 ? 'total' : undefined))).toBe('STA total');
  });
});

describe('machine: micro-steps', () => {
  it('shows the fetch-decode-execute cycle for LDA', () => {
    const m = machineFor('LDA x\nHLT\nx DAT 7');
    const steps = m.stepInstruction();
    expect(steps.map((s) => [s.phase, s.rtn])).toEqual([
      ['fetch', 'MAR ← PC'],
      ['fetch', 'MDR ← [MAR]'],
      ['fetch', 'CIR ← MDR'],
      ['fetch', 'PC ← PC + 1'],
      ['decode', 'decode CIR'],
      ['execute', 'MAR ← 02'],
      ['execute', 'MDR ← [MAR]'],
      ['execute', 'ACC ← MDR'],
    ]);
    expect(steps.map((s) => s.instructionEnd)).toEqual([false, false, false, false, false, false, false, true]);
    expect(steps[1]).toMatchObject({ read: 0, detail: 'MDR ← [00] = 502' });
    expect(steps[6]).toMatchObject({ read: 2, detail: 'MDR ← [02] = 7' });
    expect(steps[7].changes).toEqual([{ reg: 'ACC', from: 0, to: 7 }]);
    expect([m.pc, m.acc, m.mar, m.mdr, m.cir]).toEqual([1, 7, 2, 7, 502]);
    expect(m.instructionCount).toBe(1);
    expect(m.microCount).toBe(8);
  });

  it('STA writes the accumulator to memory', () => {
    const m = machineFor('INP\nSTA x\nHLT\nx DAT', [42]);
    m.stepInstruction();
    const steps = m.stepInstruction();
    expect(steps.map((s) => s.rtn)).toEqual([
      'MAR ← PC', 'MDR ← [MAR]', 'CIR ← MDR', 'PC ← PC + 1', 'decode CIR', 'MAR ← 03', 'MDR ← ACC', '[MAR] ← MDR',
    ]);
    expect(steps[7]).toMatchObject({ write: 3, detail: '[03] ← 42' });
    expect(m.memory[3]).toBe(42);
  });

  it('branches overwrite the PC after it was incremented', () => {
    const m = machineFor('BRA 5\nHLT\nHLT\nHLT\nHLT\nHLT');
    const steps = m.stepInstruction();
    expect(steps[3].changes).toEqual([{ reg: 'PC', from: 0, to: 1 }]);
    expect(steps[5].changes).toEqual([{ reg: 'PC', from: 1, to: 5 }]);
    expect(m.pc).toBe(5);
  });

  it('BRZ and BRP branch only when their condition holds', () => {
    const brz = (acc: number) => {
      const m = machineFor(`INP\nSUB one\nBRZ 5\nOUT\nHLT\nHLT\none DAT 1`, [acc]);
      m.stepInstruction();
      m.stepInstruction();
      const steps = m.stepInstruction();
      return { pc: m.pc, detail: steps.at(-1)!.detail, changes: steps.at(-1)!.changes };
    };
    expect(brz(1)).toMatchObject({ pc: 5, detail: 'ACC = 0, so PC ← 05' });
    expect(brz(5)).toMatchObject({ pc: 3, detail: 'ACC = 4, not zero, so PC is unchanged', changes: [] });

    const brp = (acc: number) => {
      const m = machineFor(`INP\nSUB two\nBRP 5\nOUT\nHLT\nHLT\ntwo DAT 2`, [acc]);
      m.stepInstruction();
      m.stepInstruction();
      m.stepInstruction();
      return m.pc;
    };
    expect(brp(2)).toBe(5); // 0 counts as "positive"
    expect(brp(9)).toBe(5);
    expect(brp(1)).toBe(3); // -1 falls through
  });

  it('OUT reports the value on the step', () => {
    const m = machineFor('INP\nOUT\nHLT', [9]);
    m.stepInstruction();
    const steps = m.stepInstruction();
    expect(steps.at(-1)).toMatchObject({ output: 9, detail: 'output ← 9' });
    expect(m.output).toEqual([9]);
  });

  it('HLT stops the machine and further steps do nothing', () => {
    const m = machineFor('HLT');
    const steps = m.stepInstruction();
    expect(steps.at(-1)).toMatchObject({ rtn: 'stop', instructionEnd: true });
    expect(m.status).toBe('halted');
    expect(m.stepMicro()).toBeNull();
    expect(m.instructionCount).toBe(1);
  });
});

describe('machine: input, errors and limits', () => {
  it('blocks on INP until input arrives, without changing state', () => {
    const m = machineFor('INP\nOUT\nHLT');
    m.stepInstruction();
    expect(m.status).toBe('waiting-input');
    expect(m.microCount).toBe(5);
    expect(m.stepMicro()).toBeNull();
    expect(m.acc).toBe(0);

    m.pushInput(17);
    expect(m.status).toBe('ready');
    expect(m.run().reason).toBe('halted');
    expect(m.output).toEqual([17]);
  });

  it('run() reports waiting-input rather than looping', () => {
    const m = machineFor('INP\nOUT\nHLT');
    expect(m.run()).toEqual({ reason: 'waiting-input', instructions: 0 });
  });

  it('validates input', () => {
    const m = machineFor('HLT');
    expect(() => m.pushInput(-1)).toThrow(RangeError);
    expect(() => m.pushInput(1000)).toThrow(RangeError);
    expect(() => m.pushInput(1.5)).toThrow(RangeError);
    expect(() => m.pushInput(999)).not.toThrow();
    const neg = new Machine(assembleOk('HLT').memory, { allowNegativeInput: true });
    expect(() => neg.pushInput(-999)).not.toThrow();
  });

  it('halts with an error on an illegal instruction', () => {
    const m = machineFor('DAT 410');
    const steps = m.stepInstruction();
    expect(m.status).toBe('error');
    expect(steps.at(-1)!.error).toMatch(/Illegal instruction 410 at mailbox 00/);
    expect(m.run().reason).toBe('error');
  });

  it('warns, but carries on, when a DAT is executed', () => {
    const m = machineFor('DAT');
    const steps = m.stepInstruction();
    expect(steps.find((s) => s.phase === 'decode')!.warning).toMatch(/DAT/);
    expect(m.status).toBe('halted');
  });

  it('errors when the PC runs off the end of memory', () => {
    const m = new Machine(assembleOk(Array.from({ length: 100 }, () => 'LDA 0').join('\n')).memory);
    const result = m.run();
    expect(result.reason).toBe('error');
    expect(m.error).toMatch(/past the end of memory/);
    expect(result.instructions).toBe(100);
  });

  it('warns on accumulator overflow by default and can halt instead', () => {
    const src = 'INP\nADD x\nHLT\nx DAT 999';
    const warn = machineFor(src, [5]);
    const steps = warn.stepInstruction().concat(warn.stepInstruction());
    expect(steps.at(-1)!.warning).toMatch(/1004/);
    expect(warn.acc).toBe(1004);
    expect(warn.status).toBe('ready');

    const program = assembleOk(src);
    const strict = new Machine(program.memory, { overflow: 'error' }, [5]);
    expect(strict.run().reason).toBe('error');
  });

  it('stops an infinite loop at the instruction limit', () => {
    const m = machineFor('loop BRA loop');
    expect(m.run({ maxInstructions: 50 })).toEqual({ reason: 'step-limit', instructions: 50 });
    expect(m.status).toBe('ready');
    expect(m.run({ maxInstructions: 10 }).instructions).toBe(10);
  });

  it('stops at breakpoints and resumes past them', () => {
    const m = machineFor(programSource('countdown.lmc'), [3]);
    const breakpoints = new Set([2]); // OUT
    expect(m.run({ breakpoints })).toEqual({ reason: 'breakpoint', instructions: 2 });
    expect(m.pc).toBe(2);
    expect(m.output).toEqual([]);
    expect(m.run({ breakpoints }).reason).toBe('breakpoint');
    expect(m.output).toEqual([3]);
    expect(m.run().reason).toBe('halted');
    expect(m.output).toEqual([3, 2, 1]);
  });

  it('snapshot/restore rewinds mid-instruction', () => {
    const m = machineFor('INP\nADD x\nOUT\nHLT\nx DAT 1', [4]);
    m.stepInstruction();
    m.stepMicro();
    m.stepMicro();
    const snap = m.snapshot();
    m.run();
    expect(m.output).toEqual([5]);
    m.restore(snap);
    expect(m.snapshot()).toEqual(snap);
    expect(m.output).toEqual([]);
    expect(m.run().reason).toBe('halted');
    expect(m.output).toEqual([5]);
  });

  it('reset() restores memory, registers and the original inbox', () => {
    const m = machineFor('INP\nSTA x\nOUT\nHLT\nx DAT 1', [8]);
    m.run();
    expect(m.memory[4]).toBe(8);
    m.reset();
    expect(m.memory[4]).toBe(1);
    expect([m.pc, m.acc, m.status, m.output.length, m.input.length]).toEqual([0, 0, 'ready', 0, 1]);
    m.run();
    expect(m.output).toEqual([8]);
    m.reset([3]);
    m.run();
    expect(m.output).toEqual([3]);
  });
});

describe('HCF (undocumented halt and catch fire)', () => {
  it('assembles to 999 and disassembles back', () => {
    expect(assembleOk('HCF').memory[0]).toBe(999);
    expect(disassemble(999)).toBe('HCF');
    expect(errorsOf('HCF 5')[0].message).toMatch(/does not take an operand/);
  });

  it('halts the machine and sets it on fire', () => {
    const m = machineFor('INP\nOUT\nHCF\nHLT', [4]);
    const steps = m.stepInstruction().concat(m.stepInstruction(), m.stepInstruction());
    expect(steps.at(-1)).toMatchObject({ rtn: 'halt and catch fire', fire: true, instructionEnd: true });
    expect(steps.filter((s) => s.fire)).toHaveLength(1);
    expect(m.status).toBe('halted');
    expect(m.onFire).toBe(true);
    expect(m.output).toEqual([4]);
    expect(m.pc).toBe(3); // the HLT after it never runs
    expect(m.instructionCount).toBe(3);
    expect(m.stepMicro()).toBeNull();
  });

  it('is what you get when data 999 is executed', () => {
    const m = machineFor('DAT 999');
    const steps = m.stepInstruction();
    expect(m.onFire).toBe(true);
    expect(steps.find((s) => s.phase === 'decode')!.warning).toMatch(/DAT/);
  });

  it('survives snapshot/restore and is cleared by reset', () => {
    const m = machineFor('INP\nHCF', [1]);
    m.stepInstruction();
    const before = m.snapshot();
    m.stepInstruction();
    const burnt = m.snapshot();
    expect(burnt.onFire).toBe(true);
    m.restore(before);
    expect(m.onFire).toBe(false);
    m.restore(burnt);
    expect(m.onFire).toBe(true);
    m.reset();
    expect(m.onFire).toBe(false);
    expect(m.status).toBe('ready');
  });

  it('does not affect ordinary illegal instructions', () => {
    const m = machineFor('DAT 903');
    m.stepInstruction();
    expect(m.status).toBe('error');
    expect(m.onFire).toBe(false);
  });
});

describe('machine: poke (editing a mailbox by hand)', () => {
  it('changes a mailbox and is undone by reset', () => {
    const m = machineFor('LDA x\nOUT\nHLT\nx DAT 7');
    m.poke(3, 42);
    expect(m.memory[3]).toBe(42);
    m.run();
    expect(m.output).toEqual([42]);
    m.reset();
    expect(m.memory[3]).toBe(7);
  });

  it('can rewrite an instruction', () => {
    const m = machineFor('INP\nOUT\nHLT');
    m.poke(1, 0); // OUT becomes HLT
    m.reset([5]);
    m.poke(1, 0);
    m.run();
    expect(m.output).toEqual([]);
    expect(m.instructionCount).toBe(2);
  });

  it('is captured by snapshots', () => {
    const m = machineFor('HLT\nDAT 1');
    const before = m.snapshot();
    m.poke(1, 9);
    m.restore(before);
    expect(m.memory[1]).toBe(1);
  });

  it('rejects bad addresses and values', () => {
    const m = machineFor('HLT');
    expect(() => m.poke(100, 1)).toThrow(RangeError);
    expect(() => m.poke(-1, 1)).toThrow(RangeError);
    expect(() => m.poke(0, 1000)).toThrow(RangeError);
    expect(() => m.poke(0, -1000)).toThrow(RangeError);
    expect(() => m.poke(0, 1.5)).toThrow(RangeError);
    expect(() => m.poke(0, -999)).not.toThrow();
  });
});

describe("OCR alternative mnemonics (spec Appendix 5d)", () => {
  it('accepts every alternative and normalises it', () => {
    const p = assembleOk('STO x\nLOAD x\nBR x\nBZ x\nBP x\nIN\nINPUT\nEND\nCOB\nx DAT');
    expect(p.memory.slice(0, 10)).toEqual([309, 509, 609, 709, 809, 901, 901, 0, 0, 0]);
    expect(p.lines.slice(0, 9).map((l) => l.mnemonic)).toEqual(['STA', 'LDA', 'BRA', 'BRZ', 'BRP', 'INP', 'INP', 'HLT', 'HLT']);
  });

  it('still lets an alias be a label or an operand', () => {
    const p = assembleOk('INP\nBRZ end\nOUT\nend HLT');
    expect(p.memory.slice(0, 4)).toEqual([901, 703, 902, 0]);
    expect(p.symbols).toEqual({ end: 3 });
    expect(assembleOk('BR end\nend HLT').memory.slice(0, 2)).toEqual([601, 0]);
    expect(assembleOk('in INP\nBRA in').memory.slice(0, 2)).toEqual([901, 600]);
  });

  it('does not let a real mnemonic be a label', () => {
    expect(errorsOf('add ADD x')[0].message).toMatch(/instruction name/);
    expect(errorsOf('inp INP')[0].message).toMatch(/instruction name/);
  });
});

describe('registers follow OCR\'s description of the cycle', () => {
  it('fetch: PC copied to MAR, instruction read into MDR then CIR, PC incremented', () => {
    const m = machineFor('LDA x\nHLT\nx DAT 7');
    m.stepMicro(); // MAR <- PC
    expect([m.mar, m.pc, m.mdr, m.cir]).toEqual([0, 0, 0, 0]);
    expect([m.mar, m.pc]).toEqual([0, 0]);
    m.stepMicro(); // MDR <- [MAR]
    expect([m.mdr, m.cir]).toEqual([502, 0]);
    m.stepMicro(); // CIR <- MDR
    expect([m.cir, m.pc]).toEqual([502, 0]);
    m.stepMicro(); // PC <- PC + 1 (last, as in OCR's delivery guide)
    expect(m.pc).toBe(1);
  });

  it('the address part of the CIR goes to the MAR, and data comes back through the MDR', () => {
    const m = machineFor('LDA x\nHLT\nx DAT 7');
    const steps = m.stepInstruction();
    const load = steps.filter((s) => s.phase === 'execute');
    expect(load[0]).toMatchObject({ rtn: 'MAR ← 02', detail: 'MAR ← 02 (the address part of the CIR)' });
    expect(load[1].changes).toEqual([{ reg: 'MDR', from: 502, to: 7 }]);
    expect(load[2].changes).toEqual([{ reg: 'ACC', from: 0, to: 7 }]);
    expect(m.mar).toBe(2);
  });

  it('a store goes ACC -> MDR -> memory at the address in the MAR', () => {
    const m = machineFor('INP\nSTA x\nHLT\nx DAT', [9]);
    m.stepInstruction();
    const exec = m.stepInstruction().filter((s) => s.phase === 'execute');
    expect(exec.map((s) => s.rtn)).toEqual(['MAR ← 03', 'MDR ← ACC', '[MAR] ← MDR']);
    expect(exec[1].changes).toEqual([{ reg: 'MDR', from: 303, to: 9 }]); // 303 = the STA instruction itself
    expect(exec[2]).toMatchObject({ write: 3 });
  });

  it('input and output use the accumulator only; MAR and MDR are left alone', () => {
    const m = machineFor('INP\nOUT\nHLT', [5]);
    const inp = m.stepInstruction();
    const out = m.stepInstruction();
    for (const step of [inp.at(-1)!, out.at(-1)!]) {
      expect(step.changes.every((c) => c.reg === 'ACC')).toBe(true);
    }
    expect(inp.at(-1)!.changes).toEqual([{ reg: 'ACC', from: 0, to: 5 }]);
    expect(out.at(-1)!.changes).toEqual([]);
    expect(m.output).toEqual([5]);
  });

  it('a branch loads the PC from the CIR and does not use the MAR', () => {
    const m = machineFor('BRA 5\nHLT\nHLT\nHLT\nHLT\nHLT');
    const exec = m.stepInstruction().filter((s) => s.phase === 'execute');
    expect(exec).toHaveLength(1);
    expect(exec[0].changes).toEqual([{ reg: 'PC', from: 1, to: 5 }]);
    expect(m.mar).toBe(0); // still the address the instruction was fetched from
  });

  it('BRP branches when the accumulator is zero or positive (OCR 2021 mark scheme, Q6a ii)', () => {
    const run = (n: number) => {
      const m = machineFor('INP\nSUB two\nBRP yes\nOUT\nHLT\nyes DAT 0\ntwo DAT 2', [n]);
      // 'yes' is data (000 = HLT), so a taken branch halts without OUT
      m.run();
      return m.output.length;
    };
    expect(run(3)).toBe(0); // 1: positive, branch
    expect(run(2)).toBe(0); // 0: zero, branch
    expect(run(1)).toBe(1); // -1: negative, falls through to OUT
  });

  it('a larger-of-two program with its branch the wrong way round outputs the smaller number', () => {
    const buggy = `INP
STA first
INP
STA second
SUB first
BRP keepfirst
LDA second
BRA done
keepfirst LDA first
done OUT
HLT
first DAT
second DAT`;
    const outputFor = (a: number, b: number) => {
      const m = machineFor(buggy, [a, b]);
      m.run();
      return m.output;
    };
    expect(outputFor(4, 9)).toEqual([4]);
    expect(outputFor(9, 4)).toEqual([4]);
    // fixed: load the larger one on each branch
    const fixed = buggy.replace('BRP keepfirst', 'BRP keepsecond').replace('keepfirst LDA first', 'keepsecond LDA second').replace('LDA second\nBRA done', 'LDA first\nBRA done');
    const m = machineFor(fixed, [4, 9]);
    m.run();
    expect(m.output).toEqual([9]);
  });
});

describe('the standard LMC: operands are labels or mailbox numbers', () => {
  it('rejects #5, (5) and 5,X with an explanation that does not use the extended vocabulary', () => {
    const imm = errorsOf('ADD #1');
    expect(imm[0].line).toBe(1);
    expect(imm[0].message).toMatch(/must be a label or a mailbox number/);
    expect(imm[0].message).toMatch(/one DAT 1/);
    expect(errorsOf('LDA (5)')[0].message).toMatch(/must be a label or a mailbox number/);
    expect(errorsOf('LDA 5,X')[0].message).toMatch(/must be a label or a mailbox number/);
    expect(errorsOf('BRA #5')[0].message).toMatch(/must be a label or a mailbox number/);
    expect(errorsOf('LDA 5$')[0].message).toMatch(/not a valid label or mailbox address/);
    // the standard LMC never talks about addressing modes
    for (const src of ['ADD #1', 'LDA (5)', 'LDA 5,X']) {
      expect(errorsOf(src)[0].message).not.toMatch(/immediate|indirect|indexed|addressing/i);
    }
  });

  it('has no LDX, INX or TXA', () => {
    expect(errorsOf('INX')[0].message).toMatch(/Unknown instruction/);
    expect(errorsOf('TXA')[0].message).toMatch(/Unknown instruction/);
  });

  it('the documented way to add a constant works', () => {
    const m = machineFor('INP\nADD one\nOUT\nHLT\none DAT 1', [41]);
    m.run();
    expect(m.output).toEqual([42]);
  });
});

describe('alias words used as labels', () => {
  it('reads `end END`, `in IN` and `quit COB` as a label followed by an instruction', () => {
    expect(assembleOk('BZ end\nend END').memory.slice(0, 2)).toEqual([701, 0]);
    expect(assembleOk('in IN').memory[0]).toBe(901);
    expect(assembleOk('quit COB').memory[0]).toBe(0);
  });

  it('still reads `BR end` and `LOAD end` as an instruction and its operand', () => {
    expect(assembleOk('BR end\nend END').memory.slice(0, 2)).toEqual([601, 0]);
    expect(assembleOk('LOAD end\nend END').memory.slice(0, 2)).toEqual([501, 0]);
    expect(assembleOk('BRZ end\nend HLT').memory.slice(0, 2)).toEqual([701, 0]);
  });
});

describe('fetch order: PC increment last (default, OCR delivery guide) or early (some textbooks)', () => {
  const early = (src: string, inputs: number[] = []) => {
    const program = assembleOk(src);
    return new Machine(program.memory, { dataAddresses: program.dataAddresses, pcIncrement: 'early' }, inputs);
  };
  const late = (src: string, inputs: number[] = []) => {
    const program = assembleOk(src);
    return new Machine(program.memory, { dataAddresses: program.dataAddresses, pcIncrement: 'late' }, inputs);
  };

  it('defaults to late, which is OCR\'s order', () => {
    expect(machineFor('HLT').pcIncrement).toBe('late');
  });

  it('early order: MAR ← PC, PC ← PC + 1, MDR ← [MAR], CIR ← MDR', () => {
    const m = early('LDA x\nHLT\nx DAT 7');
    expect(m.stepInstruction().map((s) => s.rtn).slice(0, 5)).toEqual(['MAR ← PC', 'PC ← PC + 1', 'MDR ← [MAR]', 'CIR ← MDR', 'decode CIR']);
  });

  it('late order: MAR ← PC, MDR ← [MAR], CIR ← MDR, then PC ← PC + 1', () => {
    const m = late('LDA x\nHLT\nx DAT 7');
    const steps = m.stepInstruction();
    expect(steps.map((s) => s.rtn)).toEqual([
      'MAR ← PC', 'MDR ← [MAR]', 'CIR ← MDR', 'PC ← PC + 1', 'decode CIR', 'MAR ← 02', 'MDR ← [MAR]', 'ACC ← MDR',
    ]);
    expect(steps[3].changes).toEqual([{ reg: 'PC', from: 0, to: 1 }]);
    expect(steps[3].detail).toBe('PC ← 00 + 1 = 01');
    expect([m.pc, m.acc, m.mar, m.mdr, m.cir]).toEqual([1, 7, 2, 7, 502]);
  });

  it('runs every example program to the same output as the default order', () => {
    for (const t of tests) {
      const m = early(programSource(t.program), t.inputs);
      expect(m.run().reason, t.program).toBe('halted');
      expect(m.output, t.program).toEqual(t.outputs);
    }
  });

  it('agrees with the default order after every instruction', () => {
    for (const t of tests) {
      const src = programSource(t.program);
      const a = machineFor(src, t.inputs);
      const b = early(src, t.inputs);
      while (a.status === 'ready' && b.status === 'ready') {
        a.stepInstruction();
        b.stepInstruction();
        expect([b.pc, b.acc, b.mar, b.mdr, b.cir], t.program).toEqual([a.pc, a.acc, a.mar, a.mdr, a.cir]);
      }
      expect(b.status).toBe(a.status);
    }
  });

  it('still reports running off the end of memory, and can be switched then reset', () => {
    const program = assembleOk(Array.from({ length: 100 }, () => 'LDA 0').join('\n'));
    const m = new Machine(program.memory, { pcIncrement: 'late' });
    expect(m.run().reason).toBe('error');
    expect(m.error).toMatch(/past the end of memory/);
    m.pcIncrement = 'early';
    m.reset();
    expect(m.stepInstruction().map((s) => s.rtn).slice(0, 2)).toEqual(['MAR ← PC', 'PC ← PC + 1']);
  });
});

describe('bus activity (spec 1.1.1(a): data, address and control buses)', () => {
  it('memory reads show the address, data and control buses', () => {
    const m = machineFor('LDA x\nHLT\nx DAT 7');
    const steps = m.stepInstruction();
    const fetch = steps[1];
    expect(fetch.rtn).toBe('MDR ← [MAR]');
    expect(fetch.bus).toEqual({ address: '00: MAR → memory', data: '502: memory → MDR', control: 'memory read' });
    const load = steps[6];
    expect(load.bus).toEqual({ address: '02: MAR → memory', data: '7: memory → MDR', control: 'memory read' });
  });

  it('a store writes on the buses in the other direction', () => {
    const m = machineFor('INP\nSTA x\nHLT\nx DAT', [9]);
    m.stepInstruction();
    const steps = m.stepInstruction();
    expect(steps.at(-1)!.bus).toEqual({ address: '03: MAR → memory', data: '9: MDR → memory', control: 'memory write' });
  });

  it('only steps that touch memory have bus activity', () => {
    const m = machineFor('INP\nOUT\nBRA 3\nHLT', [1]);
    const all = [...m.stepInstruction(), ...m.stepInstruction(), ...m.stepInstruction()];
    const withBus = all.filter((s) => s.bus);
    // exactly the three instruction fetches: INP, OUT and BRA read no data from memory
    expect(withBus.map((s) => s.rtn)).toEqual(['MDR ← [MAR]', 'MDR ← [MAR]', 'MDR ← [MAR]']);
  });
});
