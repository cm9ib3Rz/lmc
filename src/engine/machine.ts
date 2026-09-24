import { disassemble } from './assembler';
import { decodeExtended, type DecodedExtended } from './extended';
import { MEMORY_SIZE, WORD_MAX, WORD_MIN, type Dialect, type Register } from './types';

export type Phase = 'fetch' | 'decode' | 'execute';
export type MachineStatus = 'ready' | 'waiting-input' | 'halted' | 'error';

/**
 * Where `PC ← PC + 1` sits in the fetch. `late` (default): last, after `CIR ← MDR`, as in OCR's 2015 delivery guide for 1.1.1
 * and in Wikipedia's account of the cycle. `early`: straight after `MAR ← PC`, as some textbooks have it.
 */
export type PcIncrement = 'early' | 'late';

/** What travels on the three buses during a memory access. */
export interface BusActivity {
  address: string;
  data: string;
  control: string;
}

export interface RegisterChange {
  reg: Register;
  from: number;
  to: number;
}

/** One line of register-transfer notation: the smallest unit the machine steps through. */
export interface MicroStep {
  phase: Phase;
  /** Register-transfer notation with the operand filled in, e.g. `MAR ← 12`. */
  rtn: string;
  /** The same step with the actual values, e.g. `MDR ← [12] = 7`. */
  detail: string;
  /** Mailbox holding the instruction this step belongs to. */
  addr: number;
  changes: RegisterChange[];
  /** Mailbox read by this step. */
  read?: number;
  /** Mailbox written by this step. */
  write?: number;
  /** Value taken from the inbox. */
  input?: number;
  /** Value sent to the outbox. */
  output?: number;
  warning?: string;
  error?: string;
  /** The machine has caught fire (HCF). */
  fire?: boolean;
  /** Present when the step reads or writes memory. */
  bus?: BusActivity;
  /** SLEEP: the number of milliseconds the program asked to wait. The machine does not wait; the caller decides. */
  sleep?: number;
  /** True on the last step of an instruction (also on HLT and on errors). */
  instructionEnd: boolean;
}

export interface MachineOptions {
  /** What to do when ADD/SUB takes the accumulator outside -999..999. Default: `warn`. */
  overflow?: 'warn' | 'error';
  /** Accept negative numbers as input. Default: false (inputs are 0..999). */
  allowNegativeInput?: boolean;
  /** Mailboxes that came from DAT lines; executing one produces a warning. */
  dataAddresses?: readonly number[];
  /** Where the PC is incremented in the fetch. Default `late` (OCR's order). */
  pcIncrement?: PcIncrement;
  /** `standard` (default) is the LMC as OCR specifies it; `extended` adds addressing modes (see extended.ts). */
  dialect?: Dialect;
}

export interface RunOptions {
  /** Instruction limit, so an infinite loop cannot hang the page. Default 10 000. */
  maxInstructions?: number;
  /** Stop before executing the instruction at any of these mailboxes. */
  breakpoints?: ReadonlySet<number>;
}

export interface RunResult {
  reason: 'halted' | 'error' | 'waiting-input' | 'step-limit' | 'breakpoint';
  /** Instructions completed during this call. */
  instructions: number;
}

export interface MachineSnapshot {
  memory: number[];
  regs: Record<Register, number>;
  microIndex: number;
  curAddr: number;
  input: number[];
  output: number[];
  status: MachineStatus;
  error?: string;
  onFire: boolean;
  sleptMs: number;
  instructionCount: number;
  microCount: number;
}

interface OpResult {
  detail: string;
  read?: number;
  write?: number;
  input?: number;
  output?: number;
  warning?: string;
  error?: string;
  /** The operation could not run yet (INP with an empty inbox); nothing has changed. */
  blocked?: boolean;
  halt?: boolean;
  fire?: boolean;
  bus?: BusActivity;
  sleep?: number;
}

interface Op {
  phase: Phase;
  rtn: string;
  run: () => OpResult;
}

/** Fetch is four steps, then one decode step; execute steps follow. */
const FETCH_DECODE_STEPS = 5;
const DECODE_INDEX = 4;

