// Plain-English breakdown of a machine-code word, for the hover bubble.
import { decodeExtended, disassemble, type AddressingMode, type Dialect } from './engine';
import { pad2 } from './format';

export type DigitRole = 'opcode' | 'mode' | 'operand' | 'spare';

export interface WordExplanation {
  kind: 'instruction' | 'data' | 'empty' | 'illegal' | 'operand' | 'other';
  /** The word as shown, e.g. `506` or `-7`. */
  word: string;
  title: string;
  /** For instructions: the digit split, so the UI can colour opcode, mode and operand differently. */
  digits?: { digit: string; role: DigitRole }[];
  opcode?: string;
  operand?: string;
  /** Extended dialect only. The standard LMC has a single way to use an operand, so it never mentions modes. */
  mode?: { name: string; text: string };
  effect?: string;
  note?: string;
}

export interface ExplainOptions {
  /** Default `standard`. */
  dialect?: Dialect;
  /** The mailbox came from a DAT line. */
  isData?: boolean;
  /** The mailbox is beyond the program. */
  isEmpty?: boolean;
  /** Label naming a mailbox address, if any. */
  labelAt?: (addr: number) => string | undefined;
  /** Current memory contents, used to say what an operand mailbox holds right now. */
  memory?: readonly number[];
  /** Extended: the word in the next mailbox, which is this instruction's operand word. */
  operandWord?: number;
  /** Extended: the current value of the index register X. */
  x?: number;
  /** Extended: set when the word is the operand word of the instruction at `addr`. */
  operandOf?: { addr: number; mnemonic: string; mode: AddressingMode };
  /** Set when the mailbox is a memory-mapped switch or lamp (extended LMC, peripherals on). */
  peripheral?: { title: string; note: string };
}

const ADDRESS_OPS: Record<number, { mnemonic: string; text: string; effect: (a: string) => string }> = {
  1: { mnemonic: 'ADD', text: 'add the contents of a mailbox to the accumulator', effect: (a) => `ACC ← ACC + [${a}]` },
  2: { mnemonic: 'SUB', text: 'subtract the contents of a mailbox from the accumulator', effect: (a) => `ACC ← ACC − [${a}]` },
  3: { mnemonic: 'STA', text: 'store the accumulator in a mailbox', effect: (a) => `[${a}] ← ACC` },
  5: { mnemonic: 'LDA', text: 'load the contents of a mailbox into the accumulator', effect: (a) => `ACC ← [${a}]` },
  6: { mnemonic: 'BRA', text: 'branch always', effect: (a) => `PC ← ${a}` },
  7: { mnemonic: 'BRZ', text: 'branch if the accumulator is zero', effect: (a) => `if ACC = 0 then PC ← ${a}` },
  8: { mnemonic: 'BRP', text: 'branch if the accumulator is zero or positive', effect: (a) => `if ACC ≥ 0 then PC ← ${a}` },
};

const isBranch = (opcode: number) => opcode >= 6 && opcode <= 8;

function wordText(word: number) {
  return word >= 0 ? word.toString().padStart(3, '0') : String(word);
}

export function explainWord(word: number, options: ExplainOptions = {}): WordExplanation {
  const text = wordText(word);
  const extended = options.dialect === 'extended';

  if (options.operandOf) return explainOperandWord(word, text, options);
  if (options.peripheral) return { kind: 'other', word: text, title: options.peripheral.title, note: options.peripheral.note };

  if (options.isEmpty && word === 0) {
    return { kind: 'empty', word: text, title: 'Empty mailbox', note: 'Nothing has been stored here. It holds 000.' };
  }

  const asInstruction = extended ? decodeExtended(word)?.mnemonic : disassemble(word);
  if (options.isData) {
    const note = word === 0
      ? 'Reserved with DAT and starting at 0. It is only a number, but if the CPU ever fetches it, 000 is read as HLT.'
      : asInstruction
        ? `Reserved with DAT. It is only a number, but if the CPU ever fetched it, it would be read as ${extended ? asInstruction : disassemble(word)}.`
        : 'Reserved with DAT. It is only a number, and it is not a valid instruction.';
    return { kind: 'data', word: text, title: `Data: ${word}`, note };
  }

  // Undocumented on purpose: give nothing away.
  if (word === 999) {
    return { kind: 'other', word: text, title: 'Not in the instruction set', note: 'This is not a documented instruction. Handle with care.' };
  }

  if (asInstruction === undefined) {
    const valid = Number.isInteger(word) && word >= 0 && word <= 999;
    return {
      kind: 'illegal',
      word: text,
      title: 'Not a valid instruction',
      digits: valid ? [...text].map((digit, i) => ({ digit, role: (i === 0 ? 'opcode' : 'operand') as DigitRole })) : undefined,
      note: valid
        ? `${extended ? `${text} is not a valid instruction in the extended LMC` : `Opcode ${text[0]} is not used here`}. If the CPU tried to execute ${text} the simulator would stop with an illegal instruction error.`
        : 'Mailboxes hold three digits, 000 to 999. This value is outside that range.',
    };
  }

  return extended ? explainExtended(word, text, options) : explainStandard(word, text, options);
}

