// Reference material shown in the side drawer. Content is static, trusted HTML
// (condensed from docs/OCR_LMC_Reference.md).

import type { Dialect } from './engine';
import type { Tab } from './reference-extended';
import { ARCHITECTURE_HTML, CYCLE_END_HTML, LABELS_HTML, UNIT_ROWS } from './reference-shared';

const instructionRows: [mn: string, code: string, meaning: string, rtn: string, note?: string][] = [
  ['ADD', '1xx', 'Add the contents of mailbox xx to the accumulator', 'ACC ← ACC + [xx]'],
  ['SUB', '2xx', 'Subtract the contents of mailbox xx from the accumulator', 'ACC ← ACC − [xx]'],
  ['STA', '3xx', 'Store the accumulator in mailbox xx', '[xx] ← ACC'],
  ['LDA', '5xx', 'Load the contents of mailbox xx into the accumulator', 'ACC ← [xx]'],
  ['BRA', '6xx', 'Branch always to xx', 'PC ← xx'],
  ['BRZ', '7xx', 'Branch to xx if the accumulator is zero', 'if ACC = 0 then PC ← xx'],
  ['BRP', '8xx', 'Branch to xx if the accumulator is zero or positive', 'if ACC ≥ 0 then PC ← xx'],
  ['INP', '901', 'Input a number into the accumulator', 'ACC ← input'],
  ['OUT', '902', 'Output the accumulator', 'output ← ACC'],
  ['HLT', '000', 'End the program (<code>COB</code> is a common alias)', 'stop'],
  ['DAT', '—', 'Not an instruction: reserve a mailbox, name it, optionally give it a starting value', 'assembler only'],
];

