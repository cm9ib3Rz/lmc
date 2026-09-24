// Reference material for the EXTENDED LMC (?lmc=extended). Static, trusted HTML.
// Everything here is invented for teaching and is NOT part of the OCR specification (see docs/OCR_LMC_Reference.md §7.1).

import { ARCHITECTURE_HTML, CYCLE_END_HTML, LABELS_HTML, UNIT_ROWS } from './reference-shared';

export interface Tab {
  id: string;
  title: string;
  html: string;
}

const BANNER = `<p class="ref-banner"><b>Extended LMC: not part of the OCR specification.</b> This page describes an invented variant with addressing modes, an index register and two-word instructions. The standard LMC (the one in OCR’s specification) is what the simulator runs without <code>?lmc=extended</code> in the page address.</p>`;

const instructionRows: [mn: string, modes: string, word: string, meaning: string, rtn: string][] = [
  ['ADD', '0 1 2 3', '1M0', 'Add a value to the accumulator', 'ACC ← ACC + value'],
  ['SUB', '0 1 2 3', '2M0', 'Subtract a value from the accumulator', 'ACC ← ACC − value'],
  ['STA', '0 2 3', '3M0', 'Store the accumulator in a mailbox', '[address] ← ACC'],
  ['LDX', '0 1', '4M0', 'Load a value into the index register X', 'X ← value'],
  ['LDA', '0 1 2 3', '5M0', 'Load a value into the accumulator', 'ACC ← value'],
  ['BRA', '0', '600', 'Branch always', 'PC ← OPR'],
  ['BRZ', '0', '700', 'Branch if the accumulator is zero', 'if ACC = 0 then PC ← OPR'],
  ['BRP', '0', '800', 'Branch if the accumulator is zero or positive', 'if ACC ≥ 0 then PC ← OPR'],
  ['INP', '', '901', 'Input a number into the accumulator', 'ACC ← input'],
  ['OUT', '', '902', 'Output the accumulator', 'output ← ACC'],
  ['INX', '', '903', 'Add 1 to the index register X', 'X ← X + 1'],
  ['TXA', '', '904', 'Copy the index register X into the accumulator', 'ACC ← X'],
  ['SLEEP', '', '905 + n', 'Wait n milliseconds. <code>n</code> is a whole number 0-999 written after it: <code>SLEEP 500</code>', 'wait OPR ms'],
  ['HLT', '', '000', 'End the program (<code>COB</code> and <code>END</code> also work)', 'stop'],
  ['DAT', '', '—', 'Not an instruction: reserve a mailbox, name it, optionally give it a starting value', 'assembler only'],
];

