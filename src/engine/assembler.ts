import {
  EXT_ALLOWED,
  EXT_BASE,
  EXT_FIXED,
  FIRST_PERIPHERAL,
  MODE_DIGIT,
  PERIPHERAL_SYMBOLS,
  SLEEP_WORD,
  type AddressingMode,
  decodeExtended,
} from './extended';
import {
  MEMORY_SIZE,
  WORD_MAX,
  WORD_MIN,
  type AsmError,
  type AssembleResult,
  type AssembledLine,
  type Dialect,
  type Mnemonic,
} from './types';

/** Opcode base (hundreds digit x 100) for instructions that take a mailbox address. */
const ADDRESS_OPCODES: Record<string, number> = {
  ADD: 100,
  SUB: 200,
  STA: 300,
  LDA: 500,
  BRA: 600,
  BRZ: 700,
  BRP: 800,
};

/** Fixed machine words for instructions that take no operand. */
const FIXED_WORDS: Record<string, number> = { INP: 901, OUT: 902, HLT: 0, HCF: 999 };

/**
 * Alternative mnemonics that OCR's specification (Appendix 5d) says are accepted in candidates' answers.
 * Some are also everyday label names (`end`, `in`), so an alias may still be used as a label or an operand;
 * see the parsing below.
 */
export const ALIASES: Readonly<Record<string, Mnemonic>> = {
  STO: 'STA',
  LOAD: 'LDA',
  BR: 'BRA',
  BZ: 'BRZ',
  BP: 'BRP',
  IN: 'INP',
  INPUT: 'INP',
  COB: 'HLT',
  END: 'HLT',
};

/** The instruction vocabulary of a dialect. */
interface Vocab {
  /** Instructions that take an operand. */
  address: Readonly<Record<string, number>>;
  /** Instructions that take none. */
  fixed: Readonly<Record<string, number>>;
  primary: Set<string>;
  mnemonics: Set<string>;
}

function vocab(address: Readonly<Record<string, number>>, fixed: Readonly<Record<string, number>>): Vocab {
  const primary = new Set([...Object.keys(address), ...Object.keys(fixed), 'DAT']);
  return { address, fixed, primary, mnemonics: new Set([...primary, ...Object.keys(ALIASES)]) };
}

const VOCABS: Record<Dialect, Vocab> = {
  standard: vocab(ADDRESS_OPCODES, FIXED_WORDS),
  extended: vocab({ ...EXT_BASE, SLEEP: SLEEP_WORD }, EXT_FIXED),
};

const LABEL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const MODE_NAMES: Record<AddressingMode, string> = {
  direct: 'a plain label or mailbox number',
  immediate: 'an immediate value (#5)',
  indirect: 'an indirect operand ((5))',
  indexed: 'an indexed operand (5,X)',
};

