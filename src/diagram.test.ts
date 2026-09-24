import { describe, expect, it } from 'vitest';
import { activityOf, sourceRegisters } from './diagram';
import { Machine, assemble, type MicroStep } from './engine';
import { STANDARD_TABS } from './reference';

function machineOf(src: string) {
  const result = assemble(src);
  if (!result.ok) throw new Error('assembly failed');
  return new Machine(result.program.memory, { dataAddresses: result.program.dataAddresses }, []);
}

const stepFor = (steps: MicroStep[], rtn: string) => steps.filter((s) => s.rtn === rtn);

describe('CPU diagram: which registers a step reads', () => {
  it.each([
    ['MAR ← PC', ['PC']],
    ['PC ← PC + 1', ['PC']],
    ['MDR ← [MAR]', ['MAR']],
    ['CIR ← MDR', ['MDR']],
    ['decode CIR', ['CIR']],
    ['MAR ← 06', []],
    ['ACC ← MDR', ['MDR']],
    ['ACC ← ACC + MDR', ['ACC', 'MDR']],
    ['MDR ← ACC', ['ACC']],
    ['[MAR] ← MDR', ['MAR', 'MDR']],
    ['if ACC = 0 then PC ← xx', ['ACC']],
    ['PC ← xx', []],
    ['ACC ← input', []],
    ['output ← ACC', ['ACC']],
    ['MAR ← OPR + X', ['OPR', 'X']],
  ])('%s reads %j', (rtn, reads) => {
    expect(sourceRegisters(rtn).sort()).toEqual([...reads].sort());
  });
});

describe('CPU diagram: which parts a step uses', () => {
  const add = machineOf('LDA a\nADD b\nHLT\na DAT 4\nb DAT 5');
  const steps = [...add.stepInstruction(), ...add.stepInstruction()];

  it('memory reads use the buses, memory and the control unit', () => {
    const [fetchRead] = stepFor(steps, 'MDR ← [MAR]');
    const a = activityOf([fetchRead]);
    expect(a).toMatchObject({ memory: 'read', controlUnit: true, alu: false });
    expect(a.bus).toBeDefined();
  });

  it('a memory write is shown as a write', () => {
    const store = machineOf('STA a\nHLT\na DAT').stepInstruction();
    expect(activityOf(stepFor(store, '[MAR] ← MDR')).memory).toBe('write');
  });

  it('decode lights the control unit and nothing else', () => {
    const [decode] = stepFor(steps, 'decode CIR');
    expect(activityOf([decode])).toMatchObject({ controlUnit: true, alu: false, memory: null });
  });

  it('only the calculation of ADD lights the ALU', () => {
    expect(steps.filter((s) => activityOf([s]).alu).map((s) => s.rtn)).toEqual(['ACC ← ACC + MDR']);
  });

  it('register copies and PC increments use no bus and no ALU', () => {
    for (const rtn of ['MAR ← PC', 'PC ← PC + 1', 'CIR ← MDR']) {
      const [s] = stepFor(steps, rtn);
      expect(activityOf([s])).toMatchObject({ alu: false, controlUnit: false, memory: null });
    }
  });
});

describe('cycle detail text', () => {
  it('says the control unit decodes and the ALU calculates', () => {
    const steps = machineOf('LDA a\nADD a\nHLT\na DAT 4').stepInstruction();
    expect(steps.find((s) => s.rtn === 'decode CIR')?.detail).toMatch(/decoded by the control unit/);
    const add = machineOf('ADD a\nHLT\na DAT 4').stepInstruction();
    expect(add.find((s) => s.rtn === 'ACC ← ACC + MDR')?.detail).toBe('ACC ← 0 + 4 = 4 (calculated by the ALU)');
  });
});

describe('reference: the 1.1.1 teaching points in OCR’s delivery guide', () => {
  const text = STANDARD_TABS.map((t) => t.html).join(' ');

  it('names the ALU and the control unit', () => {
    expect(text).toMatch(/Arithmetic Logic Unit/);
    expect(text).toMatch(/<th scope="row">Control unit<\/th>/);
  });

  it('mentions interrupts, von Neumann and what the LMC leaves out', () => {
    expect(text).toMatch(/interrupt service routine/);
    expect(text).toMatch(/von Neumann/);
    expect(text).toMatch(/Harvard/);
    expect(text).toMatch(/pipelining/);
  });
});