export const EXTENDED_TABS: Record<string, Tab> = {
  instructions: {
    id: 'instructions',
    title: 'Instructions',
    html: `
      ${BANNER}
      <p>Instructions take <b>one or two mailboxes</b>. The first word is <b>O M 0</b>: <b>O</b> is the operation and <b>M</b> is the addressing mode. Most instructions are followed by an <b>operand word</b> in the next mailbox.</p>
      <table class="ref-table">
        <thead><tr><th>M</th><th>Mode</th><th>Written</th></tr></thead>
        <tbody>
          <tr><td><code>0</code></td><td>Direct</td><td><code>LDA 5</code> or <code>LDA name</code></td></tr>
          <tr><td><code>1</code></td><td>Immediate</td><td><code>LDA #5</code></td></tr>
          <tr><td><code>2</code></td><td>Indirect</td><td><code>LDA (5)</code> or <code>LDA (name)</code></td></tr>
          <tr><td><code>3</code></td><td>Indexed</td><td><code>LDA 5,X</code> or <code>LDA name,X</code></td></tr>
        </tbody>
      </table>
      <table class="ref-table" id="ref-instructions">
        <thead><tr><th>Mnemonic</th><th>Modes (M)</th><th>Opcode word</th><th>What it does</th><th>Register transfer</th></tr></thead>
        <tbody>
          ${instructionRows
            .map(([mn, modes, word, meaning, rtn]) => `<tr data-mn="${mn}"><th scope="row"><code>${mn}</code></th><td>${modes}</td><td><code>${word}</code></td><td>${meaning}</td><td><code>${rtn}</code></td></tr>`)
            .join('')}
        </tbody>
      </table>
      <ul class="ref-notes">
        <li>“value” is the operand word itself in immediate mode, and the contents of a mailbox in the other modes.</li>
        <li><code>STA</code> cannot use immediate mode (you cannot store into a constant). Branches always take a plain label or mailbox number.</li>
        <li><code>INP</code>, <code>OUT</code>, <code>INX</code>, <code>TXA</code> and <code>HLT</code> are one word with no operand. <code>SLEEP</code> is two words: <code>905</code> and then the number of milliseconds.</li>
        <li><b>SLEEP</b> only asks for a wait; the machine has no clock. The simulator does the waiting while a program runs at Slow, Medium, Fast or <b>Real time</b> speed (Real time makes the wait almost exact). At <b>Instant</b> speed, and when you step by hand, nothing waits. The status line shows the total time slept. The longest single wait is 999 ms; use several <code>SLEEP</code>s in a row for longer.</li>
        <li>Plain LMC programs still assemble here, but a two-word instruction uses two mailboxes, so the machine code and the addresses of labels are different.</li>
      </ul>`,
  },

  machine: {
    id: 'machine',
    title: 'The machine',
    html: `
      ${BANNER}
      <table class="ref-table">
        <tbody>
          <tr><th scope="row">Memory</th><td>100 <b>mailboxes</b>, addresses 00–99. Each holds one 3-digit number. An instruction may use two.</td></tr>
          ${UNIT_ROWS}
          <tr><th scope="row">PC</th><td><b>Program Counter</b>: holds the address of the next word to fetch. It moves on by the <b>length of the instruction</b>: 1 or 2.</td></tr>
          <tr><th scope="row">MAR</th><td><b>Memory Address Register</b>: holds the address in memory that is about to be read from or written to.</td></tr>
          <tr><th scope="row">MDR</th><td><b>Memory Data Register</b>: holds the data just read from memory, or about to be written to it (also called the Memory Buffer Register, MBR).</td></tr>
          <tr><th scope="row">CIR</th><td><b>Current Instruction Register</b>: holds the opcode word being decoded and executed.</td></tr>
          <tr><th scope="row">OPR</th><td><b>Operand Register</b> (extended only): holds the operand word of the current instruction, fetched after the opcode word.</td></tr>
          <tr><th scope="row">ACC</th><td><b>Accumulator</b>: holds all input and output and the results of calculations, receives data from the MDR, and is what <code>BRZ</code> and <code>BRP</code> check.</td></tr>
          <tr><th scope="row">X</th><td><b>Index Register</b> (extended only): set with <code>LDX</code> or <code>INX</code>, added to the operand in indexed mode, and copied to the ACC by <code>TXA</code>.</td></tr>
        </tbody>
      </table>
      <h3>Buses</h3>
      <table class="ref-table">
        <tbody>
          <tr><th scope="row">Address bus</th><td>Carries an address from the MAR to memory.</td></tr>
          <tr><th scope="row">Data bus</th><td>Carries data between memory and the MDR, in both directions.</td></tr>
          <tr><th scope="row">Control bus</th><td>Carries control signals, such as whether memory is being read or written.</td></tr>
        </tbody>
      </table>${ARCHITECTURE_HTML}`,
  },

  syntax: {
    id: 'syntax',
    title: 'Writing code',
    html: `
      ${BANNER}
      <pre class="ref-code">label   MNEMONIC   operand      // comment</pre>
      <ul class="ref-notes">
        <li>The operand is a label or mailbox number, written <code>5</code>, <code>#5</code>, <code>(5)</code> or <code>5,X</code>.</li>
        <li>An immediate value is <code>#</code> and a number from 0 to 999. An address is 00–99.</li>
        <li><code>DAT</code> reserves one mailbox. Put <code>DAT</code> lines after <code>HLT</code>.</li>
        <li>Labels are not case-sensitive, cannot be an instruction name, and cannot start with a digit.</li>
        <li><code>//</code> starts a comment.</li>
      </ul>
      <h3>Two-pass assembly</h3>
      <p>Instructions have different lengths, so <b>pass 1</b> must work out how long every instruction is before it can say where a label is. <b>Pass 2</b> then writes the words.</p>
      <pre class="ref-code">        LDX #0         //  00-01   410 000
loop    LDA data,X     //  02-03   530 008   (data = 08)
        INX            //  04      903
        TXA            //  05      904
        BRA loop       //  06-07   600 002   (loop = 02)
data    DAT 4          //  08      004</pre>
      ${LABELS_HTML}`,
  },

  cycle: {
    id: 'cycle',
    title: 'Fetch–decode–execute',
    html: `
      ${BANNER}
      <h3>Fetch the opcode word</h3>
      <pre class="ref-code">MAR ← PC
MDR ← [MAR]
CIR ← MDR
PC  ← PC + 1</pre>
      <h3>Decode</h3>
      <p>The <b>control unit</b> splits the CIR into the operation <b>O</b> and the mode <b>M</b>, and decides whether an operand word follows.</p>
      <h3>Fetch the operand word (two-word instructions)</h3>
      <pre class="ref-code">MAR ← PC
MDR ← [MAR]
OPR ← MDR
PC  ← PC + 1</pre>
      <h3>Execute: <code>LDA</code> in each mode</h3>
      <table class="ref-table">
        <thead><tr><th>Mode</th><th>Register transfers</th><th>Memory reads for the data</th></tr></thead>
        <tbody>
          <tr><th scope="row">Direct</th><td><code>MAR ← OPR</code>; <code>MDR ← [MAR]</code>; <code>ACC ← MDR</code></td><td>1</td></tr>
          <tr><th scope="row">Immediate</th><td><code>ACC ← OPR</code></td><td>0</td></tr>
          <tr><th scope="row">Indirect</th><td><code>MAR ← OPR</code>; <code>MDR ← [MAR]</code>; <code>MAR ← MDR</code>; <code>MDR ← [MAR]</code>; <code>ACC ← MDR</code></td><td>2</td></tr>
          <tr><th scope="row">Indexed</th><td><code>MAR ← OPR + X</code>; <code>MDR ← [MAR]</code>; <code>ACC ← MDR</code></td><td>1</td></tr>
        </tbody>
      </table>
      <p>Counting the two instruction fetches, <code>LDA</code> makes <b>3 / 2 / 4 / 3</b> memory accesses in direct / immediate / indirect / indexed mode. Indirect is the slowest and immediate the fastest.</p>
      <p><code>STA</code> works the same way but ends with <code>MDR ← ACC</code>; <code>[MAR] ← MDR</code>. <code>ADD</code> and <code>SUB</code> end with the <b>ALU</b> calculating <code>ACC ← ACC ± MDR</code> (or <code>± OPR</code> for immediate). A branch loads <code>PC ← OPR</code>. <code>INX</code> is <code>X ← X + 1</code> and <code>TXA</code> is <code>ACC ← X</code>.</p>
      ${CYCLE_END_HTML}
      <p class="ref-caveat">This is the order in OCR’s 2015 delivery guide. Adding <code>?pc=before</code> to the page address moves <code>PC ← PC + 1</code> to straight after <code>MAR ← PC</code>, as some textbooks have it.</p>`,
  },

  mistakes: {
    id: 'mistakes',
    title: 'Common mistakes',
    html: `
      ${BANNER}
      <table class="ref-table">
        <thead><tr><th>Mistake</th><th>Fix</th></tr></thead>
        <tbody>
          <tr><td><code>LDA 5</code> “loads the number 5”</td><td>Direct mode loads the <b>contents of mailbox 5</b>. Use <code>LDA #5</code> to load the number 5.</td></tr>
          <tr><td>Storing into a constant: <code>STA #5</code></td><td>Not allowed. Store to a mailbox: <code>STA 5</code>, <code>STA (5)</code> or <code>STA 5,X</code>.</td></tr>
          <tr><td>Branching to a number instead of an instruction</td><td>An operand word is data. If the PC lands on one, the CPU stops with an illegal instruction.</td></tr>
          <tr><td>Forgetting <code>INX</code> in an indexed loop</td><td>X never changes, so the loop reads the same element forever.</td></tr>
          <tr><td>Indexing past the end of memory</td><td>The address is operand + X and does not wrap round. Address 100 or more is an error.</td></tr>
          <tr><td>Working out label addresses by counting lines</td><td>Two-word instructions use two mailboxes. Look at the margin numbers.</td></tr>
          <tr><td><code>DAT</code> before or inside the code</td><td>It executes as an instruction. Put data after <code>HLT</code>.</td></tr>
          <tr><td>Forgetting <code>HLT</code> or <code>BRA loop</code></td><td>The CPU runs into the data, or falls through instead of repeating.</td></tr>
          <tr><td>Mixing up OCR LMC and AQA assembly</td><td>Different instruction sets. AQA uses <code>LDR</code>, <code>STR</code>, <code>MOV</code>, <code>CMP</code>…</td></tr>
        </tbody>
      </table>`,
  },
};