const pad2 = (n: number) => n.toString().padStart(2, '0');

const zeroRegs = (): Record<Register, number> => ({ PC: 0, ACC: 0, MAR: 0, MDR: 0, CIR: 0, X: 0, OPR: 0 });

const busRead = (addr: number, value: number): BusActivity => ({
  address: `${pad2(addr)}: MAR → memory`,
  data: `${value}: memory → MDR`,
  control: 'memory read',
});

const busWrite = (addr: number, value: number): BusActivity => ({
  address: `${pad2(addr)}: MAR → memory`,
  data: `${value}: MDR → memory`,
  control: 'memory write',
});

export class Machine {
  private readonly options: Required<Omit<MachineOptions, 'dataAddresses' | 'pcIncrement' | 'dialect'>>;
  readonly dialect: Dialect;
  private readonly dataAddresses: ReadonlySet<number>;
  private readonly initialMemory: number[];
  private initialInput: number[] = [];

  private mem: number[];
  private regs: Record<Register, number> = zeroRegs();
  private inbox: number[] = [];
  private outbox: number[] = [];
  private microIndex = 0;
  private curAddr = 0;
  private changes: RegisterChange[] = [];

  /** Change this only between instructions; the UI resets the machine when it changes. */
  pcIncrement: PcIncrement;
  status: MachineStatus = 'ready';
  error?: string;
  /** Set by the undocumented HCF instruction (opcode 999): halt and catch fire. */
  onFire = false;
  /** Total milliseconds all the SLEEP instructions have asked for so far (a virtual clock; nothing here waits). */
  sleptMs = 0;
  instructionCount = 0;
  microCount = 0;

  constructor(memory: readonly number[], options: MachineOptions = {}, inputs: readonly number[] = []) {
    if (memory.length !== MEMORY_SIZE) throw new RangeError(`Memory must have ${MEMORY_SIZE} words`);
    this.options = { overflow: options.overflow ?? 'warn', allowNegativeInput: options.allowNegativeInput ?? false };
    this.dataAddresses = new Set(options.dataAddresses ?? []);
    this.pcIncrement = options.pcIncrement ?? 'late';
    this.dialect = options.dialect ?? 'standard';
    this.initialMemory = [...memory];
    this.mem = [...memory];
    inputs.forEach((n) => this.checkInput(n));
    this.initialInput = [...inputs];
    this.inbox = [...inputs];
  }

  // ---- state access ----

  get pc() { return this.regs.PC; }
  get acc() { return this.regs.ACC; }
  get mar() { return this.regs.MAR; }
  get mdr() { return this.regs.MDR; }
  get cir() { return this.regs.CIR; }
  /** Index register (extended dialect). */
  get x() { return this.regs.X; }
  /** Operand register (extended dialect): the operand word of the current instruction. */
  get opr() { return this.regs.OPR; }
  get memory(): readonly number[] { return this.mem; }
  get output(): readonly number[] { return this.outbox; }
  get input(): readonly number[] { return this.inbox; }
  /** The phase the next micro-step will belong to. */
  get nextPhase(): Phase {
    if (this.microIndex < DECODE_INDEX) return 'fetch';
    if (this.microIndex === DECODE_INDEX) return 'decode';
    return this.opAt(this.microIndex).phase; // an extended instruction fetches its operand after decoding
  }
  /** True between instructions (the next step starts a fetch). */
  get atInstructionBoundary() { return this.microIndex === 0; }

  // ---- control ----

  /** Restore the starting memory and registers. Pass `inputs` to replace the initial inbox. */
  reset(inputs?: readonly number[]) {
    if (inputs) {
      inputs.forEach((n) => this.checkInput(n));
      this.initialInput = [...inputs];
    }
    this.mem = [...this.initialMemory];
    this.regs = zeroRegs();
    this.inbox = [...this.initialInput];
    this.outbox = [];
    this.microIndex = 0;
    this.curAddr = 0;
    this.status = 'ready';
    this.error = undefined;
    this.onFire = false;
    this.sleptMs = 0;
    this.instructionCount = 0;
    this.microCount = 0;
  }