function explainStandard(word: number, text: string, options: ExplainOptions): WordExplanation {
  const opcode = Math.floor(word / 100);
  const xx = word % 100;
  const at = pad2(xx);
  const digits = [...text].map((digit, i) => ({ digit, role: (i === 0 ? 'opcode' : 'operand') as DigitRole }));
  const label = options.labelAt?.(xx);
  const where = `mailbox ${at}${label ? ` (${label})` : ''}`;

  const op = ADDRESS_OPS[opcode];
  if (op) {
    const holds = options.memory && !isBranch(opcode) ? `, which currently holds ${options.memory[xx]}` : '';
    return {
      kind: 'instruction',
      word: text,
      title: `${op.mnemonic} ${label ?? at}`,
      digits,
      opcode: `${op.mnemonic}: ${op.text}`,
      operand: isBranch(opcode)
        ? `${where}, the address of the next instruction to run`
        : `${where}${holds}. ${op.mnemonic} ${at} uses what is stored there, not the number ${xx}.`,
      effect: op.effect(at),
    };
  }

  if (word === 0) {
    return {
      kind: 'instruction',
      word: text,
      title: 'HLT',
      digits,
      opcode: 'HLT: stop the program',
      operand: '00, ignored: HLT does not use an address',
      effect: 'stop',
    };
  }

  // 901 and 902: opcode 9 is the input/output group and the last digits pick the operation.
  const isInput = word === 901;
  return {
    kind: 'instruction',
    word: text,
    title: isInput ? 'INP' : 'OUT',
    digits,
    opcode: '9: the input/output group',
    operand: `${at}, not an address. With opcode 9 the last two digits pick the operation: 01 is INP, 02 is OUT`,
    effect: isInput ? 'ACC ← input' : 'output ← ACC',
  };
}

// ---------- extended dialect ----------

const MODE_TEXT: Record<AddressingMode, string> = {
  direct: 'the operand is the address of the data',
  immediate: 'the operand is the data itself',
  indirect: 'the operand is the address of a mailbox that holds the address of the data (a pointer)',
  indexed: 'the address of the data is the operand plus the index register X',
};

const MODE_DIGIT_NAME: Record<AddressingMode, string> = { direct: '0', immediate: '1', indirect: '2', indexed: '3' };

function effectExtended(mnemonic: string, mode: AddressingMode, operand: number): string {
  const at = pad2(operand);
  const target = mode === 'direct' ? `[${at}]` : mode === 'immediate' ? `${operand}` : mode === 'indirect' ? `[[${at}]]` : `[${at} + X]`;
  switch (mnemonic) {
    case 'LDA': return `ACC ← ${target}`;
    case 'ADD': return `ACC ← ACC + ${target}`;
    case 'SUB': return `ACC ← ACC − ${target}`;
    case 'LDX': return `X ← ${target}`;
    case 'STA': return `${target} ← ACC`;
    case 'BRA': return `PC ← ${at}`;
    case 'BRZ': return `if ACC = 0 then PC ← ${at}`;
    default: return `if ACC ≥ 0 then PC ← ${at}`;
  }
}

const EXT_TEXT: Record<string, string> = {
  ADD: 'add a value to the accumulator',
  SUB: 'subtract a value from the accumulator',
  STA: 'store the accumulator in a mailbox',
  LDA: 'load a value into the accumulator',
  LDX: 'load a value into the index register X',
  BRA: 'branch always',
  BRZ: 'branch if the accumulator is zero',
  BRP: 'branch if the accumulator is zero or positive',
};

