import './style.css';
import {
  MEMORY_SIZE,
  Machine,
  PERIPHERALS,
  PERIPHERAL_SYMBOLS,
  assemble,
  decodeExtended,
  disassemble,
  disassembleExtended,
  type AsmError,
  type AssembledLine,
  type AssembledProgram,
  type MachineSnapshot,
  type BusActivity,
  type MicroStep,
  type Register,
} from './engine';
import { parseDialect, parsePcIncrement } from './config';
import { activityOf, buildDiagram, type Diagram } from './diagram';
import { BLANK_SOURCE, examplesFor, type Example } from './examples';
import { explainWord, type WordExplanation } from './explain';
import { pad2, word } from './format';
import { extinguishFire, igniteFire } from './fire';
import type { PeripheralsPanel } from './peripherals';
import { initReference, openReference, toggleReference } from './reference';

// ---------- constants ----------

const MAX_INSTRUCTIONS = 10_000;
const MAX_FRAMES = 2_000;
const TRACE_ROWS_SHOWN = 200;
/** Milliseconds between steps. `realtime` (extended mode only) is as fast as the browser's timers allow. */
const DELAYS = { slow: 700, medium: 350, fast: 40, realtime: 1 } as const;
/**
 * Set with ?lmc=extended. The standard LMC (direct addressing only) is what OCR specifies and is the default;
 * the extended one adds addressing modes, an index register X and an operand register OPR. See config.ts.
 */
const DIALECT = parseDialect(window.location.search);
const EXTENDED = DIALECT === 'extended';
/** Filled in by start(); the extended list is fetched only in extended mode. */
let examples: Example[] = [];

/** Extended mode appends OPR and X in start(). */
const REGISTERS: { reg: Register; full: string }[] = [
  { reg: 'PC', full: 'Program Counter' },
  { reg: 'ACC', full: 'Accumulator' },
  { reg: 'MAR', full: 'Memory Address' },
  { reg: 'MDR', full: 'Memory Data' },
  { reg: 'CIR', full: 'Current Instruction' },
];
// A saved program from one dialect should not turn up in the other.
const KEY_SOURCE = EXTENDED ? 'lmc.source.extended' : 'lmc.source';
const KEY_INBOX = EXTENDED ? 'lmc.inbox.extended' : 'lmc.inbox';
const KEY_SCALE = 'lmc.scale';
const KEY_SPEED = 'lmc.speed';
const KEY_DIAGRAM = 'lmc.diagram';

/** Where PC ← PC + 1 sits in the fetch. Default is OCR's order (?pc=after); ?pc=before moves it up; see config.ts. */
const PC_INCREMENT = parsePcIncrement(window.location.search);

// ---------- dom ----------

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const sourceEl = $<HTMLTextAreaElement>('source');
const gutterEl = $('gutter');
const lineHl = $('line-hl');
const errorsEl = $('errors');
const dirtyNote = $('dirty-note');
const statusEl = $('status');
const regsEl = $('regs');
const memoryEl = $('memory');
const phasesEl = $('phases');
const cycleStepsEl = $('cycle-steps');
const instrHelpBtn = $<HTMLButtonElement>('btn-instr-help');
const inboxInput = $<HTMLInputElement>('inbox-input');
const inboxMsg = $('inbox-msg');
const inboxQueue = $('inbox-queue');
const outboxEl = $('outbox');
const inputPrompt = $<HTMLFormElement>('input-prompt');
const liveInput = $<HTMLInputElement>('live-input');
const traceBody = $('trace').querySelector('tbody')!;
const traceNote = $('trace-note');
const traceScroll = $('trace').parentElement!;
const btn = {
  assemble: $<HTMLButtonElement>('btn-assemble'),
  back: $<HTMLButtonElement>('btn-back'),
  step: $<HTMLButtonElement>('btn-step'),
  instr: $<HTMLButtonElement>('btn-instr'),
  run: $<HTMLButtonElement>('btn-run'),
  reset: $<HTMLButtonElement>('btn-reset'),
};
const speedSel = $<HTMLSelectElement>('sel-speed');
const exampleSel = $<HTMLSelectElement>('sel-example');

// ---------- state ----------

interface TraceRow {
  n: number;
  pc: number;
  cir: number;
  instr: string;
  note?: string;
  acc: number;
  change: string;
  output?: number;
}

interface Frame {
  snap: MachineSnapshot;
  cycleSteps: MicroStep[];
  recent: MicroStep[];
  traceLen: number;
}

/** Extended LMC: the switches and lamps. Off until the checkbox in the Peripherals panel is ticked. */
let peripheralsOn = false;
let peripheralsPanel: PeripheralsPanel | null = null;
let peripheralInfoFor: ((addr: number) => { title: string; note: string } | undefined) | null = null;

let program: AssembledProgram | null = null;
/** The source line that occupies each mailbox, and (extended) the line whose operand word is in each mailbox. */
let lineByAddr = new Map<number, AssembledLine>();
let operandOwner = new Map<number, AssembledLine>();
let machine: Machine | null = null;
let dirty = true;
let assemblyId = 0; // bumped on every successful assembly
let errors: AsmError[] = [];
const breakpointLines = new Set<number>();

let history: Frame[] = [];
let trace: TraceRow[] = [];
let cycleSteps: MicroStep[] = []; // steps of the current (or just-finished) instruction
let recent: MicroStep[] = []; // steps made by the last button press

let running = false;
let runTimer: number | undefined;
let resumeOnInput = false;
let skipBreakpoint = false;
let statusNote = '';
let prevStatus = '';
let diagram: Diagram | undefined;
/** While a SLEEP instruction is being waited out, how long it asked for. */
let sleepingMs = 0;

// ---------- storage ----------

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

// ---------- helpers ----------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function parseInputs(text: string): { ok: true; values: number[] } | { ok: false; error: string } {
  const values: number[] = [];
  for (const token of text.split(/[\s,]+/).filter(Boolean)) {
    if (!/^\d+$/.test(token) || Number(token) > 999) {
      return { ok: false, error: `“${token}” is not a whole number from 0 to 999.` };
    }
    values.push(Number(token));
  }
  return { ok: true, values };
}

