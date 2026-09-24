export const MEMORY_SIZE = 100;
export const WORD_MIN = -999;
export const WORD_MAX = 999;

import type { AddressingMode } from './extended';

/**
 * `standard` is the LMC as OCR specifies it (direct addressing only). `extended` is an optional, NON-OCR variant
 * with addressing modes, an index register and two-word instructions (see extended.ts).
 */
export type Dialect = 'standard' | 'extended';

/** `COB` is accepted as an alias of `HLT` and normalised to it. */
export type Mnemonic = 'ADD' | 'SUB' | 'STA' | 'LDA' | 'BRA' | 'BRZ' | 'BRP' | 'INP' | 'OUT' | 'HLT' | 'HCF' | 'DAT'
  // extended dialect only
  | 'LDX' | 'INX' | 'TXA' | 'SLEEP';

export interface AsmError {
  /** 1-based source line. */
  line: number;
  message: string;
}

export interface AssembledLine {
  /** 1-based source line. */
  line: number;
  /** The source text of the line, comment included. */
  src: string;
  /** Mailbox this line occupies. */
  addr: number;
  mnemonic: Mnemonic;
  label?: string;
  /** Operand as written (label or number, or `#5`, `(5)`, `5,X` in the extended dialect); absent for INP/OUT/HLT and an uninitialised DAT. */
  operand?: string;
  /** The word stored at `addr` (the opcode word, for a two-word instruction). */
  word: number;
  /** Every word the line occupies: one, or two for an extended instruction with an operand word. */
  words: number[];
  /** Extended dialect: the addressing mode of an instruction with an operand word. */
  mode?: AddressingMode;
}

export interface AssembledProgram {
  /** Always MEMORY_SIZE words. */
  memory: number[];
  /** label -> address, using the label's original casing. */
  symbols: Record<string, number>;
  lines: AssembledLine[];
  /** Mailboxes that came from DAT lines. */
  dataAddresses: number[];
  /** Mailboxes used by the program (from address 00). */
  size: number;
  dialect: Dialect;
  /** Extended dialect with peripherals on: the names the assembler defined itself, and their mailboxes. */
  peripheralSymbols?: Record<string, number>;
}

export type AssembleResult =
  | { ok: true; program: AssembledProgram }
  | { ok: false; errors: AsmError[] };

/** X (index register) and OPR (operand register) exist only in the extended dialect. */
export type Register = 'PC' | 'ACC' | 'MAR' | 'MDR' | 'CIR' | 'X' | 'OPR';