export const STANDARD_TABS: Tab[] = [
  {
    id: 'about',
    title: 'About the LMC',
    html: `
      <p>The <b>Little Man Computer (LMC)</b> is a very simple model of a computer, designed by Stuart Madnick at MIT in 1965 to show how a processor runs a program. Picture a little man working in a room:</p>
      <ul class="ref-notes">
        <li>The room has <b>100 mailboxes</b>, numbered 00 to 99. Each one holds a 3-digit number, which is either an <b>instruction</b> or some <b>data</b>.</li>
        <li>He has an <b>inbox</b> and an <b>outbox</b> for numbers coming in and going out, and a <b>calculator</b> (the <i>accumulator</i>) that holds one number at a time.</li>
        <li>He follows the program one instruction at a time: <b>fetch</b> the instruction from its mailbox, <b>decode</b> what it means, then <b>execute</b> it. This is the <i>fetch–decode–execute cycle</i>, and it is exactly what a real processor does.</li>
      </ul>
      <p>The instructions are written in <b>assembly language</b>, using short names such as <code>LDA</code> (load) and <code>ADD</code>. The <b>Instructions</b> tab lists all of them. OCR’s A Level Computer Science specification (H446) uses the LMC to teach assembly language.</p>
      <h3>Using this simulator</h3>
      <ol class="ref-notes">
        <li>Type a program in the <b>Program</b> box, or choose one from <b>Example</b>.</li>
        <li>Press <b>Step ▸</b> to watch one register transfer at a time, <b>Instruction</b> to run one whole instruction, or <b>Run</b> to run the program. <b>Back</b> undoes a step and <b>Reset</b> starts again.</li>
        <li>Watch the <b>CPU diagram</b> (registers, control unit, ALU and buses), the <b>fetch–decode–execute</b> panel and the <b>memory</b> change. The parts a step uses are coloured. The trace table at the bottom records each instruction.</li>
        <li>Hover over the numbers beside your program, or over a mailbox, to see what a machine-code word means. Double-click a mailbox to change its value.</li>
      </ol>`,
  },
  {
    id: 'instructions',
    title: 'Instructions',
    html: `
      <p>Every instruction is a 3-digit number: the <b>first digit is the opcode</b>, the <b>last two are the mailbox address</b>.</p>
      <table class="ref-table" id="ref-instructions">
        <thead><tr><th>Mnemonic</th><th>Code</th><th>What it does</th><th>Register transfer</th></tr></thead>
        <tbody>
          ${instructionRows
            .map(([mn, code, meaning, rtn]) => `<tr data-mn="${mn}"><th scope="row"><code>${mn}</code></th><td><code>${code}</code></td><td>${meaning}</td><td><code>${rtn}</code></td></tr>`)
            .join('')}
        </tbody>
      </table>
      <ul class="ref-notes">
        <li><code>LDA</code>, <code>STA</code>, <code>ADD</code> and <code>SUB</code> always use the <b>contents of a mailbox</b>, never the number itself. <code>LDA 10</code> loads what is <i>stored in</i> mailbox 10.</li>
        <li>To add a constant, store it with <code>DAT</code> first: <code>one DAT 1</code> … <code>ADD one</code>.</li>
        <li><code>INP</code>, <code>OUT</code> and <code>HLT</code> take no operand.</li>
        <li>There is no compare instruction: use <code>SUB</code> then <code>BRZ</code> (equal) or <code>BRP</code> (greater than or equal).</li>
        <li>There is no “branch if negative”: branch on the opposite condition, or fall through.</li>
      </ul>
      <p class="ref-caveat">The wording above is a close paraphrase. OCR’s own table (specification Appendix 5d, for 1.2.4(c)) gives only the mnemonic and a short name: Add, Subtract, Store, Load, Branch always, Branch if zero, Branch if positive, Input, Output, End program, Data location. It lists no numeric codes. OCR’s mark scheme describes BRP as branching when the accumulator is “positive or zero”.</p>
      <p class="ref-caveat">OCR also accepts these alternative mnemonics in answers, and this simulator does too: STO, LOAD, BR, BZ, BP, IN, INPUT, END and COB.</p>`,
  },
  {
    id: 'machine',
    title: 'The machine',
    html: `
      <table class="ref-table">
        <tbody>
          <tr><th scope="row">Memory</th><td>100 <b>mailboxes</b>, addresses 00–99. Each holds one 3-digit number.</td></tr>
          <tr><th scope="row">Stored program</th><td>Instructions and data are the same kind of thing (a number) in the same memory.</td></tr>
          ${UNIT_ROWS}
          <tr><th scope="row">PC</th><td><b>Program Counter</b>: holds the address of the next instruction to be fetched. Starts at 00. Its contents are copied to the MAR at the start of each cycle, it is incremented on every cycle, and a branch instruction can change it.</td></tr>
          <tr><th scope="row">MAR</th><td><b>Memory Address Register</b>: holds the address in memory that is about to be read from or written to.</td></tr>
          <tr><th scope="row">MDR</th><td><b>Memory Data Register</b>: holds the data that has just been read from memory, or is about to be written to it. Some sources call it the <i>Memory Buffer Register (MBR)</i>; OCR mark schemes accept either name.</td></tr>
          <tr><th scope="row">CIR</th><td><b>Current Instruction Register</b>: holds the instruction that is being decoded and executed.</td></tr>
          <tr><th scope="row">ACC</th><td><b>Accumulator</b>: the only general register. It holds all input and output and the results of calculations, receives data that has come from memory through the MDR, and is what <code>BRZ</code> and <code>BRP</code> check.</td></tr>
          <tr><th scope="row">Inbox / outbox</th><td>Numbers come in one at a time with <code>INP</code> and go out with <code>OUT</code>. Both go through the ACC.</td></tr>
        </tbody>
      </table>
      <h3>Buses</h3>
      <table class="ref-table">
        <tbody>
          <tr><th scope="row">Address bus</th><td>Carries an address from the MAR to memory.</td></tr>
          <tr><th scope="row">Data bus</th><td>Carries data between memory and the MDR, in both directions.</td></tr>
          <tr><th scope="row">Control bus</th><td>Carries control signals, such as whether memory is being read or written.</td></tr>
        </tbody>
      </table>
      <p>The CPU diagram lights up the three buses, and the steps in the Fetch–decode–execute panel say what travels on each, whenever memory is read or written. Copies between registers (such as <code>MAR ← PC</code>) happen inside the CPU and use none of them.</p>${ARCHITECTURE_HTML}`,
  },
  {
    id: 'syntax',
    title: 'Writing code',
    html: `
      <pre class="ref-code">label   MNEMONIC   operand      // comment</pre>
      <ul class="ref-notes">
        <li>One instruction per line. The <b>label</b> is optional and comes first.</li>
        <li>The operand is a <b>label</b> or a mailbox number.</li>
        <li><code>DAT</code> reserves a mailbox: <code>count DAT</code> starts at 0, <code>one DAT 1</code> starts at 1.</li>
        <li>Lines go into consecutive mailboxes from 00, in the order written. <b>Put <code>DAT</code> lines after <code>HLT</code></b>, otherwise the CPU tries to execute them.</li>
        <li>Labels are not case-sensitive, cannot be an instruction name, and cannot start with a digit. (<code>end</code> is fine as a label: it is only an instruction when it stands alone.)</li>
        <li><code>//</code> starts a comment. That is a feature of this simulator, not of the OCR exam language.</li>
      </ul>
      <h3>Two-pass assembly</h3>
      <ol class="ref-notes">
        <li><b>Pass 1</b>: count addresses and note where each label is (the <i>symbol table</i>).</li>
        <li><b>Pass 2</b>: replace each mnemonic with its opcode and each label with its address.</li>
      </ol>
      <pre class="ref-code">        INP            //  00   901
loop    BRZ end        //  01   705   (end = 05)
        OUT            //  02   902
        SUB one        //  03   206   (one = 06)
        BRA loop       //  04   601   (loop = 01)
end     HLT            //  05   000
one     DAT 1          //  06   001</pre>
      ${LABELS_HTML}
      <p>In the example above, <code>end</code> is mailbox 05. Insert one more instruction before it and <code>end</code> becomes 06: <code>BRZ end</code> now assembles to <code>706</code> instead of <code>705</code>, and <code>one</code> becomes 07. You do not change a line of your program.</p>`,
  },
  {
    id: 'cycle',
    title: 'Fetch–decode–execute',
    html: `
      <h3>Fetch (every instruction)</h3>
      <pre class="ref-code">MAR ← PC
MDR ← [MAR]
CIR ← MDR
PC  ← PC + 1</pre>
      <h3>Decode</h3>
      <p>The <b>control unit</b> splits the CIR into the <b>opcode</b> (first digit) and the <b>operand</b> (last two digits, the address part of the instruction).</p>
      <h3>Execute</h3>
      <table class="ref-table">
        <tbody>
          <tr><th scope="row"><code>LDA xx</code></th><td><code>MAR ← xx</code>; <code>MDR ← [MAR]</code>; <code>ACC ← MDR</code></td></tr>
          <tr><th scope="row"><code>STA xx</code></th><td><code>MAR ← xx</code>; <code>MDR ← ACC</code>; <code>[MAR] ← MDR</code></td></tr>
          <tr><th scope="row"><code>ADD xx</code></th><td><code>MAR ← xx</code>; <code>MDR ← [MAR]</code>; <code>ACC ← ACC + MDR</code></td></tr>
          <tr><th scope="row"><code>SUB xx</code></th><td><code>MAR ← xx</code>; <code>MDR ← [MAR]</code>; <code>ACC ← ACC − MDR</code></td></tr>
          <tr><th scope="row"><code>BRA xx</code></th><td><code>PC ← xx</code></td></tr>
          <tr><th scope="row"><code>BRZ xx</code></th><td><code>if ACC = 0 then PC ← xx</code></td></tr>
          <tr><th scope="row"><code>BRP xx</code></th><td><code>if ACC ≥ 0 then PC ← xx</code></td></tr>
          <tr><th scope="row"><code>INP</code></th><td><code>ACC ← input</code></td></tr>
          <tr><th scope="row"><code>OUT</code></th><td><code>output ← ACC</code></td></tr>
          <tr><th scope="row"><code>HLT</code></th><td>stop</td></tr>
        </tbody>
      </table>
      <p>Instructions that use memory put the <b>address part of the CIR into the MAR</b>. The data then moves between memory and the MDR, and between the MDR and the ACC. <code>INP</code> and <code>OUT</code> use only the ACC. A branch puts the address straight into the PC. In <code>ADD</code> and <code>SUB</code>, the <b>ALU</b> does the calculation and the result goes into the ACC.</p>
      <p>A branch works by <b>overwriting the PC after it has already been incremented</b>. That is why the PC is incremented before the execute stage.</p>${CYCLE_END_HTML}
      <p class="ref-caveat">This is the order in OCR’s 2015 delivery guide (Learner Resource 2): the PC is incremented after the instruction has been fetched. Some textbooks increment straight after <code>MAR ← PC</code>; adding <code>?pc=before</code> to the page address switches to that order. Every version starts by copying the PC to the MAR and increments the PC once per cycle. The OCR mark schemes I checked do not say where in the cycle the increment must go.</p>`,
  },
  {
    id: 'mistakes',
    title: 'Common mistakes',
    html: `
      <table class="ref-table">
        <thead><tr><th>Mistake</th><th>Fix</th></tr></thead>
        <tbody>
          <tr><td><code>LDA 5</code> “loads the number 5”</td><td>It loads the <b>contents of mailbox 5</b>. Use <code>DAT</code> for constants.</td></tr>
          <tr><td><code>ADD 1</code> “adds one”</td><td>It adds the contents of mailbox 1, probably an instruction.</td></tr>
          <tr><td><code>DAT</code> before or inside the code</td><td>It executes as an instruction; <code>DAT 0</code> is <code>000</code> = <code>HLT</code>. Put data after <code>HLT</code>.</td></tr>
          <tr><td>Forgetting <code>HLT</code></td><td>The CPU runs into the data and executes it.</td></tr>
          <tr><td>Forgetting <code>BRA loop</code></td><td>The program falls through instead of repeating.</td></tr>
          <tr><td>“There is a compare instruction”</td><td>There isn’t. <code>SUB</code>, then <code>BRZ</code> (equal) or <code>BRP</code> (≥).</td></tr>
          <tr><td>“Branch if negative”</td><td><code>BRP</code> branches for ≥ 0. Invert the logic.</td></tr>
          <tr><td>Reusing a label, or a label that is an instruction name</td><td>Assembler error.</td></tr>
          <tr><td>Mixing up OCR LMC and AQA assembly</td><td>Different instruction sets. AQA uses <code>LDR</code>, <code>STR</code>, <code>MOV</code>, <code>CMP</code>…</td></tr>
        </tbody>
      </table>`,
  },
];