function labelAt(addr: number): string | undefined {
  const own = program ? Object.keys(program.symbols).find((name) => program!.symbols[name] === addr) : undefined;
  if (own || !peripheralsOn) return own;
  return Object.keys(PERIPHERAL_SYMBOLS).find((name) => PERIPHERAL_SYMBOLS[name] === addr);
}

/** Which peripheral, if any, a mailbox is (only while the peripherals are on). */
function peripheralAt(addr: number): { kind: 'switch' | 'lamp'; n: number } | undefined {
  if (!peripheralsOn) return undefined;
  const s = (PERIPHERALS.switches as readonly number[]).indexOf(addr);
  if (s >= 0) return { kind: 'switch', n: s + 1 };
  const l = (PERIPHERALS.lamps as readonly number[]).indexOf(addr);
  return l >= 0 ? { kind: 'lamp', n: l + 1 } : undefined;
}

/** Assembly text for a machine word in the current dialect. `operand` is the word after it (extended). */
function disassembleAny(w: number, operand?: number): string | undefined {
  return EXTENDED ? disassembleExtended(w, operand, labelAt) : disassemble(w, labelAt);
}

/** The mnemonic of a machine word in the current dialect. */
function mnemonicOf(w: number): string | undefined {
  return EXTENDED ? decodeExtended(w)?.mnemonic : disassemble(w)?.split(' ')[0];
}

function bpAddrs(): Set<number> {
  const set = new Set<number>();
  if (program) for (const l of program.lines) if (breakpointLines.has(l.line)) set.add(l.addr);
  return set;
}

// ---------- assemble / reset ----------

function assembleNow(): boolean {
  const src = sourceEl.value;
  const inputs = parseInputs(inboxInput.value);
  if (!inputs.ok) {
    showInboxMessage(inputs.error, true);
    return false;
  }
  stopRun();
  const result = assemble(src, { dialect: DIALECT, peripherals: peripheralsOn });
  if (!result.ok) {
    errors = result.errors;
    program = null;
    machine = null;
    clearRunState();
    render();
    return false;
  }
  errors = [];
  program = result.program;
  lineByAddr = new Map(program.lines.map((l) => [l.addr, l]));
  operandOwner = new Map(program.lines.filter((l) => l.words.length === 2).map((l) => [l.addr + 1, l]));
  assemblyId++;
  dirty = false;
  machine = new Machine(program.memory, { dataAddresses: program.dataAddresses, pcIncrement: PC_INCREMENT, dialect: DIALECT }, inputs.values);
  // Breakpoints only make sense on lines that hold code.
  for (const line of [...breakpointLines]) if (!program.lines.some((l) => l.line === line)) breakpointLines.delete(line);
  clearRunState();
  showInboxMessage('');
  render();
  return true;
}

function clearRunState() {
  history = [];
  trace = [];
  cycleSteps = [];
  recent = [];
  statusNote = '';
  resumeOnInput = false;
}

function ensureMachine(): boolean {
  if (machine && !dirty) return true;
  return assembleNow();
}

function resetMachine() {
  stopRun();
  if (!machine || dirty) {
    assembleNow();
    return;
  }
  const inputs = parseInputs(inboxInput.value);
  if (!inputs.ok) {
    showInboxMessage(inputs.error, true);
    return;
  }
  machine.reset(inputs.values);
  clearRunState();
  showInboxMessage('');
  render();
}

// ---------- stepping ----------

function pushFrame() {
  history.push({ snap: machine!.snapshot(), cycleSteps: [...cycleSteps], recent: [...recent], traceLen: trace.length });
  if (history.length > MAX_FRAMES) history.shift();
}

function recordTrace() {
  const m = machine!;
  const first = cycleSteps[0];
  const last = cycleSteps[cycleSteps.length - 1];
  const cir = m.cir;
  const line = lineByAddr.get(first.addr);

  const instr =
    line && line.mnemonic !== 'DAT' && line.word === cir
      ? [line.mnemonic, line.operand].filter(Boolean).join(' ')
      : (disassembleAny(cir, m.opr) ?? String(cir));

  const written = cycleSteps.find((s) => s.write !== undefined);
  const out = cycleSteps.find((s) => s.output !== undefined);
  const opcode = Math.floor(cir / 100);
  trace.push({
    n: trace.length + 1,
    pc: first.addr,
    cir,
    instr,
    note: last.error ?? (last.fire ? 'the CPU caught fire' : opcode >= 6 && opcode <= 8 ? last.detail : undefined),
    acc: m.acc,
    change: written ? `[${pad2(written.write!)}] = ${m.memory[written.write!]}` : '',
    output: out?.output,
  });
}

/** Perform one register-transfer step. Returns false if the machine could not move. */
function doMicro(record: boolean): boolean {
  const m = machine!;
  if (record) pushFrame();
  const boundary = m.atInstructionBoundary;
  const step = m.stepMicro();
  if (!step) {
    if (record) history.pop();
    return false;
  }
  if (boundary) cycleSteps = [];
  cycleSteps.push(step);
  recent = [step];
  if (step.instructionEnd) recordTrace();
  if (step.fire) igniteFire();
  return true;
}

/** Perform steps up to the end of the current instruction. Returns false if the machine could not move. */
function doInstruction(record: boolean): boolean {
  const m = machine!;
  if (record) pushFrame();
  const boundary = m.atInstructionBoundary;
  const steps = m.stepInstruction();
  if (steps.length === 0) {
    if (record) history.pop();
    return false;
  }
  if (boundary) cycleSteps = [];
  cycleSteps.push(...steps);
  recent = steps;
  if (steps[steps.length - 1].instructionEnd) recordTrace();
  if (steps.some((s) => s.fire)) igniteFire();
  return true;
}

function userStep(kind: 'micro' | 'instruction') {
  stopRun();
  if (!ensureMachine()) return;
  statusNote = '';
  if (kind === 'micro') doMicro(true);
  else doInstruction(true);
  render();
}