  /** Add a number to the inbox. Resumes a machine that was waiting for input. */
  pushInput(value: number) {
    this.checkInput(value);
    this.inbox.push(value);
    if (this.status === 'waiting-input') this.status = 'ready';
  }

  /** Overwrite a mailbox directly (a teaching aid, not something the CPU can do). Undone by `reset()`. */
  poke(addr: number, value: number) {
    if (!Number.isInteger(addr) || addr < 0 || addr >= MEMORY_SIZE) throw new RangeError(`There is no mailbox ${addr}`);
    if (!Number.isInteger(value) || value < WORD_MIN || value > WORD_MAX) {
      throw new RangeError(`A mailbox holds a whole number from ${WORD_MIN} to ${WORD_MAX}`);
    }
    this.mem[addr] = value;
  }

  snapshot(): MachineSnapshot {
    return {
      memory: [...this.mem],
      regs: { ...this.regs },
      microIndex: this.microIndex,
      curAddr: this.curAddr,
      input: [...this.inbox],
      output: [...this.outbox],
      status: this.status,
      error: this.error,
      onFire: this.onFire,
      sleptMs: this.sleptMs,
      instructionCount: this.instructionCount,
      microCount: this.microCount,
    };
  }

  restore(s: MachineSnapshot) {
    this.mem = [...s.memory];
    this.regs = { ...s.regs };
    this.microIndex = s.microIndex;
    this.curAddr = s.curAddr;
    this.inbox = [...s.input];
    this.outbox = [...s.output];
    this.status = s.status;
    this.error = s.error;
    this.onFire = s.onFire;
    this.sleptMs = s.sleptMs;
    this.instructionCount = s.instructionCount;
    this.microCount = s.microCount;
  }

  // ---- stepping ----

  /**
   * Perform one register-transfer step. Returns null when nothing can happen:
   * the machine has halted, has errored, or INP is waiting for input.
   */
  stepMicro(): MicroStep | null {
    if (this.status === 'halted' || this.status === 'error') return null;

    const index = this.microIndex;
    const op = this.opAt(index);
    this.changes = [];
    const result = op.run();

    if (result.blocked) {
      this.status = 'waiting-input';
      return null;
    }
    this.status = 'ready';
    this.microCount++;

    let instructionEnd = false;
    if (result.error) {
      this.status = 'error';
      this.error = result.error;
      instructionEnd = true;
    } else if (result.halt) {
      this.status = 'halted';
      if (result.fire) this.onFire = true;
      instructionEnd = true;
    } else {
      this.microIndex++;
      if (index >= DECODE_INDEX && this.microIndex >= FETCH_DECODE_STEPS + this.postDecodeOps(this.cir).length) {
        this.microIndex = 0;
        instructionEnd = true;
      }
    }
    if (instructionEnd && !result.error) this.instructionCount++;

    return {
      phase: op.phase,
      rtn: op.rtn,
      detail: result.detail,
      addr: this.curAddr,
      changes: this.changes,
      read: result.read,
      write: result.write,
      input: result.input,
      output: result.output,
      warning: result.warning,
      error: result.error,
      fire: result.fire,
      bus: result.bus,
      sleep: result.sleep,
      instructionEnd,
    };
  }

  /** Step to the end of the current instruction (or through a whole one, if at a boundary). */
  stepInstruction(): MicroStep[] {
    const steps: MicroStep[] = [];
    for (;;) {
      const step = this.stepMicro();
      if (!step) break;
      steps.push(step);
      if (step.instructionEnd) break;
    }
    return steps;
  }