export const PERIPHERALS_TAB: Tab = {
  id: 'peripherals',
  title: 'Peripherals',
  html: `
    ${BANNER}
    <p>Tick <b>Enable switches and lamps</b> in the Peripherals panel to add three switches and three lamps. They are <b>memory-mapped</b>: instead of special input and output instructions, a program uses the ordinary <code>LDA</code> and <code>STA</code> on particular mailboxes.</p>
    <table class="ref-table">
      <thead><tr><th>Mailbox</th><th>Name</th><th>What it is</th></tr></thead>
      <tbody>
        <tr><td><code>94</code></td><td><code>switch1</code></td><td rowspan="3">Switches. Clicking one writes <b>1</b> (up) or <b>0</b> (down) into its mailbox. A program reads it with <code>LDA switch1</code>.</td></tr>
        <tr><td><code>95</code></td><td><code>switch2</code></td></tr>
        <tr><td><code>96</code></td><td><code>switch3</code></td></tr>
        <tr><td><code>97</code></td><td><code>lamp1</code></td><td rowspan="3">Lamps. A lamp is lit while its mailbox holds <b>anything other than 0</b>. A program lights it with <code>STA lamp1</code>.</td></tr>
        <tr><td><code>98</code></td><td><code>lamp2</code></td></tr>
        <tr><td><code>99</code></td><td><code>lamp3</code></td></tr>
      </tbody>
    </table>
    <ul class="ref-notes">
      <li>While the peripherals are on, these six mailboxes are <b>reserved</b>: the assembler will not put a program's code or data there, so a program can use mailboxes 00-93.</li>
      <li>The names <code>switch1</code> to <code>lamp3</code> exist only while the peripherals are on, and cannot be used as labels.</li>
      <li>The memory grid draws the six mailboxes differently to show they are mapped to devices. They are still ordinary memory: a running program can read and write all of them, and what it writes stands.</li>
      <li><code>SLEEP</code> is handy with lamps: <code>STA lamp1</code>, <code>SLEEP 500</code>, then switch it off again, makes a blink. Choose the <b>Real time</b> speed to see the timing as written.</li>
      <li>A program that <b>polls</b> a switch loops until the mailbox changes: <code>wait LDA switch1</code>, <code>BRZ wait</code>. Run it at Medium or Fast speed, not Instant, so you can click while it runs.</li>
    </ul>
    <pre class="ref-code">loop    LDA switch1     // read switch 1: 0 or 1
        STA lamp1       // show it on lamp 1
        BRA loop</pre>`,
};