function stepBack() {
  stopRun();
  const frame = history.pop();
  if (!frame || !machine) return;
  machine.restore(frame.snap);
  cycleSteps = frame.cycleSteps;
  recent = frame.recent;
  trace.length = frame.traceLen;
  statusNote = '';
  render();
}

// ---------- running ----------

function stopRun(note = '') {
  window.clearTimeout(runTimer);
  sleepingMs = 0;
  if (running) statusNote = note;
  running = false;
}

function startRun() {
  if (!ensureMachine()) return;
  const m = machine!;
  if (m.status === 'halted' || m.status === 'error') return;
  running = true;
  resumeOnInput = false;
  statusNote = '';
  skipBreakpoint = true;
  const speed = speedSel.value as keyof typeof DELAYS | 'instant';

  if (speed === 'instant') {
    runInstant();
    return;
  }

  let executed = 0;
  const tick = () => {
    if (!running) return;
    sleepingMs = 0;
    if (!skipBreakpoint && m.atInstructionBoundary && bpAddrs().has(m.pc)) {
      stopRun('Paused at a breakpoint.');
      render();
      return;
    }
    skipBreakpoint = false;
    const moved = speed === 'slow' ? doMicro(true) : doInstruction(true);
    if (m.atInstructionBoundary) executed++;
    if (m.status === 'waiting-input') resumeOnInput = true;
    if (!moved || m.status !== 'ready') {
      stopRun();
      render();
      return;
    }
    if (executed >= MAX_INSTRUCTIONS) {
      stopRun(`Stopped after ${MAX_INSTRUCTIONS.toLocaleString()} instructions. Is there an infinite loop?`);
      render();
      return;
    }
    // A SLEEP instruction asks the page to wait. The machine does not: it only reports how long. Instant runs skip it.
    const nap = recent.reduce((total, s) => total + (s.sleep ?? 0), 0);
    sleepingMs = nap;
    render();
    runTimer = window.setTimeout(tick, DELAYS[speed] + nap);
  };
  render();
  tick();
}

function runInstant() {
  const m = machine!;
  history = []; // too many steps to rewind through
  const bps = bpAddrs();
  let executed = 0;
  let note = '';
  while (m.status === 'ready') {
    if (!skipBreakpoint && m.atInstructionBoundary && bps.has(m.pc)) {
      note = 'Paused at a breakpoint.';
      break;
    }
    skipBreakpoint = false;
    if (!doInstruction(false)) break;
    if (++executed >= MAX_INSTRUCTIONS) {
      note = `Stopped after ${MAX_INSTRUCTIONS.toLocaleString()} instructions. Is there an infinite loop?`;
      break;
    }
  }
  if (m.status === 'waiting-input') resumeOnInput = true;
  if (m.sleptMs > 0) note = `${note ? `${note} ` : ''}Instant runs skip every SLEEP: choose Real time to wait for them.`;
  stopRun(note);
  render();
}

// ---------- editor ----------

function lineHeightPx() {
  return parseFloat(getComputedStyle(sourceEl).lineHeight);
}

let gutterKey = '';

function renderGutter() {
  const count = sourceEl.value.split('\n').length;
  const key = [count, dirty, assemblyId, errors.map((e) => e.line).join(','), [...breakpointLines].sort().join(',')].join('|');
  if (key === gutterKey) return;
  gutterKey = key;
  const byLine = new Map(program && !dirty ? program.lines.map((l) => [l.line, l]) : []);
  const errorLines = new Set(errors.map((e) => e.line));
  const frag = document.createDocumentFragment();
  for (let n = 1; n <= count; n++) {
    const b = el('button', 'ln' + (errorLines.has(n) ? ' err' : ''));
    b.type = 'button';
    b.tabIndex = -1; // keyboard users toggle breakpoints with F9 in the editor
    b.dataset.line = String(n);
    const has = breakpointLines.has(n);
    b.setAttribute('aria-label', `Line ${n}${has ? ', breakpoint set' : ''}. Toggle breakpoint`);
    b.append(el('span', 'dot', has ? '●' : ''), el('span', 'num', String(n)));
    const l = byLine.get(n);
    const mc = el('span', 'mc', l ? `${pad2(l.addr)} ${l.words.map(word).join(' ')}` : '');
    if (l) {
      mc.dataset.tipAddr = String(l.addr);
      mc.dataset.tipWord = String(l.word);
      if (l.words.length === 2) mc.dataset.tipOperand = String(l.words[1]);
    }
    b.append(mc);
    frag.append(b);
  }
  // The text area has a horizontal scrollbar the margin does not, so it can scroll a little further. This spacer lets
  // the margin follow it all the way to the bottom.
  frag.append(el('div', 'ln-spacer'));
  gutterEl.replaceChildren(frag);
  gutterEl.scrollTop = sourceEl.scrollTop;
}

function currentLine(): { line: number; running: boolean } | null {
  if (!machine || !program || dirty) return null;
  const boundary = machine.atInstructionBoundary;
  const lastAddr = cycleSteps.length ? cycleSteps[cycleSteps.length - 1].addr : undefined;
  const addr = boundary && machine.status === 'ready' ? machine.pc : lastAddr;
  if (addr === undefined) return null;
  const l = lineByAddr.get(addr);
  return l ? { line: l.line, running: !boundary } : null;
}

/**
 * True while the editor follows the line being executed. Scrolling by hand pauses it (so the editor never
 * fights the reader); pressing any toolbar button, or running, resumes it.
 */
let followExecution = true;

/**
 * Position the highlight over the current line. Pass `reveal` only when the machine has just moved: it scrolls the
 * line into view, but only while following. Scroll and resize events must not pass it, or the editor would snap back.
 */
function renderLineHighlight(reveal = false) {
  const cur = currentLine();
  lineHl.hidden = !cur;
  if (!cur) return;
  const lh = lineHeightPx();
  const pad = parseFloat(getComputedStyle(sourceEl).paddingTop);
  const top = pad + (cur.line - 1) * lh;
  if (reveal && followExecution && (top < sourceEl.scrollTop || top + lh > sourceEl.scrollTop + sourceEl.clientHeight)) {
    sourceEl.scrollTop = Math.max(0, top - sourceEl.clientHeight / 2);
    gutterEl.scrollTop = sourceEl.scrollTop;
  }
  lineHl.style.top = `${top - sourceEl.scrollTop}px`;
  lineHl.classList.toggle('running', cur.running);
}