/** Explain why an operand is not a label or mailbox number (standard dialect). */
function operandError(mnemonic: Mnemonic, operand: string): string {
  const usesData = mnemonic === 'ADD' || mnemonic === 'SUB' || mnemonic === 'STA' || mnemonic === 'LDA';
  if (operand.startsWith('#') && usesData) {
    return `'${operand}' is not allowed: the operand must be a label or a mailbox number, and ${mnemonic} uses the contents of that mailbox, never a number written in the instruction. Store the number with DAT (for example "one DAT 1") and write ${mnemonic} one.`;
  }
  if (/^[#(]/.test(operand) || operand.includes(',')) {
    return `'${operand}' is not allowed: the operand must be a label or a mailbox number (00-${MEMORY_SIZE - 1}).`;
  }
  return `'${operand}' is not a valid label or mailbox address`;
}

interface ParsedLine {
  line: number;
  src: string;
  label?: string;
  mnemonic: Mnemonic;
  operand?: string;
  /** Words this line occupies. */
  len: number;
  addr: number;
}

export interface AssembleOptions {
  /** Default `standard`. */
  dialect?: Dialect;
  /**
   * Extended dialect only: reserve mailboxes 94-99 for the switches and lamps and predefine their names
   * (`switch1`..`switch3`, `lamp1`..`lamp3`). Default false.
   */
  peripherals?: boolean;
}

/**
 * Two-pass assembler.
 * Pass 1 parses the source and records each label's address (in the extended dialect the length of every
 * instruction matters, which is why this pass is essential); pass 2 resolves operands into machine words.
 * All errors are collected (not just the first) so the UI can show them together.
 */
export function assemble(source: string, options: AssembleOptions = {}): AssembleResult {
  const dialect = options.dialect ?? 'standard';
  const v = VOCABS[dialect];
  const extended = dialect === 'extended';
  const peripherals = extended && !!options.peripherals;
  const isPrimary = (token: string) => v.primary.has(token.toUpperCase());
  const asMnemonic = (token: string): Mnemonic | undefined => {
    const up = token.toUpperCase();
    if (!v.mnemonics.has(up)) return undefined;
    return (ALIASES[up] ?? up) as Mnemonic;
  };

  const errors: AsmError[] = [];
  const parsed: ParsedLine[] = [];

  // ---- Pass 1a: parse ----
  source.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const text = raw.replace(/\/\/.*$/, '').trim();
    if (!text) return;

    const tokens = text.split(/\s+/);
    let label: string | undefined;

    // A first token that is not a mnemonic is a label.
    if (!asMnemonic(tokens[0])) {
      // Only one word, or a word then a number, means the first word was meant as an instruction.
      if (tokens.length === 1 || (tokens.length === 2 && /^\d+$/.test(tokens[1]))) {
        errors.push({ line, message: `Unknown instruction '${tokens[0]}'` });
        return;
      }
      label = tokens.shift()!;
      if (!LABEL_RE.test(label)) {
        errors.push({
          line,
          message: /^\d/.test(label)
            ? `Label '${label}' cannot start with a digit`
            : `'${label}' is not a valid label (use letters, digits and underscores)`,
        });
        return;
      }
    } else if (tokens.length > 1 && asMnemonic(tokens[1])) {
      // Two instruction-like words in a row. A real mnemonic first is a mistake (`add ADD x`);
      // an alias first is a label when that is the only way to read the line.
      const first = tokens[0].toUpperCase();
      if (isPrimary(first)) {
        // `BRZ end`: a real mnemonic followed by an alias is an instruction and its operand.
        if (isPrimary(tokens[1])) {
          errors.push({ line, message: `'${tokens[0]}' is an instruction name and cannot be used as a label` });
          return;
        }
      } else if (isPrimary(tokens[1]) || !((ALIASES[first] as string) in v.address)) {
        // `end HLT`, `end END`: the alias is a label. (`BR end` is left alone: BR needs an operand.)
        label = tokens.shift()!;
      }
    }

    const mnemonic = asMnemonic(tokens[0]);
    if (!mnemonic) {
      errors.push({ line, message: `Unknown instruction '${tokens[0]}'` });
      return;
    }
    let args = tokens.slice(1);
    // `LDA data, X` and `LDA data ,X` mean `LDA data,X`
    if (extended && args.length === 2 && (args[0].endsWith(',') ? args[1].toUpperCase() === 'X' : args[1].toUpperCase() === ',X')) {
      args = [args[0] + args[1]];
    }
    const wantsAddress = mnemonic in v.address;

    if (wantsAddress && args.length === 0) {
      errors.push({
        line,
        message: mnemonic === 'SLEEP' ? 'SLEEP needs a number of milliseconds, for example SLEEP 500' : `${mnemonic} needs an operand (a label or mailbox address)`,
      });
      return;
    }
    if (!wantsAddress && mnemonic !== 'DAT' && args.length > 0) {
      errors.push({ line, message: `${mnemonic} does not take an operand` });
      return;
    }
    if (args.length > 1) {
      errors.push({ line, message: `Unexpected '${args[1]}' after the operand` });
      return;
    }

    parsed.push({ line, src: raw, label, mnemonic, operand: args[0], len: extended && wantsAddress ? 2 : 1, addr: 0 });
  });

  if (parsed.length === 0 && errors.length === 0) {
    errors.push({ line: 1, message: 'The program is empty' });
  }

  // ---- Pass 1b: addresses and symbol table ----
  // The extended dialect predefines the peripheral names; they are not part of `symbols`, which holds the program's own labels.
  const symbolsLower = new Map<string, number>(peripherals ? Object.entries(PERIPHERAL_SYMBOLS).map(([k, v]) => [k.toLowerCase(), v]) : []);
  const symbols: Record<string, number> = {};
  const limit = peripherals ? FIRST_PERIPHERAL : MEMORY_SIZE;
  const lowerPeripherals = Object.fromEntries(Object.entries(PERIPHERAL_SYMBOLS).map(([k, v]) => [k.toLowerCase(), v]));
  let size = 0;
  let overflowReported = false;
  for (const p of parsed) {
    p.addr = size;
    size += p.len;
    if (size > limit && !overflowReported) {
      overflowReported = true;
      errors.push({
        line: p.line,
        message: peripherals
          ? `Program is too long: mailboxes 00-${limit - 1} are free, and ${limit}-${MEMORY_SIZE - 1} are the peripherals. Each instruction with an operand uses two`
          : `Program is too long: memory only has ${MEMORY_SIZE} mailboxes (00-${MEMORY_SIZE - 1})${extended ? '. Each instruction with an operand uses two' : ''}`,
      });
    }
    if (p.label === undefined) continue;
    const key = p.label.toLowerCase();
    if (peripherals && key in lowerPeripherals) {
      errors.push({ line: p.line, message: `'${p.label}' is a peripheral (mailbox ${lowerPeripherals[key]}) and cannot be used as a label` });
    } else if (symbolsLower.has(key)) {
      errors.push({ line: p.line, message: `Label '${p.label}' is already defined` });
    } else {
      symbolsLower.set(key, p.addr);
      symbols[p.label] = p.addr;
    }
  }

  // ---- Pass 2: generate machine code ----
  const memory = new Array<number>(MEMORY_SIZE).fill(0);
  const lines: AssembledLine[] = [];
  const dataAddresses: number[] = [];

  /** A label or a mailbox number 00-99. */
  const resolveAddress = (text: string, line: number): number | undefined => {
    if (/^\d+$/.test(text)) {
      const n = parseInt(text, 10);
      if (n >= MEMORY_SIZE) {
        errors.push({ line, message: `Mailbox address ${n} is out of range (00-${MEMORY_SIZE - 1})` });
        return undefined;
      }
      return n;
    }
    if (LABEL_RE.test(text)) {
      const found = symbolsLower.get(text.toLowerCase());
      if (found === undefined) errors.push({ line, message: `Undefined label '${text}'` });
      return found;
    }
    return undefined;
  };

  for (const p of parsed) {
    if (p.addr + p.len > MEMORY_SIZE) break; // already reported as too long
    const { mnemonic, operand, line, addr } = p;
    let words: number[] = [0];
    let mode: AddressingMode | undefined;

    if (mnemonic === 'DAT') {
      dataAddresses.push(addr);
      if (operand !== undefined) {
        if (!/^[+-]?\d+$/.test(operand)) {
          errors.push({ line, message: `DAT value '${operand}' must be a whole number` });
        } else {
          const n = parseInt(operand, 10);
          if (n < WORD_MIN || n > WORD_MAX) {
            errors.push({ line, message: `DAT value ${n} is outside ${WORD_MIN} to ${WORD_MAX}` });
          } else {
            words = [n];
          }
        }
      }
    } else if (mnemonic === 'SLEEP') {
      // A whole number 0-999, with or without a #.
      const m = /^#?(\d+)$/.exec(operand!);
      let ms: number | undefined;
      if (!m) {
        errors.push({ line, message: `SLEEP takes a whole number of milliseconds from 0 to 999, for example SLEEP 500 (got '${operand}')` });
      } else if (parseInt(m[1], 10) > WORD_MAX) {
        errors.push({ line, message: `SLEEP ${parseInt(m[1], 10)} is too long: the most is ${WORD_MAX} milliseconds. Use several SLEEPs in a row for longer.` });
      } else {
        ms = parseInt(m[1], 10);
      }
      words = [SLEEP_WORD, ms ?? 0];
      mode = 'immediate';
    } else if (extended && mnemonic in v.address) {
      // Work out the addressing mode from the operand's shape.
      let ref = operand!;
      let m: RegExpExecArray | null;
      if (ref.startsWith('#')) {
        mode = 'immediate';
        ref = ref.slice(1);
      } else if ((m = /^\((.*)\)$/.exec(ref))) {
        mode = 'indirect';
        ref = m[1];
      } else if ((m = /^(.+),X$/i.exec(ref))) {
        mode = 'indexed';
        ref = m[1];
      } else {
        mode = 'direct';
      }

      let opWord: number | undefined;
      if (!EXT_ALLOWED[mnemonic].includes(mode)) {
        const allowed = EXT_ALLOWED[mnemonic].map((a) => MODE_NAMES[a]).join(', or ');
        errors.push({
          line,
          message: `${mnemonic} cannot take ${MODE_NAMES[mode]}${mnemonic === 'STA' && mode === 'immediate' ? ' (a constant cannot be stored into)' : ''}. It takes ${allowed}.`,
        });
      } else if (mode === 'immediate') {
        if (!/^\d+$/.test(ref)) {
          errors.push({ line, message: `An immediate operand is # followed by a number, for example #5 (got '${operand}')` });
        } else if (parseInt(ref, 10) > WORD_MAX) {
          errors.push({ line, message: `Immediate value ${ref} is outside 0 to ${WORD_MAX}` });
        } else {
          opWord = parseInt(ref, 10);
        }
      } else if (!/^\d+$/.test(ref) && !LABEL_RE.test(ref)) {
        errors.push({ line, message: `'${operand}' is not a valid operand: use a label or a mailbox number${mode === 'direct' ? '' : ` inside the ${mode === 'indirect' ? 'brackets' : 'x,X form'}`}` });
      } else {
        opWord = resolveAddress(ref, line);
      }
      words = [EXT_BASE[mnemonic] + MODE_DIGIT[mode] * 10, opWord ?? 0];
    } else if (mnemonic in v.address) {
      const target = /^\d+$/.test(operand!) || LABEL_RE.test(operand!) ? resolveAddress(operand!, line) : undefined;
      if (!/^\d+$/.test(operand!) && !LABEL_RE.test(operand!)) {
        errors.push({ line, message: operandError(mnemonic, operand!) });
      }
      words = [v.address[mnemonic] + (target ?? 0)];
    } else {
      words = [v.fixed[mnemonic]];
    }

    words.forEach((w, k) => (memory[addr + k] = w));
    lines.push({ line, src: p.src, addr, mnemonic, label: p.label, operand, word: words[0], words, mode });
  }

  if (errors.length > 0) {
    errors.sort((a, b) => a.line - b.line);
    return { ok: false, errors };
  }
  return {
    ok: true,
    program: { memory, symbols, lines, dataAddresses, size, dialect, peripheralSymbols: peripherals ? { ...PERIPHERAL_SYMBOLS } : undefined },
  };
}

/**
 * Turn a machine word back into assembly text, e.g. 705 -> "BRZ 5" (standard dialect).
 * Returns undefined when the word is not a valid instruction (data, or an illegal opcode).
 * Pass `labelAt` to show label names instead of numbers for branch/memory operands.
 * For the extended dialect use `disassembleExtended`.
 */
export function disassemble(word: number, labelAt?: (addr: number) => string | undefined): string | undefined {
  if (!Number.isInteger(word) || word < 0 || word > 999) return undefined;
  if (word === 0) return 'HLT';
  if (word === 901) return 'INP';
  if (word === 902) return 'OUT';
  if (word === 999) return 'HCF'; // undocumented
  const opcode = Math.floor(word / 100);
  const addr = word % 100;
  const name = Object.keys(ADDRESS_OPCODES).find((m) => ADDRESS_OPCODES[m] / 100 === opcode);
  if (!name) return undefined;
  return `${name} ${labelAt?.(addr) ?? addr}`;
}

/** True when `word` is a valid instruction in the given dialect. */
export function isInstruction(word: number, dialect: Dialect): boolean {
  return dialect === 'extended' ? decodeExtended(word) !== undefined : disassemble(word) !== undefined;
}