  /** Run instruction by instruction until the program halts, errors, blocks, hits a breakpoint or the limit. */
  run(options: RunOptions = {}): RunResult {
    const max = options.maxInstructions ?? 10_000;
    let instructions = 0;
    let first = true;
    for (;;) {
      if (this.status === 'halted') return { reason: 'halted', instructions };
      if (this.status === 'error') return { reason: 'error', instructions };
      if (instructions >= max) return { reason: 'step-limit', instructions };
      // Skip the check on the first pass so that resuming from a breakpoint moves past it.
      if (!first && this.microIndex === 0 && options.breakpoints?.has(this.pc)) {
        return { reason: 'breakpoint', instructions };
      }
      first = false;

      const before = this.instructionCount;
      this.stepInstruction();
      instructions += this.instructionCount - before;
      if (this.status === 'waiting-input') return { reason: 'waiting-input', instructions };
    }
  }

  // ---- micro-operations ----

  private checkInput(value: number) {
    const min = this.options.allowNegativeInput ? WORD_MIN : 0;
    if (!Number.isInteger(value) || value < min || value > WORD_MAX) {
      throw new RangeError(`Input must be a whole number from ${min} to ${WORD_MAX}`);
    }
  }

  private set(reg: Register, value: number) {
    this.changes.push({ reg, from: this.regs[reg], to: value });
    this.regs[reg] = value;
  }

  private opAt(index: number): Op {
    return index < FETCH_DECODE_STEPS ? this.fetchDecodeOps()[index] : this.postDecodeOps(this.cir)[index - FETCH_DECODE_STEPS];
  }

  /**
   * The four fetch steps, in the configured order. They fill the CIR for an instruction, or (extended dialect)
   * the OPR for the operand word that follows it; only the first kind records where the instruction is.
   */
  private fetchOps(target: 'CIR' | 'OPR'): Op[] {
    const marFromPc: Op = {
      phase: 'fetch',
      rtn: 'MAR ← PC',
      run: () => {
        if (target === 'CIR') this.curAddr = this.regs.PC;
        this.set('MAR', this.regs.PC);
        return { detail: `MAR ← PC = ${pad2(this.regs.PC)}` };
      },
    };
    const incrementPc: Op = {
      phase: 'fetch',
      rtn: 'PC ← PC + 1',
      run: () => {
        this.set('PC', this.regs.PC + 1);
        return { detail: `PC ← ${pad2(this.regs.PC - 1)} + 1 = ${pad2(this.regs.PC)}` };
      },
    };
    const mdrFromMemory: Op = {
      phase: 'fetch',
      rtn: 'MDR ← [MAR]',
      run: () =>
        this.readAtMar(
          `The program counter ran past the end of memory (there is no mailbox ${this.regs.MAR}). Finish the program with HLT or a branch.`,
        ),
    };
    const fromMdr: Op = {
      phase: 'fetch',
      rtn: `${target} ← MDR`,
      run: () => {
        this.set(target, this.regs.MDR);
        return { detail: `${target} ← ${this.regs.MDR}` };
      },
    };
    return this.pcIncrement === 'late'
      ? [marFromPc, mdrFromMemory, fromMdr, incrementPc]
      : [marFromPc, incrementPc, mdrFromMemory, fromMdr];
  }

  private fetchDecodeOps(): Op[] {
    const decode: Op = {
      phase: 'decode',
      rtn: 'decode CIR',
      run: () => {
        const cir = this.regs.CIR;
        const extended = this.dialect === 'extended' ? decodeExtended(cir) : undefined;
        const text = this.dialect === 'extended' ? extended?.mnemonic : disassemble(cir);
        if (text === undefined) {
          return {
            detail: `${cir} is not a valid instruction`,
            error: `Illegal instruction ${cir} at mailbox ${pad2(this.curAddr)}. The machine tried to execute data, or a value that is not an opcode.`,
          };
        }
        const opcode = Math.floor(cir / 100);
        const warning = this.dataAddresses.has(this.curAddr)
          ? `Mailbox ${pad2(this.curAddr)} was declared with DAT, so this is data being executed as an instruction.`
          : undefined;
        let detail: string;
        if (extended) {
          detail = extended.length === 2
            ? `opcode ${opcode}, mode ${Math.floor(cir / 10) % 10} (${extended.mode}) → ${text}; the operand is in the next mailbox`
            : `opcode ${opcode}, mode ${Math.floor(cir / 10) % 10} → ${text}`;
        } else {
          detail = cir === 0 ? `opcode ${opcode} → ${text}` : `opcode ${opcode}, operand ${pad2(cir % 100)} → ${text}`;
        }
        return { detail: `${detail} (decoded by the control unit)`, warning };
      },
    };
    return [...this.fetchOps('CIR'), decode];
  }

