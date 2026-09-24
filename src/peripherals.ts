// The peripherals panel of the extended LMC: three switches and three lamps, memory-mapped to the top mailboxes.
// Only ever loaded in extended mode (it is part of extended-pack.ts).
//
// The panel knows nothing about the machine. main.ts tells it what the six mailboxes hold, and tells main.ts
// when a switch is clicked or the checkbox changes.
import { PERIPHERALS } from './engine';
import { pad2 } from './format';

export interface PeripheralsState {
  on: boolean;
  /** What the three switch mailboxes hold (a switch is up when its mailbox is not 0). */
  switches: readonly number[];
  /** What the three lamp mailboxes hold (a lamp is lit when its mailbox is not 0). */
  lamps: readonly number[];
}

export interface PeripheralsPanel {
  update(state: PeripheralsState): void;
  /** Tick or untick the checkbox from outside (a sample program that needs the peripherals turns them on). */
  setEnabled(on: boolean): void;
}

export interface PeripheralsOptions {
  /** The panel is inserted straight after this element. */
  after: Element;
  onEnable(on: boolean): void;
  onToggleSwitch(index: number): void;
}

const LAMP_COLOURS = ['red', 'amber', 'green'] as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountPeripherals(options: PeripheralsOptions): PeripheralsPanel {
  const section = el('section', 'card peripherals-card');
  section.setAttribute('aria-labelledby', 'h-periph');

  const head = el('div', 'card-head');
  const title = el('h2', undefined, 'Peripherals');
  title.id = 'h-periph';
  const label = el('label', 'periph-enable');
  const checkbox = el('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'periph-enable';
  label.append(checkbox, ' Enable switches and lamps');
  head.append(title, label);

  const offNote = el(
    'p',
    'muted periph-note',
    `Off. Turn them on to add three switches and three lamps, memory-mapped to mailboxes ${PERIPHERALS.switches[0]}-${PERIPHERALS.lamps[2]}. Those mailboxes are then reserved, and the names switch1, switch2, switch3, lamp1, lamp2 and lamp3 can be used in a program.`,
  );

  const body = el('div', 'periph-body');
  body.hidden = true;

  // ---- switches ----
  const switchRow = el('div', 'periph-row');
  const switchButtons = PERIPHERALS.switches.map((addr, i) => {
    const button = el('button', 'sw');
    button.type = 'button';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', 'false');
    button.setAttribute('aria-label', `Switch ${i + 1}, mailbox ${addr}`);
    const knob = el('span', 'sw-track');
    knob.append(el('span', 'sw-knob'));
    const caption = el('span', 'sw-caption');
    caption.append(el('b', undefined, `switch${i + 1}`), el('span', 'sw-addr', `mailbox ${pad2(addr)}`), el('span', 'sw-state', 'down: 0'));
    button.append(knob, caption);
    button.addEventListener('click', () => options.onToggleSwitch(i));
    switchRow.append(button);
    return button;
  });

  // ---- lamps ----
  const lampRow = el('div', 'periph-row');
  const lampNodes = PERIPHERALS.lamps.map((addr, i) => {
    const lamp = el('div', `lamp ${LAMP_COLOURS[i]}`);
    lamp.setAttribute('role', 'img');
    lamp.setAttribute('aria-label', `Lamp ${i + 1}, mailbox ${addr}: off`);
    lamp.append(el('span', 'lamp-bulb'));
    const caption = el('span', 'lamp-caption');
    caption.append(el('b', undefined, `lamp${i + 1}`), el('span', 'sw-addr', `mailbox ${pad2(addr)}`), el('span', 'lamp-state', 'off'));
    lamp.append(caption);
    lampRow.append(lamp);
    return lamp;
  });

  body.append(
    switchRow,
    lampRow,
    el('p', 'muted periph-note', 'A switch writes 1 (up) or 0 (down) into its mailbox when you click it, and a program can write there too. A lamp is lit while its mailbox holds anything other than 0.'),
  );

  section.append(head, offNote, body);
  options.after.after(section);

  checkbox.addEventListener('change', () => options.onEnable(checkbox.checked));

  return {
    setEnabled(on) {
      checkbox.checked = on;
    },
    update(state) {
      checkbox.checked = state.on;
      body.hidden = !state.on;
      offNote.hidden = state.on;
      switchButtons.forEach((button, i) => {
        const up = (state.switches[i] ?? 0) !== 0;
        button.setAttribute('aria-checked', String(up));
        button.classList.toggle('up', up);
        button.querySelector('.sw-state')!.textContent = up ? `up: ${state.switches[i]}` : 'down: 0';
      });
      lampNodes.forEach((lamp, i) => {
        const lit = (state.lamps[i] ?? 0) !== 0;
        lamp.classList.toggle('lit', lit);
        lamp.setAttribute('aria-label', `Lamp ${i + 1}, mailbox ${PERIPHERALS.lamps[i]}: ${lit ? 'on' : 'off'}`);
        lamp.querySelector('.lamp-state')!.textContent = lit ? `on: ${state.lamps[i]}` : 'off';
      });
    },
  };
}

/** Hover text for a peripheral mailbox, or undefined for any other mailbox. */
export function peripheralInfo(addr: number): { title: string; note: string } | undefined {
  const s = (PERIPHERALS.switches as readonly number[]).indexOf(addr);
  if (s >= 0) {
    return {
      title: `Switch ${s + 1}: switch${s + 1}`,
      note: `A memory-mapped switch. Clicking it in the Peripherals panel writes 1 (up) or 0 (down) into this mailbox, and a program reads it with LDA switch${s + 1}. A program can also write here, and what is written stands.`,
    };
  }
  const l = (PERIPHERALS.lamps as readonly number[]).indexOf(addr);
  if (l >= 0) {
    return {
      title: `Lamp ${l + 1}: lamp${l + 1}`,
      note: `A memory-mapped lamp. It lights while this mailbox holds anything other than 0, so a program switches it on with STA lamp${l + 1}.`,
    };
  }
  return undefined;
}
