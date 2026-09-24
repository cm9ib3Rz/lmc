import { describe, expect, it } from 'vitest';
import { explainWord } from '../explain';
import { Machine, assemble, decodeExtended, disassembleExtended, type AssembledProgram } from './index';

const asm = (src: string): AssembledProgram => {
  const r = assemble(src, { dialect: 'extended' });
  if (!r.ok) throw new Error(r.errors.map((e) => `line ${e.line}: ${e.message}`).join('\n'));
  return r.program;
};
const errs = (src: string) => {
  const r = assemble(src, { dialect: 'extended' });
  if (r.ok) throw new Error('expected assembly to fail');
  return r.errors;
};
const machine = (src: string, pcIncrement: 'early' | 'late' = 'early') => new Machine(asm(src).memory, { dialect: 'extended', pcIncrement });

describe('SLEEP: assembler', () => {
  it('assembles to opcode word 905 followed by the number of milliseconds', () => {
    expect(asm('SLEEP 500').memory.slice(0, 2)).toEqual([905, 500]);
    expect(asm('SLEEP 0').memory.slice(0, 2)).toEqual([905, 0]);
    expect(asm('SLEEP 999').memory.slice(0, 2)).toEqual([905, 999]);
    expect(asm('sleep 7').memory.slice(0, 2)).toEqual([905, 7]);
  });

  it('accepts a # in front of the number, keeps the source text, and can take a label', () => {
    const p = asm('pause SLEEP #250\nHLT');
    expect(p.memory.slice(0, 3)).toEqual([905, 250, 0]);
    expect(p.symbols).toEqual({ pause: 0 });
    expect(p.lines[0]).toMatchObject({ mnemonic: 'SLEEP', operand: '#250', words: [905, 250], addr: 0 });
    expect(p.lines[1].addr).toBe(2); // two mailboxes
  });

  it('only takes a whole number from 0 to 999', () => {
    expect(errs('SLEEP 1000')[0].message).toMatch(/too long: the most is 999/);
    expect(errs('SLEEP abc')[0].message).toMatch(/whole number of milliseconds from 0 to 999.*'abc'/);
    expect(errs('SLEEP -5')[0].message).toMatch(/whole number of milliseconds/);
    expect(errs('SLEEP 2.5')[0].message).toMatch(/whole number of milliseconds/);
    expect(errs('SLEEP (5)')[0].message).toMatch(/whole number of milliseconds/);
    expect(errs('x DAT\nSLEEP x')[0].message).toMatch(/whole number of milliseconds/); // a label is not a literal
    expect(errs('SLEEP')[0].message).toBe('SLEEP needs a number of milliseconds, for example SLEEP 500');
    expect(errs('SLEEP 5 6')[0].message).toMatch(/Unexpected '6'/);
  });

  it('does not exist in the standard LMC', () => {
    const r = assemble('SLEEP 500', { dialect: 'standard' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toMatch(/Unknown instruction/);
  });
});

describe('SLEEP: decoding', () => {
  it('905 is a two-word instruction whose operand is a plain number', () => {
    expect(decodeExtended(905)).toEqual({ mnemonic: 'SLEEP', mode: 'immediate', length: 2 });
    expect(decodeExtended(906)).toBeUndefined();
    expect(disassembleExtended(905, 500)).toBe('SLEEP 500');
    expect(disassembleExtended(905, 0)).toBe('SLEEP 0');
    expect(disassembleExtended(905, undefined)).toBe('SLEEP …');
  });
});

describe('SLEEP: the machine', () => {
  it('reports the wait on its execute step, and leaves everything else alone', () => {
    const m = machine('SLEEP 500\nHLT');
    const steps = m.stepInstruction();
    expect(steps.map((s) => s.rtn)).toEqual([
      'MAR ← PC', 'PC ← PC + 1', 'MDR ← [MAR]', 'CIR ← MDR', 'decode CIR',
      'MAR ← PC', 'PC ← PC + 1', 'MDR ← [MAR]', 'OPR ← MDR', 'wait OPR ms',
    ]);
    expect(steps.filter((s) => s.sleep !== undefined)).toHaveLength(1);
    expect(steps.at(-1)).toMatchObject({ sleep: 500, detail: 'wait 500 ms', phase: 'execute', instructionEnd: true });
    expect(steps.at(-1)!.changes).toEqual([]);
    expect([m.pc, m.acc, m.opr, m.cir]).toEqual([2, 0, 500, 905]);
    expect(m.status).toBe('ready');
  });

  it('SLEEP 0 is a valid instruction that asks for no wait', () => {
    const m = machine('SLEEP 0\nHLT');
    expect(m.stepInstruction().at(-1)).toMatchObject({ sleep: 0, detail: 'wait 0 ms' });
  });

  it('keeps a virtual total of the waits, which nothing actually waits for', () => {
    const m = machine('SLEEP 300\nSLEEP 200\nSLEEP 999\nHLT');
    const started = Date.now();
    expect(m.run().reason).toBe('halted');
    expect(Date.now() - started).toBeLessThan(500); // 1499 ms of sleeping, done instantly
    expect(m.sleptMs).toBe(1499);
  });

  it('the total survives snapshot and restore, and reset clears it', () => {
    const m = machine('SLEEP 100\nSLEEP 100\nHLT');
    m.stepInstruction();
    const snap = m.snapshot();
    expect(snap.sleptMs).toBe(100);
    m.run();
    expect(m.sleptMs).toBe(200);
    m.restore(snap);
    expect(m.sleptMs).toBe(100);
    m.reset();
    expect(m.sleptMs).toBe(0);
  });

  it('works with the other fetch order, and the PC moves on by two', () => {
    const m = machine('SLEEP 40\nHLT', 'late');
    const steps = m.stepInstruction();
    expect(steps.map((s) => s.rtn).slice(5)).toEqual(['MAR ← PC', 'MDR ← [MAR]', 'OPR ← MDR', 'PC ← PC + 1', 'wait OPR ms']);
    expect(m.pc).toBe(2);
  });

  it('branching into the operand word is an illegal instruction, like any operand', () => {
    const m = machine('BRA 3\nSLEEP 5\nHLT'); // mailbox 3 is SLEEP's operand word (the number 5)
    expect(m.run().reason).toBe('error');
    expect(m.error).toMatch(/Illegal instruction 5 at mailbox 03/);
  });
});

describe('SLEEP: hover explanations', () => {
  it('explains the instruction and its operand word', () => {
    const e = explainWord(905, { dialect: 'extended', operandWord: 500 });
    expect(e).toMatchObject({ kind: 'instruction', title: 'SLEEP 500', effect: 'wait 500 ms' });
    expect(e.digits!.map((d) => `${d.digit}:${d.role}`)).toEqual(['9:opcode', '0:spare', '5:operand']);
    expect(e.operand).toMatch(/holds 500, the time to wait in milliseconds \(0 to 999\)/);
    expect(e.note).toMatch(/not part of the OCR specification/);
    const op = explainWord(500, { dialect: 'extended', operandOf: { addr: 4, mnemonic: 'SLEEP', mode: 'immediate' } });
    expect(op).toMatchObject({ kind: 'operand', title: 'Operand of SLEEP' });
    expect(op.operand).toBe('500: the number of milliseconds to wait');
  });
});
