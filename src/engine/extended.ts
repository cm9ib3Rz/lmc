// The "extended LMC" (LMC-X): an optional, NON-OCR variant that adds addressing modes.
// Design: docs/OCR_LMC_Reference.md section 7.1. Enabled with ?lmc=extended.
//
// Instructions are one or two words. The opcode word is `O M S`:
//   O = operation (same digit as plain LMC), M = addressing mode, S = 0 (except group 9).
// Most instructions are followed by ONE operand word: an address 00-99, or for immediate any value 0-999.
import type { Mnemonic } from './types';

/**
 * Memory-mapped peripherals (extended LMC only, and only when switched on): three switches and three lamps in
 * the top six mailboxes. They are ordinary memory. Clicking a switch writes 1 (up) or 0 (down) into its mailbox,
 * and a program can write there too, so the mailbox always holds the truth. A lamp is lit while its mailbox holds
 * anything other than 0. While they are on, the assembler keeps a program's own code and data out of these
 * mailboxes and defines the names below; a running program may still read and write them.
 */
export const PERIPHERALS = { switches: [94, 95, 96], lamps: [97, 98, 99] } as const;

/** With peripherals on, a program's own code and data may use mailboxes 00 up to (not including) this one. */
export const FIRST_PERIPHERAL = 94;

/** Names the extended assembler defines for the peripherals, so a program can say `LDA switch1` and `STA lamp1`. */
export const PERIPHERAL_SYMBOLS: Readonly<Record<string, number>> = {
  switch1: 94,
  switch2: 95,
  switch3: 96,
  lamp1: 97,
  lamp2: 98,
  lamp3: 99,
};

export type AddressingMode = 'direct' | 'immediate' | 'indirect' | 'indexed';

export const MODES: readonly AddressingMode[] = ['direct', 'immediate', 'indirect', 'indexed'];

/** Mode digit `M` in the opcode word. */
export const MODE_DIGIT: Record<AddressingMode, number> = { direct: 0, immediate: 1, indirect: 2, indexed: 3 };

/** Opcode word for each instruction that has an operand word, in direct mode. */
export const EXT_BASE: Readonly<Record<string, number>> = { ADD: 100, SUB: 200, STA: 300, LDX: 400, LDA: 500, BRA: 600, BRZ: 700, BRP: 800 };

/** Single-word instructions. */
export const EXT_FIXED: Readonly<Record<string, number>> = { INP: 901, OUT: 902, INX: 903, TXA: 904, HLT: 0, HCF: 999 };

const ALL: readonly AddressingMode[] = MODES;

/** Which modes each instruction accepts. */
export const EXT_ALLOWED: Readonly<Record<string, readonly AddressingMode[]>> = {
  ADD: ALL,
  SUB: ALL,
  LDA: ALL,
  STA: ['direct', 'indirect', 'indexed'],
  LDX: ['direct', 'immediate'],
  BRA: ['direct'],
  BRZ: ['direct'],
  BRP: ['direct'],
};

/**
 * `SLEEP n`: wait n milliseconds (n is a whole number 0-999 written after it). Opcode word 905, then a word holding n.
 * The machine has no clock of its own: executing it only reports the wait, and whatever is running the machine
 * (the page's run loop) does the waiting.
 */
export const SLEEP_WORD = 905;

const NAME_BY_DIGIT: Readonly<Record<number, string>> = { 1: 'ADD', 2: 'SUB', 3: 'STA', 4: 'LDX', 5: 'LDA', 6: 'BRA', 7: 'BRZ', 8: 'BRP' };

export interface DecodedExtended {
  mnemonic: Mnemonic;
  /** Present for instructions that have an operand word. */
  mode?: AddressingMode;
  /** Words the instruction occupies. */
  length: 1 | 2;
}

/** Decode an opcode word. Returns undefined when it is not a valid extended instruction. */
export function decodeExtended(word: number): DecodedExtended | undefined {
  if (!Number.isInteger(word) || word < 0 || word > 999) return undefined;
  for (const [name, code] of Object.entries(EXT_FIXED)) {
    if (word === code) return { mnemonic: name as Mnemonic, length: 1 };
  }
  // The operand is a plain number, so it counts as immediate.
  if (word === SLEEP_WORD) return { mnemonic: 'SLEEP', mode: 'immediate', length: 2 };
  const opcode = Math.floor(word / 100);
  const modeDigit = Math.floor(word / 10) % 10;
  const name = NAME_BY_DIGIT[opcode];
  if (!name || word % 10 !== 0 || modeDigit > 3) return undefined;
  const mode = MODES[modeDigit];
  if (!EXT_ALLOWED[name].includes(mode)) return undefined;
  return { mnemonic: name as Mnemonic, mode, length: 2 };
}

/** Write an operand the way source code does: `5`, `#5`, `(5)`, `5,X`. */
export function formatExtendedOperand(mode: AddressingMode, operand: number | string): string {
  switch (mode) {
    case 'immediate':
      return `#${operand}`;
    case 'indirect':
      return `(${operand})`;
    case 'indexed':
      return `${operand},X`;
    default:
      return String(operand);
  }
}

/**
 * Turn an extended opcode word (and the operand word after it) back into assembly text.
 * Returns undefined when the word is not a valid instruction.
 */
export function disassembleExtended(
  word: number,
  operandWord: number | undefined,
  labelAt?: (addr: number) => string | undefined,
): string | undefined {
  const d = decodeExtended(word);
  if (!d) return undefined;
  if (d.length === 1) return d.mnemonic;
  if (operandWord === undefined) return `${d.mnemonic} …`;
  if (d.mnemonic === 'SLEEP') return `SLEEP ${operandWord}`; // no # for a sleep: it is always a number of milliseconds
  const shown = d.mode === 'immediate' ? operandWord : (labelAt?.(operandWord) ?? operandWord);
  return `${d.mnemonic} ${formatExtendedOperand(d.mode!, shown)}`;
}
