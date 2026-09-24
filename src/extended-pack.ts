// Everything that exists only in the extended LMC (?lmc=extended) and has user-visible text:
// the sample programs, the extra reference pages, the badge and the extra register names.
//
// main.ts, examples.ts and reference.ts load this with a dynamic import() only in extended mode, so the
// standard page never downloads any of it. Do not import this file statically from anywhere else.
import testsX from '../programs/x/tests-x.json';
import type { Register } from './engine';
import type { Example } from './examples';
import { mountPeripherals, peripheralInfo } from './peripherals';
import { ADDRESSING_TAB, EXTENDED_TABS, PERIPHERALS_TAB } from './reference-extended';

const files = import.meta.glob('../programs/x/*.lmc', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const source = (file: string) => {
  const key = Object.keys(files).find((k) => k.endsWith('/' + file));
  if (!key) throw new Error(`Missing example program ${file}`);
  return files[key];
};

/** Teaching order, grouped by the mode they show. */
const LIBRARY: { file: string; name: string; concept: string }[] = [
  // immediate
  { file: 'countdown-x.lmc', name: 'Countdown with #1', concept: 'Immediate: SUB #1 needs no DAT' },
  { file: 'fibonacci-x.lmc', name: 'Fibonacci numbers', concept: 'Immediate values and variables' },
  { file: 'big-immediate-x.lmc', name: 'Big immediate values', concept: 'Immediate values up to 999' },
  // indexed
  { file: 'array-sum-x.lmc', name: 'Array sum with an index register', concept: 'Indexed: LDA data,X with INX' },
  { file: 'reverse-x.lmc', name: 'Reverse five numbers', concept: 'Indexed store, then indexed load' },
  { file: 'double-array-x.lmc', name: 'Double an array in place', concept: 'Indexed load and store' },
  { file: 'max10-x.lmc', name: 'Largest of ten (kept in a row)', concept: 'Indexed loop over a row of numbers' },
  { file: 'linear-search-x.lmc', name: 'Linear search', concept: 'Indexed search: position, or 999 if missing' },
  { file: 'bubble-sort-x.lmc', name: 'Bubble sort', concept: 'Indexed compare and swap, in place' },
  { file: 'sieve-x.lmc', name: 'Primes: sieve of Eratosthenes', concept: 'Indexed: a row of flags, flag,X' },
  // indirect
  { file: 'pointer-x.lmc', name: 'Pointer', concept: 'Indirect: LDA (ptr)' },
  { file: 'linked-list-x.lmc', name: 'Linked list', concept: 'Indirect and indexed: following pointers' },
];

/** Samples for the switches and lamps. Choosing one turns the peripherals on. */
const PERIPHERAL_LIBRARY: { file: string; name: string; concept: string }[] = [
  { file: 'lamps-x.lmc', name: 'Switches to lamps', concept: 'Peripherals: read a switch, write a lamp' },
  { file: 'blink-x.lmc', name: 'Blink a lamp', concept: 'Peripherals and SLEEP: on, wait, off, wait' },
  { file: 'switch-value-x.lmc', name: 'Binary switches to a number', concept: 'Peripherals: 3 switches as a binary number' },
  { file: 'binary-counter-x.lmc', name: 'Binary counter on the lamps', concept: 'Peripherals: counting 0 to 7 in binary' },
  { file: 'traffic-lights-x.lmc', name: 'Traffic lights', concept: 'Peripherals: a table of stages and timings' },
];

export const extendedExamples: Example[] = LIBRARY.map(({ file, name, concept }) => ({
  id: file,
  name,
  concept,
  source: source(file),
  // The first documented test case gives sensible sample input.
  inputs: testsX.find((t) => t.program === file)?.inputs ?? [],
}));

export const peripheralExamples: Example[] = PERIPHERAL_LIBRARY.map(({ file, name, concept }) => ({
  id: file,
  name,
  concept,
  source: source(file),
  inputs: [],
  peripherals: true,
}));

export { ADDRESSING_TAB, EXTENDED_TABS, PERIPHERALS_TAB, mountPeripherals, peripheralInfo };

/** The two registers the extended LMC adds. */
export const EXTENDED_REGISTERS: { reg: Register; full: string }[] = [
  { reg: 'OPR', full: 'Operand' },
  { reg: 'X', full: 'Index' },
];

/** An extra run speed: almost no delay between instructions, so a SLEEP takes very nearly exactly as long as it says. */
export const REALTIME_SPEED = { value: 'realtime', label: 'Real time' };

export const BADGE = {
  text: 'Extended LMC · not OCR',
  title: 'An invented variant with addressing modes. It is not part of the OCR specification.',
};

export const EXTENDED_TITLE = 'Little Man Computer (LMC) Simulator (extended LMC)';
export const EXTENDED_REFERENCE_TITLE = ' (extended LMC)';