function renderErrors() {
  errorsEl.hidden = errors.length === 0;
  errorsEl.replaceChildren(
    ...errors.map((e) => {
      const li = el('li');
      const b = el('button', undefined, `Line ${e.line}: ${e.message}`);
      b.type = 'button';
      b.addEventListener('click', () => jumpToLine(e.line));
      li.append(b);
      return li;
    }),
  );
}

function jumpToLine(line: number) {
  const lines = sourceEl.value.split('\n');
  const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
  sourceEl.focus();
  sourceEl.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
  sourceEl.scrollTop = Math.max(0, (line - 3) * lineHeightPx());
}

// ---------- rendering ----------

function buildStaticDom() {
  regsEl.classList.toggle('extended', EXTENDED);
  diagram = buildDiagram($('units'), $('buses'), $('mem-wrap'));
  regsEl.replaceChildren(
    ...REGISTERS.map(({ reg, full }) => {
      const box = el('div', 'reg');
      box.dataset.reg = reg;
      box.append(el('div', 'name', reg), el('span', 'full', full), el('div', 'val', '000'));
      return box;
    }),
  );

  const cells: HTMLElement[] = [];
  for (let i = 0; i < MEMORY_SIZE; i++) {
    const cell = el('div', 'cell');
    cell.dataset.addr = String(i);
    cell.dataset.tipAddr = String(i);
    cell.append(el('div', 'a'), el('div', 'v'), el('div', 'd'), el('span', 'tag'));
    cells.push(cell);
  }
  memoryEl.replaceChildren(...cells);
}

/** Show or hide the CPU diagram (the ALU, control unit, buses and memory blocks). The registers always stay. */
function setDiagramShown(show: boolean) {
  $('cpu-card').classList.toggle('diagram-off', !show);
  const btn = $('btn-diagram');
  btn.textContent = show ? 'Hide diagram' : 'Show diagram';
  btn.setAttribute('aria-pressed', String(show));
}

function renderRegisters() {
  regsEl.classList.toggle('burnt', !!machine?.onFire);
  const changed = new Set<Register>();
  recent.forEach((s) => s.changes.forEach((c) => changed.add(c.reg)));
  const activity = activityOf(recent);
  diagram?.update(activity);
  regsEl.querySelectorAll<HTMLElement>('.reg').forEach((box) => {
    const reg = box.dataset.reg as Register;
    const value = machine ? { PC: machine.pc, ACC: machine.acc, MAR: machine.mar, MDR: machine.mdr, CIR: machine.cir, X: machine.x, OPR: machine.opr }[reg] : 0;
    box.querySelector('.val')!.textContent = reg === 'PC' || reg === 'MAR' ? pad2(value) : word(value);
    box.classList.toggle('changed', changed.has(reg));
    box.classList.toggle('source', activity.sources.has(reg));
  });
}

function renderMemory() {
  const reads = new Set<number>();
  const writes = new Set<number>();
  recent.forEach((s) => {
    if (s.read !== undefined) reads.add(s.read);
    if (s.write !== undefined) writes.add(s.write);
  });
  const mem = machine?.memory ?? program?.memory ?? new Array<number>(MEMORY_SIZE).fill(0);
  const data = new Set(program?.dataAddresses ?? []);
  const used = program?.size ?? 0;
  const midAddr = machine && !machine.atInstructionBoundary && cycleSteps.length ? cycleSteps[cycleSteps.length - 1].addr : -1;
  const next = machine && machine.status === 'ready' && machine.atInstructionBoundary ? machine.pc : -1;
  const burnt = machine?.onFire && cycleSteps.length ? cycleSteps[0].addr : -1;

  memoryEl.querySelectorAll<HTMLElement>('.cell').forEach((cell, i) => {
    if (cell.classList.contains('editing')) return; // leave the input alone while someone is typing
    const value = mem[i];
    const isData = data.has(i);
    const isOperand = EXTENDED && operandOwner.has(i);
    const io = peripheralAt(i);
    const text = io ? `${io.kind} ${io.n}` : isData ? 'DAT' : isOperand ? 'operand' : i >= used && value === 0 ? '' : (disassembleAny(value, mem[i + 1]) ?? '');
    const label = labelAt(i);
    const tag = writes.has(i) ? 'write' : reads.has(i) ? 'read' : i === next ? 'next' : io ? 'I/O' : '';

    cell.querySelector('.a')!.replaceChildren(el('span', undefined, pad2(i)), el('span', 'lbl', label ?? ''));
    cell.querySelector('.v')!.textContent = word(value);
    cell.querySelector('.d')!.textContent = text;
    cell.querySelector('.tag')!.textContent = tag;
    cell.setAttribute('role', 'group');
    cell.setAttribute('aria-label', `Mailbox ${pad2(i)}${label ? ` (${label})` : ''}: ${word(value)}${text ? ` = ${text}` : ''}`);
    cell.classList.toggle('unused', i >= used && value === 0 && !io);
    cell.classList.toggle('io', !!io);
    cell.classList.toggle('io-switch', io?.kind === 'switch');
    cell.classList.toggle('io-lamp', io?.kind === 'lamp');
    cell.classList.toggle('lit', io?.kind === 'lamp' && value !== 0);
    if (io) cell.dataset.io = String(io.n);
    else delete cell.dataset.io;
    cell.classList.toggle('data', isData);
    cell.classList.toggle('operand', isOperand);
    cell.classList.toggle('next', i === next);
    cell.classList.toggle('exec', i === midAddr);
    cell.classList.toggle('burnt', i === burnt);
    cell.classList.toggle('read', reads.has(i));
    cell.classList.toggle('write', writes.has(i));
  });
}

const PHASE_BADGE = { fetch: 'F', decode: 'D', execute: 'E' } as const;

