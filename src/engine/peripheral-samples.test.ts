import { describe, expect, it } from 'vitest';
import { Machine, PERIPHERALS, assemble, type AssembledProgram } from './index';

const files = import.meta.glob('../../programs/x/*.lmc', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const source = (name: string) => {
  const key = Object.keys(files).find((k) => k.endsWith('/' + name));
  if (!key) throw new Error(`No program ${name}`);
  return files[key];
};

function load(name: string) {
  const r = assemble(source(name), { dialect: 'extended', peripherals: true });
  if (!r.ok) throw new Error(r.errors.map((e) => `line ${e.line}: ${e.message}`).join('\n'));
  const program: AssembledProgram = r.program;
  const machine = new Machine(program.memory, { dialect: 'extended', dataAddresses: program.dataAddresses });
  return { program, machine };
}

const lamps = (m: Machine) => PERIPHERALS.lamps.map((a) => (m.memory[a] !== 0 ? 1 : 0));
/** What clicking a switch does: write 1 (up) or 0 (down) into its mailbox. */
const setSwitches = (m: Machine, s: [number, number, number]) => PERIPHERALS.switches.forEach((a, i) => m.poke(a, s[i]));

/** Run until the program is about to execute the line at `address` (the top of its loop). */
function runUntil(m: Machine, address: number) {
  for (let i = 0; i < 500 && !(m.pc === address && m.atInstructionBoundary); i++) m.stepInstruction();
  expect(m.pc).toBe(address);
}

/** Step instruction by instruction and note the lamps each time the program is about to run the line at `address`. */
function sampleAt(m: Machine, address: number, instructions: number) {
  const seen: number[][] = [];
  for (let i = 0; i < instructions && m.status === 'ready'; i++) {
    if (m.pc === address && m.atInstructionBoundary) seen.push(lamps(m));
    m.stepInstruction();
  }
  return seen;
}

/** Collapse repeated states into [state, how many times it was seen in a row]. */
function runs(states: number[][]) {
  const out: [string, number][] = [];
  for (const s of states) {
    const key = s.join('');
    if (out.length && out[out.length - 1][0] === key) out[out.length - 1][1]++;
    else out.push([key, 1]);
  }
  return out;
}

describe('peripheral samples', () => {
  it('they all assemble with the peripherals on, and need the peripherals', () => {
    for (const name of ['lamps-x.lmc', 'blink-x.lmc', 'switch-value-x.lmc', 'binary-counter-x.lmc', 'traffic-lights-x.lmc']) {
      expect(() => load(name), name).not.toThrow();
      const off = assemble(source(name), { dialect: 'extended' });
      expect(off.ok, name + ' without peripherals').toBe(false);
    }
  });

  it('blink-x: lamp1 is on for 500 ms, then off for 500 ms, over and over', () => {
    const { machine: m } = load('blink-x.lmc');
    const lamp1 = PERIPHERALS.lamps[0];
    // At each SLEEP, note the lamp and how long it asked to wait.
    const waits: [number, number][] = [];
    for (let i = 0; i < 60 && m.status === 'ready'; i++) {
      for (const step of m.stepInstruction()) {
        if (step.sleep !== undefined) waits.push([m.memory[lamp1], step.sleep]);
      }
    }
    expect(waits.length).toBeGreaterThanOrEqual(6);
    expect(waits.slice(0, 6)).toEqual([[1, 500], [0, 500], [1, 500], [0, 500], [1, 500], [0, 500]]);
    expect(m.sleptMs).toBe(waits.length * 500);
    expect(m.memory[PERIPHERALS.lamps[1]]).toBe(0); // the other lamps are left alone
  });

  it('lamps-x: each lamp copies its switch, and keeps following as the switches move', () => {
    const { machine: m } = load('lamps-x.lmc');
    setSwitches(m, [1, 0, 1]);
    m.run({ maxInstructions: 40 });
    expect(lamps(m)).toEqual([1, 0, 1]);
    setSwitches(m, [0, 1, 0]);
    m.run({ maxInstructions: 40 });
    expect(lamps(m)).toEqual([0, 1, 0]);
    setSwitches(m, [0, 0, 0]);
    m.run({ maxInstructions: 40 });
    expect(lamps(m)).toEqual([0, 0, 0]);
    expect(m.status).toBe('ready'); // it never stops by itself
  });

  it('switch-value-x: outputs the binary value of the switches, only when it changes', () => {
    const { program, machine: m } = load('switch-value-x.lmc');
    m.run({ maxInstructions: 60 });
    expect(m.output).toEqual([0]); // the first pass reports the starting value
    m.run({ maxInstructions: 200 });
    expect(m.output).toEqual([0]); // nothing new while nothing changes
    const steps: [[number, number, number], number][] = [
      [[1, 0, 0], 1],
      [[0, 1, 0], 2],
      [[1, 1, 0], 3],
      [[0, 0, 1], 4],
      [[1, 0, 1], 5],
      [[0, 1, 1], 6],
      [[1, 1, 1], 7],
      [[0, 0, 0], 0],
    ];
    const expected = [0];
    for (const [switches, value] of steps) {
      runUntil(m, program.symbols.loop); // change the switches between reads, as one click would
      setSwitches(m, switches);
      m.run({ maxInstructions: 60 });
      expected.push(value);
      expect(m.output, `switches ${switches}`).toEqual(expected);
    }
  });

  it('binary-counter-x: the lamps count 0 to 7 in binary and start again (lamp3 is the 4s place)', () => {
    const { program, machine: m } = load('binary-counter-x.lmc');
    const seen = runs(sampleAt(m, program.symbols.pause, 12_000));
    const binary = (n: number) => [n & 1, (n >> 1) & 1, (n >> 2) & 1].join('');
    const expected = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1].map(binary);
    expect(seen.slice(0, 10).map(([state]) => state)).toEqual(expected);
    // each number is shown for the same time: 30 passes round the pause loop
    expect(seen.slice(0, 9).map(([, count]) => count)).toEqual(new Array(9).fill(30));
  });

  it('traffic-lights-x: red, red and amber, green, amber, and round again, with the right timings', () => {
    const { program, machine: m } = load('traffic-lights-x.lmc');
    const seen = runs(sampleAt(m, program.symbols.wait, 2_000));
    expect(seen.slice(0, 6)).toEqual([
      ['100', 40], // red
      ['110', 10], // red and amber
      ['001', 40], // green
      ['010', 10], // amber
      ['100', 40], // red again
      ['110', 10],
    ]);
  });
});