  /** MDR ← [MAR], with a memory-range check. `outOfRange` explains a bad address. */
  private readAtMar(outOfRange: string): OpResult {
    const mar = this.regs.MAR;
    if (!Number.isInteger(mar) || mar < 0 || mar >= MEMORY_SIZE) {
      return { detail: `MDR ← [${mar}]`, error: outOfRange };
    }
    this.set('MDR', this.mem[mar]);
    return { detail: `MDR ← [${pad2(mar)}] = ${this.mem[mar]}`, read: mar, bus: busRead(mar, this.mem[mar]) };
  }

  /** [MAR] ← MDR, with a memory-range check. */
  private writeAtMar(outOfRange: string): OpResult {
    const mar = this.regs.MAR;
    if (!Number.isInteger(mar) || mar < 0 || mar >= MEMORY_SIZE) {
      return { detail: `[${mar}] ← ${this.regs.MDR}`, error: outOfRange };
    }
    this.mem[mar] = this.regs.MDR;
    return { detail: `[${pad2(mar)}] ← ${this.regs.MDR}`, write: mar, bus: busWrite(mar, this.regs.MDR) };
  }

  /** ACC ← ACC ± operand, with the overflow policy. */
  private accArithmetic(sign: 1 | -1, operand: number): OpResult {
    const before = this.regs.ACC;
    const after = before + sign * operand;
    this.set('ACC', after);
    const detail = `ACC ← ${before} ${sign === 1 ? '+' : '−'} ${operand} = ${after} (calculated by the ALU)`;
    if (after < WORD_MIN || after > WORD_MAX) {
      const message = `The accumulator is ${after}, outside the range ${WORD_MIN} to ${WORD_MAX} that a mailbox can hold.`;
      return this.options.overflow === 'error' ? { detail, error: message } : { detail, warning: message };
    }
    return { detail };
  }

  /** Everything after decode: (extended dialect) the operand fetch, then the execute steps. */
  private postDecodeOps(cir: number): Op[] {
    if (this.dialect === 'standard') return this.executeOps(cir);
    const decoded = decodeExtended(cir)!;
    return [...(decoded.length === 2 ? this.fetchOps('OPR') : []), ...this.executeOpsExtended(cir, decoded)];
  }