function busLine(bus: BusActivity): HTMLElement {
  const line = el('span', 'bus');
  const item = (cls: string, name: string, text: string) => {
    const node = el('span', `bus-item ${cls}`);
    node.append(el('b', undefined, `${name}: `), text);
    return node;
  };
  line.append(item('addr', 'Address bus', bus.address), item('data', 'Data bus', bus.data), item('ctrl', 'Control bus', bus.control));
  return line;
}

function renderCycle() {
  const m = machine;
  const latest = cycleSteps[cycleSteps.length - 1];

  phasesEl.querySelectorAll<HTMLElement>('li').forEach((li) => {
    const phase = li.dataset.phase!;
    const active = !!latest && m?.status === 'ready' && !m.atInstructionBoundary && latest.phase === phase;
    const justFinished = !!latest && (m?.atInstructionBoundary || m?.status !== 'ready') && latest.phase === phase;
    li.classList.toggle('active', active || justFinished);
    li.classList.toggle('next', !!m && m.status === 'ready' && m.nextPhase === phase);
  });

  const nodes: HTMLElement[] = [];
  if (!m) {
    nodes.push(el('p', 'empty', errors.length ? 'Fix the errors in the program to continue.' : 'Press Step ▸ to assemble the program and begin.'));
  } else if (cycleSteps.length === 0) {
    nodes.push(el('p', 'empty', `Press Step ▸ to begin the first fetch. Each press performs one register transfer.`));
  } else {
    const addr = cycleSteps[0].addr;
    const line = lineByAddr.get(addr);
    const shown = line ? [line.mnemonic, line.operand].filter(Boolean).join(' ') : '';
    nodes.push(el('p', 'cycle-title', `Instruction at mailbox ${pad2(addr)}${shown ? `: ${shown}` : ''}`));
    cycleSteps.forEach((s, i) => {
      const row = el('div', `step ${s.phase}${i === cycleSteps.length - 1 ? ' latest' : ''}`);
      row.append(el('span', 'badge', PHASE_BADGE[s.phase]));
      const body = el('div');
      body.append(el('span', 'rtn', s.rtn), el('span', 'detail', s.detail));
      if (s.bus) body.append(busLine(s.bus));
      row.append(body);
      nodes.push(row);
    });
    for (const s of cycleSteps) if (s.warning) nodes.push(el('div', 'callout', `Warning: ${s.warning}`));
    if (m.status === 'error') nodes.push(el('div', 'callout error', m.error));
    if (m.status === 'halted') {
      nodes.push(m.onFire ? el('div', 'callout error', 'HCF: the CPU has stopped, and it is on fire.') : el('div', 'callout done', 'HLT: the program has finished.'));
    }
  }
  if (m?.status === 'waiting-input') nodes.push(el('div', 'callout', 'INP needs a number, and the inbox is empty.'));
  cycleStepsEl.replaceChildren(...nodes);

  // Instruction help button.
  let mnemonic: string | undefined;
  if (m) {
    const decoded = cycleSteps.some((s) => s.phase === 'decode') && !m.atInstructionBoundary;
    const w = decoded || m.status !== 'ready' ? m.cir : m.atInstructionBoundary ? m.memory[m.pc] : undefined;
    mnemonic = w === undefined ? undefined : mnemonicOf(w);
    if (mnemonic === 'HCF') mnemonic = undefined; // undocumented: not in the reference drawer
  }
  instrHelpBtn.hidden = !mnemonic;
  if (mnemonic) {
    instrHelpBtn.textContent = `What does ${mnemonic} do?`;
    instrHelpBtn.dataset.mn = mnemonic;
  }
  cycleStepsEl.scrollTop = cycleStepsEl.scrollHeight;
}

function renderIO() {
  const chips = (values: readonly number[], highlight: 'first' | 'last') => {
    if (values.length === 0) return [el('span', 'empty', highlight === 'first' ? 'empty' : 'nothing yet')];
    return values.map((v, i) => el('span', `chip${(highlight === 'first' ? i === 0 : i === values.length - 1) ? ' ' + highlight : ''}`, String(v)));
  };
  const inbox = machine ? machine.input : (() => {
    const parsed = parseInputs(inboxInput.value);
    return parsed.ok ? parsed.values : [];
  })();
  inboxQueue.replaceChildren(...chips(inbox, 'first'));
  outboxEl.replaceChildren(...chips(machine?.output ?? [], 'last'));

  const waiting = machine?.status === 'waiting-input';
  inputPrompt.hidden = !waiting;
  if (waiting && prevStatus !== 'waiting-input') liveInput.focus();
}

function renderTrace() {
  const rows = trace.slice(-TRACE_ROWS_SHOWN);
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = el('tr');
    const instr = el('td');
    instr.append(r.instr);
    if (r.note) {
      instr.append(' ', el('span', 'note', `(${r.note})`));
    }
    tr.append(
      el('td', undefined, String(r.n)),
      el('td', undefined, pad2(r.pc)),
      el('td', undefined, word(r.cir)),
      instr,
      el('td', undefined, String(r.acc)),
      el('td', undefined, r.change || '—'),
      el('td', r.output !== undefined ? 'out' : undefined, r.output !== undefined ? String(r.output) : '—'),
    );
    frag.append(tr);
  }
  traceBody.replaceChildren(frag);
  traceNote.hidden = trace.length <= TRACE_ROWS_SHOWN;
  traceNote.textContent = `Showing the last ${TRACE_ROWS_SHOWN} of ${trace.length} instructions.`;
  traceScroll.scrollTop = traceScroll.scrollHeight;
}

function renderControls() {
  const status = machine?.status;
  // Once the source is edited the next Step or Run re-assembles, so nothing is "finished".
  const finished = !dirty && (status === 'halted' || status === 'error');
  btn.assemble.disabled = running;
  btn.back.disabled = running || history.length === 0;
  btn.step.disabled = finished || running;
  btn.instr.disabled = finished || running;
  btn.run.disabled = finished;
  btn.run.textContent = running ? 'Pause ⏸' : 'Run ▶';
  btn.reset.disabled = false;
  dirtyNote.textContent = machine && dirty ? 'Edited: it will be re-assembled when you Step or Run.' : '';
}

