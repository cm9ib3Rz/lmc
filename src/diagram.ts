// The CPU diagram: the control unit, the ALU, the three buses and memory, drawn as blocks around the registers.
// It is static. Each register transfer lights up the parts it uses, by colour only (no animation).

import type { BusActivity, MicroStep, Register } from './engine';

export interface Activity {
  /** Registers whose value a step reads (the ones it writes are `changes`, highlighted separately). */
  sources: Set<Register>;
  alu: boolean;
  controlUnit: boolean;
  /** Set when memory is read or written; the three buses carry the transfer. */
  memory: 'read' | 'write' | null;
  bus?: BusActivity;
}

const REGISTER_NAME = /\b(PC|MAR|MDR|CIR|ACC|OPR|X)\b/g;
const names = (text: string) => (text.match(REGISTER_NAME) ?? []) as Register[];

/** The registers a register-transfer step reads, taken from its notation. `MAR ← PC` reads PC. */
export function sourceRegisters(rtn: string): Register[] {
  if (rtn.startsWith('decode')) return ['CIR'];
  const arrow = rtn.lastIndexOf('←');
  if (arrow < 0) return names(rtn);
  const left = names(rtn.slice(0, arrow));
  const right = names(rtn.slice(arrow + 1));
  // `[MAR] ← MDR` reads MAR (the address) as well as MDR. In `if ACC = 0 then PC ← xx` the last name is the one written.
  return rtn.slice(0, arrow).includes('[') ? [...left, ...right] : [...left.slice(0, -1), ...right];
}

export function activityOf(steps: MicroStep[]): Activity {
  const activity: Activity = { sources: new Set(), alu: false, controlUnit: false, memory: null };
  for (const s of steps) {
    sourceRegisters(s.rtn).forEach((r) => activity.sources.add(r));
    if (/^ACC ← ACC [+−] /.test(s.rtn)) activity.alu = true;
    if (s.phase === 'decode' && s.rtn) activity.controlUnit = true;
    if (s.bus) {
      activity.controlUnit = true; // the control unit sends the read/write signal on the control bus
      activity.memory = s.write !== undefined ? 'write' : 'read';
      activity.bus = s.bus;
    }
  }
  return activity;
}

// ---------- DOM ----------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

interface Block {
  root: HTMLElement;
  flow: HTMLElement;
  value: HTMLElement;
  idleFlow: string;
}

function block(className: string, title: string, idleFlow: string): Block {
  const root = el('div', className);
  const flow = el('span', 'flow', idleFlow);
  const value = el('span', 'bv');
  root.append(el('b', 'bt', title), flow, value);
  return { root, flow, value, idleFlow };
}

export interface Diagram {
  update(activity: Activity): void;
}

/** Build the diagram blocks into the three containers and return a function that lights them up. */
export function buildDiagram(unitsEl: HTMLElement, busesEl: HTMLElement, memoryEl: HTMLElement): Diagram {
  const cu = block('unit cu', 'Control unit', 'decodes the CIR and sends control signals');
  const alu = block('unit alu', 'ALU', 'does the arithmetic and sets the ACC');
  unitsEl.replaceChildren(cu.root, alu.root);

  const address = block('bus-block addr', 'Address bus', 'MAR → memory');
  const data = block('bus-block data', 'Data bus', 'memory ↔ MDR');
  const control = block('bus-block ctrl', 'Control bus', 'read or write');
  busesEl.replaceChildren(address.root, data.root, control.root);

  const memory = block('mem-block', 'Memory', '100 mailboxes');
  memoryEl.replaceChildren(memory.root);

  /** "04: MAR → memory" becomes the value "04" and the flow "MAR → memory". */
  const show = (b: Block, on: boolean, text?: string) => {
    b.root.classList.toggle('active', on);
    const [value, flow] = on && text ? (text.includes(': ') ? text.split(': ') : ['', text]) : ['', b.idleFlow];
    b.value.textContent = value;
    b.flow.textContent = flow || b.idleFlow;
  };

  return {
    update(a) {
      cu.root.classList.toggle('active', a.controlUnit);
      alu.root.classList.toggle('active', a.alu);
      show(address, !!a.bus, a.bus?.address);
      show(data, !!a.bus, a.bus?.data);
      show(control, !!a.bus, a.bus?.control);
      memory.root.classList.toggle('read', a.memory === 'read');
      memory.root.classList.toggle('write', a.memory === 'write');
      memory.value.textContent = a.bus ? `${a.memory === 'write' ? 'writing' : 'reading'} mailbox ${a.bus.address.split(':')[0]}` : '';
    },
  };
}