  /** The execute steps of an extended instruction, whose operand word is already in the OPR. */
  private executeOpsExtended(cir: number, d: DecodedExtended): Op[] {
    const step = (rtn: string, run: () => OpResult): Op => ({ phase: 'execute', rtn, run });
    const mode = d.mode;

    // SLEEP: the operand word (already in the OPR) is the number of milliseconds to wait.
    if (d.mnemonic === 'SLEEP') {
      return [step('wait OPR ms', () => {
        const ms = this.regs.OPR;
        this.sleptMs += ms;
        return { detail: `wait ${ms} ms`, sleep: ms };
      })];
    }

    // No-operand instructions: the standard ones behave the same, plus INX and TXA.
    switch (d.mnemonic) {
      case 'INX':
        return [step('X ← X + 1', () => {
          const before = this.regs.X;
          this.set('X', before + 1);
          return { detail: `X ← ${before} + 1 = ${before + 1}` };
        })];
      case 'TXA':
        return [step('ACC ← X', () => {
          this.set('ACC', this.regs.X);
          return { detail: `ACC ← ${this.regs.X}` };
        })];
      case 'INP':
      case 'OUT':
      case 'HLT':
      case 'HCF':
        return this.executeOps(cir);
    }

    // Branches take the address from the OPR.
    if (d.mnemonic === 'BRA') {
      return [step('PC ← OPR', () => {
        this.set('PC', this.regs.OPR);
        return { detail: `PC ← ${pad2(this.regs.OPR)}` };
      })];
    }
    if (d.mnemonic === 'BRZ' || d.mnemonic === 'BRP') {
      const zero = d.mnemonic === 'BRZ';
      return [step(zero ? 'if ACC = 0 then PC ← OPR' : 'if ACC ≥ 0 then PC ← OPR', () => {
        const acc = this.regs.ACC;
        const taken = zero ? acc === 0 : acc >= 0;
        const why = zero ? (taken ? 'ACC = 0' : `ACC = ${acc}, not zero`) : `ACC = ${acc}, ${taken ? 'not negative' : 'negative'}`;
        if (taken) {
          this.set('PC', this.regs.OPR);
          return { detail: `${why}, so PC ← ${pad2(this.regs.OPR)}` };
        }
        return { detail: `${why}, so PC is unchanged` };
      })];
    }

    // The rest work out an effective address (or use the operand itself), then read or write there.
    const toMarFromOpr = step('MAR ← OPR', () => {
      this.set('MAR', this.regs.OPR);
      return { detail: `MAR ← OPR = ${pad2(this.regs.OPR)}` };
    });
    const toMarIndexed = step('MAR ← OPR + X', () => {
      const sum = this.regs.OPR + this.regs.X;
      this.set('MAR', sum);
      return { detail: `MAR ← ${this.regs.OPR} + ${this.regs.X} = ${sum}` };
    });
    const readData = (why: string) => step('MDR ← [MAR]', () => this.readAtMar(`There is no mailbox ${this.regs.MAR}. ${why}`));
    const pointerToMar = step('MAR ← MDR', () => {
      this.set('MAR', this.regs.MDR);
      return { detail: `MAR ← ${this.regs.MDR} (the pointer)` };
    });
    const indexedWhy = () => `The indexed address is ${this.regs.OPR} + X, and X is ${this.regs.X}.`;

    if (d.mnemonic === 'STA') {
      const write = step('[MAR] ← MDR', () => this.writeAtMar(`There is no mailbox ${this.regs.MAR} to store into. ${mode === 'indexed' ? indexedWhy() : 'The pointer held that number.'}`));
      const accToMdr = step('MDR ← ACC', () => {
        this.set('MDR', this.regs.ACC);
        return { detail: `MDR ← ${this.regs.ACC}` };
      });
      if (mode === 'direct') return [toMarFromOpr, accToMdr, write];
      if (mode === 'indexed') return [toMarIndexed, accToMdr, write];
      return [toMarFromOpr, readData('The pointer address is not a mailbox.'), pointerToMar, accToMdr, write]; // indirect
    }

    // ADD, SUB, LDA, LDX: the value comes from the OPR (immediate) or from memory through the MDR.
    const source: 'OPR' | 'MDR' = mode === 'immediate' ? 'OPR' : 'MDR';
    let last: Op;
    switch (d.mnemonic) {
      case 'LDA':
        last = step(`ACC ← ${source}`, () => {
          this.set('ACC', this.regs[source]);
          return { detail: `ACC ← ${this.regs[source]}` };
        });
        break;
      case 'LDX':
        last = step(`X ← ${source}`, () => {
          this.set('X', this.regs[source]);
          return { detail: `X ← ${this.regs[source]}` };
        });
        break;
      case 'ADD':
        last = step(`ACC ← ACC + ${source}`, () => this.accArithmetic(1, this.regs[source]));
        break;
      default: // SUB
        last = step(`ACC ← ACC − ${source}`, () => this.accArithmetic(-1, this.regs[source]));
    }
    switch (mode) {
      case 'immediate':
        return [last];
      case 'direct':
        return [toMarFromOpr, readData('The operand is not a mailbox address.'), last];
      case 'indexed':
        return [toMarIndexed, readData(indexedWhy()), last];
      default: // indirect
        return [toMarFromOpr, readData('The pointer address is not a mailbox.'), pointerToMar, readData('The pointer held that number.'), last];
    }
  }