/** " Slept 1.5 s in total." once a SLEEP has run. Shown because Instant runs skip the waiting but still count it. */
function sleptNote(): string {
  const ms = machine?.sleptMs ?? 0;
  if (ms <= 0) return '';
  return ` Slept ${ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} s` : `${ms} ms`} in total.`;
}

function renderStatus() {
  let text: string;
  let kind = '';
  if (errors.length) {
    text = `${errors.length} error${errors.length === 1 ? '' : 's'} found. Fix the highlighted lines.`;
    kind = 'err';
  } else if (!machine) {
    text = 'Not assembled yet. Press Step ▸ or Run ▶.';
  } else if (machine.status === 'error') {
    text = `Error: ${machine.error}`;
    kind = 'err';
  } else if (machine.status === 'halted' && machine.onFire) {
    text = `The CPU caught fire after ${machine.instructionCount} instruction${machine.instructionCount === 1 ? '' : 's'}. Press Back or Reset to put it out.`;
    kind = 'err';
  } else if (machine.status === 'halted') {
    text = `Halted after ${machine.instructionCount} instruction${machine.instructionCount === 1 ? '' : 's'}.${sleptNote()}`;
    kind = 'ok';
  } else if (machine.status === 'waiting-input') {
    text = 'Waiting for input.';
  } else if (running) {
    text = sleepingMs > 0 ? `Sleeping for ${sleepingMs} ms…` : 'Running…';
  } else if (statusNote) {
    text = statusNote + sleptNote();
  } else if (machine.microCount === 0) {
    text = 'Ready. Press Step ▸ to begin.';
  } else {
    text = `Paused. ${machine.instructionCount} instruction${machine.instructionCount === 1 ? '' : 's'} completed.${sleptNote()}`;
  }
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

function showInboxMessage(text: string, isError = false) {
  inboxMsg.hidden = !text;
  inboxMsg.textContent = text;
  inboxMsg.className = isError ? 'msg' : 'muted';
}

function render() {
  if (!machine?.onFire) extinguishFire();
  renderGutter();
  renderErrors();
  renderRegisters();
  renderMemory();
  renderCycle();
  renderIO();
  renderTrace();
  renderControls();
  renderStatus();
  renderLineHighlight(true);
  refreshTip();
  if (peripheralsPanel) {
    const mem = machine?.memory ?? program?.memory;
    peripheralsPanel.update({
      on: peripheralsOn,
      switches: PERIPHERALS.switches.map((a) => mem?.[a] ?? 0),
      lamps: PERIPHERALS.lamps.map((a) => mem?.[a] ?? 0),
    });
  }
  prevStatus = machine?.status ?? '';
}

// ---------- editing a mailbox (double-click) ----------

/** Stand-in "step" so a hand-edited mailbox gets the same highlight as one written by STA. */
function pokeHighlight(addr: number): MicroStep {
  return { phase: 'execute', rtn: '', detail: '', addr, changes: [], write: addr, instructionEnd: false };
}

function pokeMailbox(addr: number, value: number, announce = true) {
  if (!ensureMachine()) return;
  const m = machine!;
  const before = m.memory[addr];
  if (before === value) {
    render(); // nothing changed, but the input still has to go
    return;
  }
  pushFrame(); // so Back undoes just this edit
  m.poke(addr, value);
  recent = [pokeHighlight(addr)];
  if (announce) statusNote = `Mailbox ${pad2(addr)} changed from ${before} to ${value}. Back undoes it; Reset restores the program.`;
  render();
}

// ---------- peripherals (extended LMC) ----------

/** The checkbox: changes what the assembler reserves and defines, so the program is assembled again. */
function setPeripherals(on: boolean) {
  peripheralsOn = on;
  stopRun();
  if (machine || program || errors.length) assembleNow();
  else render();
}

/** Clicking a switch writes 1 or 0 into its mailbox, the same as editing that mailbox by hand. It does not pause a run. */
function toggleSwitch(index: number) {
  if (!peripheralsOn || !ensureMachine()) return;
  const addr = PERIPHERALS.switches[index];
  pokeMailbox(addr, machine!.memory[addr] !== 0 ? 0 : 1, false);
}

function parseWord(text: string): number | string {
  const t = text.trim();
  if (!/^[+-]?\d+$/.test(t)) return 'Enter a whole number, for example 5 or -12.';
  const n = Number(t);
  return n < -999 || n > 999 ? 'A mailbox holds a number from -999 to 999.' : n;
}

let editingCell: HTMLElement | null = null;
let closeEditor: (() => void) | null = null; // commits (or discards) the open editor

function editMailbox(cell: HTMLElement) {
  if (cell === editingCell) return;
  closeEditor?.();
  if (running) {
    stopRun('Paused.');
    render();
  }
  if (!ensureMachine()) return;
  hideTip();

  const addr = Number(cell.dataset.addr);
  const valueEl = cell.querySelector<HTMLElement>('.v')!;
  const input = el('input', 'cell-input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.value = String(machine!.memory[addr]);
  input.setAttribute('aria-label', `New value for mailbox ${pad2(addr)}`);

  cell.classList.add('editing');
  editingCell = cell;
  valueEl.replaceChildren(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (how: 'enter' | 'blur' | 'escape') => {
    if (done) return;
    const parsed = parseWord(input.value);
    if (how === 'enter' && typeof parsed === 'string') {
      // Explain and let them fix it. (Clicking away with a bad value just discards it.)
      input.classList.add('invalid');
      input.title = parsed;
      statusEl.textContent = parsed;
      return;
    }
    done = true;
    cell.classList.remove('editing');
    editingCell = null;
    closeEditor = null;
    if (how !== 'escape' && typeof parsed === 'number') pokeMailbox(addr, parsed);
    else render();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish('enter');
    else if (e.key === 'Escape') finish('escape');
  });
  input.addEventListener('input', () => input.classList.remove('invalid'));
  input.addEventListener('blur', () => finish('blur'));
  closeEditor = () => finish('blur');
}

memoryEl.addEventListener('dblclick', (e) => {
  const cell = (e.target as Element).closest<HTMLElement>('.cell');
  if (!cell) return;
  const io = peripheralAt(Number(cell.dataset.addr));
  if (io?.kind === 'switch') toggleSwitch(io.n - 1); // a switch flips; every other mailbox is edited
  else editMailbox(cell);
});

// ---------- hover bubble: what a machine-code word means ----------

const tipEl = el('div', 'tip');
tipEl.id = 'tip';
tipEl.setAttribute('role', 'tooltip');
tipEl.hidden = true;
document.body.append(tipEl);
let tipTarget: HTMLElement | null = null;

function tipRow(label: string, text: string, cls = ''): HTMLElement[] {
  return [el('dt', cls, label), el('dd', cls, text)];
}

function buildTip(addr: number, e: WordExplanation): HTMLElement[] {
  const label = labelAt(addr);
  const nodes: HTMLElement[] = [
    el('div', 'tip-where', `Mailbox ${pad2(addr)}${label ? ` (${label})` : ''} holds ${e.word}`),
    el('div', 'tip-title', e.title),
  ];
  if (e.digits) {
    const digits = el('div', 'tip-digits');
    const cls = { opcode: 'op', mode: 'mode', operand: 'arg', spare: 'spare' } as const;
    const name = { opcode: 'opcode', mode: 'mode', operand: 'operand', spare: 'unused' } as const;
    digits.append(...e.digits.map((d) => el('span', `d ${cls[d.role]}`, d.digit)));
    // One label under each run of digits that share a role.
    for (let i = 0; i < e.digits.length; ) {
      const role = e.digits[i].role;
      let n = 1;
      while (i + n < e.digits.length && e.digits[i + n].role === role) n++;
      const label = el('span', `l ${cls[role]}`, name[role]);
      label.style.gridColumn = `${i + 1} / span ${n}`;
      digits.append(label);
      i += n;
    }
    nodes.push(digits);
  }
  const rows = el('dl', 'tip-rows');
  if (e.opcode) rows.append(...tipRow('Opcode', e.opcode));
  if (e.operand) rows.append(...tipRow('Operand', e.operand));
  if (e.mode) rows.append(...tipRow('Addressing mode', `${e.mode.name}: ${e.mode.text}`));
  if (e.effect) rows.append(...tipRow('Effect', e.effect, 'mono'));
  if (rows.children.length) nodes.push(rows);
  if (e.note) nodes.push(el('p', 'tip-note', e.note));
  return nodes;
}

function positionTip(target: HTMLElement) {
  const gap = 12;
  const r = target.getBoundingClientRect();
  const t = tipEl.getBoundingClientRect();
  let left = r.right + gap;
  if (left + t.width > window.innerWidth - 8) left = Math.max(8, r.left - gap - t.width);
  const floor = $('status').getBoundingClientRect().bottom + 6; // stay clear of the sticky toolbar
  const top = Math.min(Math.max(floor, r.top + r.height / 2 - t.height / 2), Math.max(floor, window.innerHeight - t.height - 8));
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${top}px`;
}

