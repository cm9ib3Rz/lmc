import tests from '../programs/tests.json';
import type { Dialect } from './engine';

export interface Example {
  id: string;
  name: string;
  /** The programming idea it shows. */
  concept: string;
  source: string;
  /** Sample inbox contents. */
  inputs: number[];
  /** Extended LMC: the sample uses the switches and lamps, so choosing it turns the peripherals on. */
  peripherals?: boolean;
}

const files = import.meta.glob('../programs/*.lmc', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Teaching order, with the label shown in the picker. */
const LIBRARY: { file: string; name: string; concept: string }[] = [
  { file: 'add.lmc', name: 'Add two numbers', concept: 'Sequence and variables' },
  { file: 'max.lmc', name: 'Larger of two numbers', concept: 'Selection (SUB then BRP)' },
  { file: 'countdown.lmc', name: 'Countdown', concept: 'Iteration (BRZ and BRA)' },
  { file: 'multiply.lmc', name: 'Multiply', concept: 'Counted loop, repeated addition' },
  { file: 'square.lmc', name: 'Squares until zero', concept: 'A counted loop inside a sentinel loop' },
  { file: 'sum-until-zero.lmc', name: 'Running total', concept: 'Sentinel-controlled loop' },
  { file: 'max10.lmc', name: 'Largest of ten numbers', concept: 'Loop with a running maximum' },
  { file: 'min10.lmc', name: 'Smallest of ten numbers', concept: 'Loop with a running minimum' },
  { file: 'divide.lmc', name: 'Divide with remainder', concept: 'Repeated subtraction' },
  { file: 'sieve.lmc', name: 'Primes: sieve of Eratosthenes', concept: 'Row of flags via self-modifying code (optional extra, not OCR)' },
  { file: 'array-sum-indexed.lmc', name: 'Array sum (self-modifying)', concept: 'Program as data (optional extra, not OCR)' },
];

const DAT_FIRST = `// mistake-dat-first.lmc - a common error: DAT placed before the code.
// 'total' is assembled into mailbox 00, so the CPU fetches 000 (HLT) and stops
// before it reaches INP. Step through it, then move the DAT line to the end.
total   DAT 0
        INP
        ADD total
        OUT
        HLT
`;

const find = (file: string) => {
  const key = Object.keys(files).find((k) => k.endsWith('/' + file));
  if (!key) throw new Error(`Missing example program ${file}`);
  return files[key];
};

/** These rewrite their own instructions, which cannot work with two-word instructions. */
const SELF_MODIFYING = new Set(['sieve.lmc', 'array-sum-indexed.lmc']);

const plainExamples: Example[] = LIBRARY.map(({ file, name, concept }) => ({
  id: file,
  name,
  concept,
  source: find(file),
  // First documented test case gives sensible sample input.
  inputs: tests.find((t) => t.program === file)?.inputs ?? [],
}));

const datFirst: Example = { id: 'mistake-dat-first', name: 'Mistake: data before code', concept: 'Why DAT goes after HLT', source: DAT_FIRST, inputs: [5] };

/**
 * The examples for a dialect. The standard list is the LMC as OCR specifies it, and it is all the standard page
 * ever loads. The extended list swaps the self-modifying examples (which cannot work with two-word instructions)
 * for the programs that use addressing modes, and those are fetched only now, with a dynamic import.
 */
export async function examplesFor(dialect: Dialect): Promise<Example[]> {
  if (dialect === 'standard') return [...plainExamples, datFirst];
  const { extendedExamples, peripheralExamples } = await import('./extended-pack');
  return [...plainExamples.filter((e) => !SELF_MODIFYING.has(e.id)), ...extendedExamples, ...peripheralExamples, datFirst];
}

export const BLANK_SOURCE = `// Write your program here. Press Step or Run.
        INP
        OUT
        HLT
`;