  /** The execute-phase steps for an instruction word. Only called for valid instructions. */
  private executeOps(cir: number): Op[] {
    const opcode = Math.floor(cir / 100);
    const xx = cir % 100;
    const at = pad2(xx);

    const loadMar: Op = {
      phase: 'execute',
      rtn: `MAR ← ${at}`,
      run: () => {
        this.set('MAR', xx);
        return { detail: `MAR ← ${at} (the address part of the CIR)` };
      },
    };
    const readMdr: Op = {
      phase: 'execute',
      rtn: 'MDR ← [MAR]',
      run: () => {
        this.set('MDR', this.mem[xx]);
        return { detail: `MDR ← [${at}] = ${this.mem[xx]}`, read: xx, bus: busRead(xx, this.mem[xx]) };
      },
    };
    const arithmetic = (sign: 1 | -1): Op => ({
      phase: 'execute',
      rtn: sign === 1 ? 'ACC ← ACC + MDR' : 'ACC ← ACC − MDR',
      run: () => this.accArithmetic(sign, this.regs.MDR),
    });
    const branch = (rtn: string, taken: () => boolean, why: () => string): Op => ({
      phase: 'execute',
      rtn,
      run: () => {
        if (taken()) {
          this.set('PC', xx);
          return { detail: `${why()}, so PC ← ${at}` };
        }
        return { detail: `${why()}, so PC is unchanged` };
      },
    });

    switch (opcode) {
      case 5:
        return [loadMar, readMdr, {
          phase: 'execute',
          rtn: 'ACC ← MDR',
          run: () => {
            this.set('ACC', this.regs.MDR);
            return { detail: `ACC ← ${this.regs.MDR}` };
          },
        }];
      case 1:
        return [loadMar, readMdr, arithmetic(1)];
      case 2:
        return [loadMar, readMdr, arithmetic(-1)];
      case 3:
        return [
          loadMar,
          {
            phase: 'execute',
            rtn: 'MDR ← ACC',
            run: () => {
              this.set('MDR', this.regs.ACC);
              return { detail: `MDR ← ${this.regs.ACC}` };
            },
          },
          {
            phase: 'execute',
            rtn: '[MAR] ← MDR',
            run: () => {
              this.mem[xx] = this.regs.MDR;
              return { detail: `[${at}] ← ${this.regs.MDR}`, write: xx, bus: busWrite(xx, this.regs.MDR) };
            },
          },
        ];
      case 6:
        return [{
          phase: 'execute',
          rtn: `PC ← ${at}`,
          run: () => {
            this.set('PC', xx);
            return { detail: `PC ← ${at}` };
          },
        }];
      case 7:
        return [branch(`if ACC = 0 then PC ← ${at}`, () => this.regs.ACC === 0, () => (this.regs.ACC === 0 ? 'ACC = 0' : `ACC = ${this.regs.ACC}, not zero`))];
      case 8:
        return [branch(`if ACC ≥ 0 then PC ← ${at}`, () => this.regs.ACC >= 0, () => (this.regs.ACC >= 0 ? `ACC = ${this.regs.ACC}, not negative` : `ACC = ${this.regs.ACC}, negative`))];
      case 9:
        if (cir === 901) {
          return [{
            phase: 'execute',
            rtn: 'ACC ← input',
            run: () => {
              if (this.inbox.length === 0) return { detail: 'Waiting for input', blocked: true };
              const value = this.inbox.shift()!;
              this.set('ACC', value);
              return { detail: `ACC ← ${value} (from the inbox)`, input: value };
            },
          }];
        }
        if (cir === 999) {
          return [{ phase: 'execute', rtn: 'halt and catch fire', run: () => ({ detail: 'The CPU has stopped, and it is on fire', halt: true, fire: true }) }];
        }
        return [{
          phase: 'execute',
          rtn: 'output ← ACC',
          run: () => {
            this.outbox.push(this.regs.ACC);
            return { detail: `output ← ${this.regs.ACC}`, output: this.regs.ACC };
          },
        }];
      default:
        // Only 000 reaches here (HLT).
        return [{ phase: 'execute', rtn: 'stop', run: () => ({ detail: 'The program has finished', halt: true }) }];
    }
  }
}