function showTip(target: HTMLElement) {
  const addr = Number(target.dataset.tipAddr);
  const fixed = target.dataset.tipWord; // margin numbers explain the assembled word, memory cells the live one
  const mem = machine?.memory ?? program?.memory;
  const value = fixed !== undefined ? Number(fixed) : (mem?.[addr] ?? 0);
  const owner = EXTENDED && fixed === undefined ? operandOwner.get(addr) : undefined;
  const operandWord = target.dataset.tipOperand !== undefined ? Number(target.dataset.tipOperand) : mem?.[addr + 1];
  const explanation = explainWord(value, {
    dialect: DIALECT,
    isData: !!program?.dataAddresses.includes(addr),
    isEmpty: !program || addr >= program.size,
    labelAt,
    memory: mem,
    operandWord,
    x: machine?.x,
    operandOf: owner && owner.mode ? { addr: owner.addr, mnemonic: owner.mnemonic, mode: owner.mode } : undefined,
    peripheral: peripheralsOn && fixed === undefined ? peripheralInfoFor?.(addr) : undefined,
  });
  if (tipTarget && tipTarget !== target) tipTarget.removeAttribute('aria-describedby');
  tipTarget = target;
  target.setAttribute('aria-describedby', 'tip');
  tipEl.replaceChildren(...buildTip(addr, explanation));
  tipEl.style.visibility = 'hidden';
  tipEl.hidden = false;
  positionTip(target);
  tipEl.style.visibility = '';
}

function hideTip() {
  tipTarget?.removeAttribute('aria-describedby');
  tipTarget = null;
  tipEl.hidden = true;
}

/** Keep an open bubble in step with the machine while a program runs. */
function refreshTip() {
  if (!tipTarget) return;
  if (tipTarget.isConnected) showTip(tipTarget);
  else hideTip();
}

const tipTargetOf = (node: EventTarget | null) => (node instanceof Element ? node.closest<HTMLElement>('[data-tip-addr]') : null);
document.addEventListener('pointerover', (e) => {
  const t = tipTargetOf(e.target);
  if (t && !t.classList.contains('editing')) showTip(t);
});
document.addEventListener('pointerout', (e) => {
  const t = tipTargetOf(e.target);
  if (t && !t.contains(e.relatedTarget as Node | null)) hideTip();
});
document.addEventListener('pointerdown', (e) => {
  if (!tipTargetOf(e.target)) hideTip();
});
document.addEventListener('scroll', hideTip, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideTip();
});

// ---------- wiring ----------

function loadExample(id: string) {
  const ex = id === 'blank' ? { source: BLANK_SOURCE, inputs: [] as number[] } : examples.find((e) => e.id === id);
  if (!ex) return;
  stopRun();
  if ((ex as Example).peripherals && !peripheralsOn) {
    peripheralsOn = true;
    peripheralsPanel?.setEnabled(true);
  }
  sourceEl.value = ex.source;
  inboxInput.value = ex.inputs.join(' ');
  sourceEl.scrollTop = 0;
  breakpointLines.clear();
  persist();
  assembleNow();
}

function persist() {
  storageSet(KEY_SOURCE, sourceEl.value);
  storageSet(KEY_INBOX, inboxInput.value);
}

