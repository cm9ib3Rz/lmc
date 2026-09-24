import { describe, expect, it } from 'vitest';
import { FIRST_PERIPHERAL, Machine, PERIPHERALS, PERIPHERAL_SYMBOLS, assemble, type AssembledProgram } from './index';

/** Assemble for the extended LMC with the peripherals switched on (or off). */
function asm(src: string, peripherals = true): AssembledProgram {
  const r = assemble(src, { dialect: 'extended', peripherals });
  if (!r.ok) throw new Error(r.errors.map((e) => `line ${e.line}: ${e.message}`).join('\n'));
  return r.program;
}
const errs = (src: string, peripherals = true) => {
  const r = assemble(src, { dialect: 'extended', peripherals });
  if (r.ok) throw new Error('expected assembly to fail');
  return r.errors;
};
const machine = (src: string, inputs: number[] = []) => {
  const p = asm(src);
  return new Machine(p.memory, { dialect: 'extended', dataAddresses: p.dataAddresses }, inputs);
};
const lamps = (m: Machine) => PERIPHERALS.lamps.map((a) => (m.memory[a] !== 0 ? 1 : 0));

// The peripherals are ordinary memory: the UI writes a 1 or 0 into a switch's mailbox when it is clicked,
// and lights a lamp while its mailbox is not 0. The engine has nothing special to do at run time; when they
// are switched on the assembler only keeps a program's own code and data out of the six mailboxes.

describe('peripherals: layout', () => {
  it('the switches and lamps are the top six mailboxes', () => {
    expect(PERIPHERALS.switches).toEqual([94, 95, 96]);
    expect(PERIPHERALS.lamps).toEqual([97, 98, 99]);
    expect(FIRST_PERIPHERAL).toBe(94);
    expect(PERIPHERAL_SYMBOLS).toEqual({ switch1: 94, switch2: 95, switch3: 96, lamp1: 97, lamp2: 98, lamp3: 99 });
  });
});

describe('peripherals: off (the default)', () => {
  it('defines no names and reserves nothing', () => {
    const r = assemble('LDA switch1', { dialect: 'extended' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toMatch(/Undefined label 'switch1'/);
    const p = asm('LDA lamp1\nHLT\nlamp1 DAT 5', false); // lamp1 is just an ordinary label here
    expect(p.peripheralSymbols).toBeUndefined();
    expect(p.symbols).toEqual({ lamp1: 3 });
  });

  it('lets a program use all 100 mailboxes', () => {
    expect(assemble(Array.from({ length: 50 }, () => 'LDA 0').join('\n'), { dialect: 'extended' }).ok).toBe(true); // 100 words
  });
});

describe('peripherals: on', () => {
  it('predefines switch1..3 and lamp1..3, ignoring case', () => {
    const p = asm('LDA switch1\nSTA lamp1\nLDA Switch3\nSTA LAMP3\nHLT');
    expect(p.memory.slice(0, 8)).toEqual([500, 94, 300, 97, 500, 96, 300, 99]);
    expect(p.peripheralSymbols).toEqual(PERIPHERAL_SYMBOLS);
    expect(p.symbols).toEqual({}); // the program's own labels only
  });

  it('the names work with the other modes too', () => {
    expect(asm('LDX #1\nLDA lamp1,X\nSTA (switch1)').memory.slice(0, 6)).toEqual([410, 1, 530, 97, 320, 94]);
  });

  it('a program cannot use those names as its own labels', () => {
    expect(errs('lamp1 DAT 0')[0].message).toMatch(/'lamp1' is a peripheral \(mailbox 97\)/);
    expect(errs('HLT\nSwitch2 DAT')[0].message).toMatch(/peripheral \(mailbox 95\)/);
  });

  it('keeps the program out of mailboxes 94-99', () => {
    const fits = Array.from({ length: 47 }, () => 'LDA 0').join('\n');
    expect(asm(fits).size).toBe(94); // mailboxes 00-93
    const e = errs(fits + '\nHLT');
    expect(e[0]).toMatchObject({ line: 48 });
    expect(e[0].message).toMatch(/94-99 are the peripherals/);
    expect(e[0].message).toMatch(/two/);
  });

  it('the standard LMC has no peripherals, whatever the option says', () => {
    const r = assemble('LDA switch1', { dialect: 'standard', peripherals: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toMatch(/Undefined label 'switch1'/);
    expect(assemble(Array.from({ length: 100 }, () => 'DAT').join('\n'), { dialect: 'standard', peripherals: true }).ok).toBe(true);
  });
});

describe('peripherals: they are ordinary memory when a program runs', () => {
  it('a program reads whatever is in a switch mailbox', () => {
    const m = machine('LDA switch1\nOUT\nLDA switch2\nOUT\nLDA switch3\nOUT\nHLT');
    m.poke(95, 1); // what clicking switch 2 does
    m.run();
    expect(m.output).toEqual([0, 1, 0]);
  });

  it('a switch mailbox can also be written by the program, and the write stands', () => {
    const m = machine('LDA #5\nSTA switch2\nLDA switch2\nOUT\nHLT');
    m.run();
    expect(m.output).toEqual([5]);
    expect(m.memory[95]).toBe(5);
    expect(m.memory[95] !== 0).toBe(true); // so the panel shows that switch as up
  });

  it('a switch can be changed while the program is running', () => {
    const m = machine('wait LDA switch1\nBRZ wait\nLDA #7\nOUT\nHLT');
    expect(m.run({ maxInstructions: 30 }).reason).toBe('step-limit');
    expect(m.output).toEqual([]);
    m.poke(94, 1);
    expect(m.run().reason).toBe('halted');
    expect(m.output).toEqual([7]);
  });

  it('a lamp is lit while its mailbox holds anything other than 0', () => {
    const m = machine('LDA #1\nSTA lamp1\nLDA #250\nSTA lamp2\nLDA #0\nSTA lamp3\nHLT');
    m.run();
    expect(lamps(m)).toEqual([1, 1, 0]);
    expect(m.memory[98]).toBe(250);
  });

  it('a lamp can be read back and switched off', () => {
    const m = machine('LDA #3\nSTA lamp1\nLDA lamp1\nOUT\nLDA #0\nSTA lamp1\nHLT');
    m.run();
    expect(m.output).toEqual([3]);
    expect(lamps(m)).toEqual([0, 0, 0]);
  });

  it('reset puts every peripheral mailbox back to what the program started with', () => {
    const m = machine('LDA #1\nSTA lamp2\nHLT');
    m.poke(94, 1);
    m.run();
    expect(lamps(m)).toEqual([0, 1, 0]);
    m.reset();
    expect(lamps(m)).toEqual([0, 0, 0]);
    expect(m.memory[94]).toBe(0);
  });

  it('going back restores the peripheral mailboxes along with the rest of memory', () => {
    const m = machine('LDA #1\nSTA lamp1\nHLT');
    const before = m.snapshot();
    m.run();
    expect(lamps(m)).toEqual([1, 0, 0]);
    m.restore(before);
    expect(lamps(m)).toEqual([0, 0, 0]);
  });
});