function explainExtended(word: number, text: string, options: ExplainOptions): WordExplanation {
  const d = decodeExtended(word)!;
  const label = (a: number) => options.labelAt?.(a);

  if (d.length === 1) {
    if (word === 0) {
      return {
        kind: 'instruction', word: text, title: 'HLT',
        digits: [{ digit: '0', role: 'opcode' }, { digit: '0', role: 'spare' }, { digit: '0', role: 'spare' }],
        opcode: 'HLT: stop the program', effect: 'stop', note: 'One word: HLT has no operand word.',
      };
    }
    const info: Record<string, { text: string; effect: string; operation: string }> = {
      INP: { text: 'input a number into the accumulator', effect: 'ACC ← input', operation: '1' },
      OUT: { text: 'output the accumulator', effect: 'output ← ACC', operation: '2' },
      INX: { text: 'add 1 to the index register X', effect: 'X ← X + 1', operation: '3' },
      TXA: { text: 'copy the index register X into the accumulator', effect: 'ACC ← X', operation: '4' },
    };
    const i = info[d.mnemonic];
    return {
      kind: 'instruction', word: text, title: d.mnemonic,
      digits: [{ digit: '9', role: 'opcode' }, { digit: '0', role: 'spare' }, { digit: text[2], role: 'operand' }],
      opcode: `9: the input/output and index group`,
      operand: `${text[2]} chooses the operation here: 1 is INP, 2 is OUT, 3 is INX, 4 is TXA. It is not an address.`,
      effect: i.effect,
      note: `${d.mnemonic}: ${i.text}. One word: no operand word follows.`,
    };
  }

  // SLEEP is two words in group 9: 905, then the number of milliseconds.
  if (d.mnemonic === 'SLEEP') {
    const ms = options.operandWord;
    return {
      kind: 'instruction',
      word: text,
      title: ms === undefined ? 'SLEEP' : `SLEEP ${ms}`,
      digits: [{ digit: '9', role: 'opcode' }, { digit: '0', role: 'spare' }, { digit: '5', role: 'operand' }],
      opcode: '9: the input/output and index group',
      operand: `5 chooses the operation here (SLEEP). The next mailbox holds ${ms === undefined ? 'the number of milliseconds' : ms}, the time to wait in milliseconds (0 to 999). It is fetched into the OPR.`,
      effect: ms === undefined ? undefined : `wait ${ms} ms`,
      note: 'SLEEP is an extra in the extended LMC, which is not part of the OCR specification. The machine only reports the wait; the simulator does the waiting, and only when a program is running at a timed speed.',
    };
  }

  // Two words: opcode word O M 0, then an operand word in the next mailbox.
  const mode = d.mode!;
  const operandWord = options.operandWord;
  const digits = [
    { digit: text[0], role: 'opcode' as DigitRole },
    { digit: text[1], role: 'mode' as DigitRole },
    { digit: text[2], role: 'spare' as DigitRole },
  ];
  const shownOperand = operandWord === undefined ? '…' : mode === 'immediate' ? String(operandWord) : (label(operandWord) ?? pad2(operandWord));
  const title = `${d.mnemonic} ${mode === 'immediate' ? '#' : mode === 'indirect' ? '(' : ''}${shownOperand}${mode === 'indirect' ? ')' : mode === 'indexed' ? ',X' : ''}`;

  let operand = 'the word in the next mailbox';
  if (operandWord !== undefined) {
    operand = `the next mailbox holds ${operandWord}`;
    if (mode !== 'immediate') {
      const mem = options.memory;
      operand += ` (mailbox ${pad2(operandWord)}${label(operandWord) ? `, ${label(operandWord)}` : ''})`;
      if (mem && mode === 'direct' && d.mnemonic !== 'STA' && !isBranch(Math.floor(word / 100))) operand += `, which holds ${mem[operandWord]}`;
      if (mem && mode === 'indirect' && mem[operandWord] !== undefined) operand += `, a pointer to mailbox ${pad2(mem[operandWord])}`;
      if (mode === 'indexed' && options.x !== undefined) operand += `; with X = ${options.x} the address is ${operandWord + options.x}`;
    }
  }

  return {
    kind: 'instruction',
    word: text,
    title,
    digits,
    opcode: `${d.mnemonic}: ${EXT_TEXT[d.mnemonic]}`,
    operand: `${operand}. It is fetched into the OPR after this word is decoded.`,
    mode: { name: `${mode[0].toUpperCase()}${mode.slice(1)} (${MODE_DIGIT_NAME[mode]})`, text: MODE_TEXT[mode] },
    effect: operandWord === undefined ? undefined : effectExtended(d.mnemonic, mode, operandWord),
    note: 'This is the extended LMC, which is not part of the OCR specification.',
  };
}

function explainOperandWord(word: number, text: string, options: ExplainOptions): WordExplanation {
  const { addr, mnemonic, mode } = options.operandOf!;
  if (mnemonic === 'SLEEP') {
    return {
      kind: 'operand',
      word: text,
      title: 'Operand of SLEEP',
      operand: `${word}: the number of milliseconds to wait`,
      note: 'This word belongs to the SLEEP instruction before it. The CPU fetches it into the OPR; it is not executed as an instruction.',
    };
  }
  const isValue = mode === 'immediate';
  const label = !isValue ? options.labelAt?.(word) : undefined;
  return {
    kind: 'operand',
    word: text,
    title: `Operand of ${mnemonic}`,
    operand: isValue
      ? `${word}: the value itself, because the instruction at mailbox ${pad2(addr)} is immediate`
      : `${pad2(word)}${label ? ` (${label})` : ''}: a mailbox address, because the instruction at mailbox ${pad2(addr)} is ${mode}`,
    note: 'This word belongs to the instruction before it. The CPU fetches it into the OPR; it is not executed as an instruction.',
  };
}