sourceEl.addEventListener('input', () => {
  dirty = true;
  errors = [];
  persist();
  render();
});
sourceEl.addEventListener('scroll', () => {
  gutterEl.scrollTop = sourceEl.scrollTop;
  renderLineHighlight();
});
// Reading the code by hand pauses following; the toolbar (Step, Run, Back, Reset...) resumes it.
for (const type of ['wheel', 'touchmove', 'mousedown'] as const) {
  sourceEl.addEventListener(type, () => (followExecution = false), { passive: true });
}
document.querySelector('.toolbar')!.addEventListener('click', () => (followExecution = true), true);
function toggleBreakpoint(line: number) {
  if (breakpointLines.has(line)) breakpointLines.delete(line);
  else breakpointLines.add(line);
  renderGutter();
}
gutterEl.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('.ln');
  if (b) toggleBreakpoint(Number(b.dataset.line));
});
sourceEl.addEventListener('keydown', (e) => {
  if (e.key !== 'F9') return;
  e.preventDefault();
  toggleBreakpoint(sourceEl.value.slice(0, sourceEl.selectionStart).split(/\n/).length);
});

inboxInput.addEventListener('input', () => {
  persist();
  const parsed = parseInputs(inboxInput.value);
  if (!parsed.ok) {
    showInboxMessage(parsed.error, true);
    return;
  }
  if (machine && machine.microCount === 0) {
    machine.reset(parsed.values);
    showInboxMessage('');
  } else if (machine) {
    showInboxMessage('The new inbox will be used when you press Reset.');
  } else {
    showInboxMessage('');
  }
  renderIO();
});

inputPrompt.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = liveInput.value.trim();
  if (!/^\d+$/.test(text) || Number(text) > 999) {
    showInboxMessage('Enter a whole number from 0 to 999.', true);
    return;
  }
  showInboxMessage('');
  liveInput.value = '';
  machine!.pushInput(Number(text));
  if (resumeOnInput) {
    resumeOnInput = false;
    startRun();
  } else {
    render();
  }
});

btn.assemble.addEventListener('click', () => {
  if (assembleNow()) statusNote = 'Assembled. Press Step ▸ or Run ▶.';
  renderStatus();
});
btn.back.addEventListener('click', stepBack);
btn.step.addEventListener('click', () => userStep('micro'));
btn.instr.addEventListener('click', () => userStep('instruction'));
btn.run.addEventListener('click', () => {
  if (running) {
    stopRun('Paused.');
    render();
  } else {
    startRun();
  }
});
btn.reset.addEventListener('click', resetMachine);
exampleSel.addEventListener('change', () => loadExample(exampleSel.value));
speedSel.addEventListener('change', () => {
  storageSet(KEY_SPEED, speedSel.value);
  // Apply the new speed straight away if a run is in progress.
  if (running) {
    stopRun();
    startRun();
  }
});
instrHelpBtn.addEventListener('click', () => openReference({ mnemonic: instrHelpBtn.dataset.mn }));

// text size
let scale = Number(storageGet(KEY_SCALE)) || 1;
function applyScale(next: number) {
  scale = Math.min(1.75, Math.max(0.8, next));
  document.documentElement.style.fontSize = `${16 * scale}px`;
  storageSet(KEY_SCALE, String(scale));
  renderLineHighlight();
}
$('btn-font-dec').addEventListener('click', () => applyScale(scale / 1.125));
$('btn-font-inc').addEventListener('click', () => applyScale(scale * 1.125));
applyScale(scale);

window.addEventListener('resize', () => renderLineHighlight());

// ---------- start-up ----------

/**
 * Everything that depends on the dialect happens here. The extended pieces (its samples, reference pages, badge and
 * register names) are fetched with a dynamic import, and only in extended mode: the standard page never loads them.
 */
async function start() {
  examples = await examplesFor(DIALECT);
  if (EXTENDED) {
    const pack = await import('./extended-pack');
    REGISTERS.push(...pack.EXTENDED_REGISTERS);
    document.title = pack.EXTENDED_TITLE;
    const badge = el('span', 'dialect-badge', pack.BADGE.text);
    badge.title = pack.BADGE.title;
    document.querySelector('.toolbar h1')!.after(badge);
    peripheralInfoFor = pack.peripheralInfo;
    const instant = [...speedSel.options].find((o) => o.value === 'instant') ?? null;
    speedSel.insertBefore(new Option(pack.REALTIME_SPEED.label, pack.REALTIME_SPEED.value), instant);
    peripheralsPanel = pack.mountPeripherals({
      after: document.querySelector('.cycle-card')!,
      onEnable: setPeripherals,
      onToggleSwitch: toggleSwitch,
    });
  }

  buildStaticDom();
  setDiagramShown(storageGet(KEY_DIAGRAM) !== 'hidden');
  $('btn-diagram').addEventListener('click', () => {
    const show = $('cpu-card').classList.contains('diagram-off');
    setDiagramShown(show);
    storageSet(KEY_DIAGRAM, show ? 'shown' : 'hidden');
  });
  await initReference($('reference'), $('btn-ref'), DIALECT);
  $('btn-ref').addEventListener('click', toggleReference);

  exampleSel.replaceChildren(
    Object.assign(el('option', undefined, 'Choose an example…'), { value: '', disabled: true, selected: true }),
    ...examples.map((ex) => Object.assign(el('option', undefined, `${ex.name} (${ex.concept})`), { value: ex.id })),
    Object.assign(el('option', undefined, 'Blank program'), { value: 'blank' }),
  );

  const savedSpeed = storageGet(KEY_SPEED);
  if (savedSpeed && [...speedSel.options].some((o) => o.value === savedSpeed)) speedSel.value = savedSpeed;

  const savedSource = storageGet(KEY_SOURCE);
  if (savedSource) {
    sourceEl.value = savedSource;
    inboxInput.value = storageGet(KEY_INBOX) ?? '';
    dirty = true;
    render();
  } else {
    exampleSel.value = examples[0].id;
    loadExample(examples[0].id);
  }
}

void start();