export const ADDRESSING_TAB: Tab = {
  id: 'addressing',
  title: 'Addressing modes',
  html: `
    ${BANNER}
    <p>An addressing mode says how <b>the operand</b> of an instruction is interpreted.</p>
    <ul class="ref-notes">
      <li><b>Immediate</b>: the operand <i>is</i> the data.</li>
      <li><b>Direct</b>: the operand is the <i>address</i> of the data.</li>
      <li><b>Indirect</b>: the operand is an address that <i>holds the address</i> of the data.</li>
      <li><b>Indexed</b>: the address is the operand <i>offset by the Index Register</i>.</li>
    </ul>
    <p>Worked example: mailbox 05 holds 12, mailbox 12 holds 99, mailbox 07 holds 40, and X = 2.</p>
    <table class="ref-table">
      <thead><tr><th>Mode</th><th>Written</th><th>Words</th><th>ACC becomes</th></tr></thead>
      <tbody>
        <tr><th scope="row">Immediate</th><td><code>LDA #5</code></td><td><code>510 005</code></td><td><b>5</b>, the operand itself</td></tr>
        <tr><th scope="row">Direct</th><td><code>LDA 5</code></td><td><code>500 005</code></td><td>[5] = <b>12</b></td></tr>
        <tr><th scope="row">Indirect</th><td><code>LDA (5)</code></td><td><code>520 005</code></td><td>[[5]] = [12] = <b>99</b></td></tr>
        <tr><th scope="row">Indexed</th><td><code>LDA 5,X</code></td><td><code>530 005</code></td><td>[5 + 2] = [7] = <b>40</b></td></tr>
      </tbody>
    </table>
    <p>The same address calculation is used to store: <code>STA 5</code> writes [5], <code>STA (5)</code> writes [12] and <code>STA 5,X</code> writes [7].</p>
    <h3>Trade-offs</h3>
    <ul class="ref-notes">
      <li><b>Immediate</b> needs no data fetch, but the value is limited by the size of the operand.</li>
      <li><b>Direct</b> is limited in range by the size of the operand (here 00–99).</li>
      <li><b>Indirect</b> reaches any address held in memory but needs an extra memory access.</li>
      <li><b>Indexed</b> suits sequential data such as arrays: change X, not the instruction.</li>
    </ul>
    <p class="ref-caveat">How a mode is encoded is not defined by OCR. This variant puts the mode in the tens digit of the opcode word and the operand in the word after it, like an 8-bit CPU. It is a teaching convenience and not something to memorise for the exam.</p>`,
};