/**
 * The tabs for a dialect: the standard LMC as OCR specifies it, or the extended variant. The extended pages are
 * fetched with a dynamic import, so the standard page never downloads them.
 */
async function buildTabs(dialect: Dialect): Promise<{ tabs: Tab[]; titleSuffix: string }> {
  if (dialect === 'standard') return { tabs: STANDARD_TABS, titleSuffix: '' };
  const { ADDRESSING_TAB, EXTENDED_TABS, EXTENDED_REFERENCE_TITLE, PERIPHERALS_TAB } = await import('./extended-pack');
  const tabs = STANDARD_TABS.map((t) => EXTENDED_TABS[t.id] ?? t);
  const at = tabs.findIndex((t) => t.id === 'mistakes');
  tabs.splice(at, 0, ADDRESSING_TAB, PERIPHERALS_TAB);
  return { tabs, titleSuffix: EXTENDED_REFERENCE_TITLE };
}

let TABS: Tab[] = STANDARD_TABS;

const DOCK_KEY = 'lmc.refDocked';

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
    /* storage unavailable: the setting just won't persist */
  }
}

let drawer: HTMLElement;
let tabButtons: HTMLButtonElement[];
let panels: HTMLElement[];
let toggleButton: HTMLElement | null = null;

export async function initReference(host: HTMLElement, toggle: HTMLElement, dialect: Dialect = 'standard') {
  toggleButton = toggle;
  const built = await buildTabs(dialect);
  TABS = built.tabs;
  host.innerHTML = `
    <div class="ref-head">
      <h2 id="ref-title">Reference${built.titleSuffix}</h2>
      <label class="ref-dock"><input type="checkbox" id="ref-dock"> Dock beside simulator</label>
      <button type="button" class="ref-close" aria-label="Close reference">✕</button>
    </div>
    <div class="ref-tabs" role="tablist" aria-label="Reference topics">
      ${TABS.map((t) => `<button type="button" role="tab" id="ref-tab-${t.id}" aria-controls="ref-panel-${t.id}" data-tab="${t.id}">${t.title}</button>`).join('')}
    </div>
    <div class="ref-body">
      ${TABS.map((t) => `<section role="tabpanel" id="ref-panel-${t.id}" aria-labelledby="ref-tab-${t.id}" hidden>${t.html}</section>`).join('')}
    </div>`;
  drawer = host;
  tabButtons = [...host.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  panels = [...host.querySelectorAll<HTMLElement>('[role=tabpanel]')];

  tabButtons.forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab!)));
  host.querySelector('.ref-close')!.addEventListener('click', closeReference);
  const dock = host.querySelector<HTMLInputElement>('#ref-dock')!;
  dock.checked = storageGet(DOCK_KEY) === '1';
  applyDock(dock.checked);
  dock.addEventListener('change', () => {
    storageSet(DOCK_KEY, dock.checked ? '1' : '0');
    applyDock(dock.checked);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen() && !document.body.classList.contains('ref-docked')) closeReference();
  });
  selectTab('about');
}

function applyDock(docked: boolean) {
  document.body.classList.toggle('ref-docked', docked);
}

function selectTab(id: string) {
  tabButtons.forEach((b) => {
    const on = b.dataset.tab === id;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  panels.forEach((p) => (p.hidden = p.id !== `ref-panel-${id}`));
}

export function isOpen() {
  return document.body.classList.contains('ref-open');
}

export function closeReference() {
  if (!drawer) return;
  document.body.classList.remove('ref-open');
  drawer.setAttribute('aria-hidden', 'true');
  toggleButton?.setAttribute('aria-expanded', 'false');
  toggleButton?.focus();
}

export function toggleReference() {
  if (isOpen()) closeReference();
  else openReference();
}

/** Open the drawer, optionally on a topic, or on the Instructions tab with one mnemonic highlighted. */
export function openReference(options: { tab?: string; mnemonic?: string } = {}) {
  if (!drawer) return;
  document.body.classList.add('ref-open');
  drawer.setAttribute('aria-hidden', 'false');
  toggleButton?.setAttribute('aria-expanded', 'true');
  selectTab(options.mnemonic ? 'instructions' : (options.tab ?? tabButtons.find((b) => b.getAttribute('aria-selected') === 'true')?.dataset.tab ?? 'instructions'));

  drawer.querySelectorAll('#ref-instructions tr.hl').forEach((r) => r.classList.remove('hl'));
  if (options.mnemonic) {
    const row = drawer.querySelector<HTMLElement>(`#ref-instructions tr[data-mn="${options.mnemonic}"]`);
    row?.classList.add('hl');
    row?.scrollIntoView({ block: 'center' });
  }
}
