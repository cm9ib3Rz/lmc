// Reference wording that is the same in the standard and the extended reference.
// It covers the parts of OCR H446 1.1.1 that surround the register transfers: the ALU and control unit (1.1.1a),
// the end of the cycle (interrupts, per OCR's 1.1.1 delivery guide), and the architecture topics (1.1.1c-f).

/** Table rows for the two units that are not registers. They go above the register rows in "The machine". */
export const UNIT_ROWS = `
          <tr><th scope="row">ALU</th><td><b>Arithmetic Logic Unit</b>: does the calculations. In the LMC that is the addition for <code>ADD</code> and the subtraction for <code>SUB</code>. The result goes into the ACC.</td></tr>
          <tr><th scope="row">Control unit</th><td>Runs the cycle. It decodes the instruction in the CIR and sends out the control signals (such as “read memory”) that make the other parts do their job.</td></tr>`;

/** Follows the buses table in "The machine". */
export const ARCHITECTURE_HTML = `
      <h3>Von Neumann architecture</h3>
      <p>The LMC is a simple example of the <b>von Neumann architecture</b>: one memory holds both the instructions and the data (the stored program concept), and the CPU fetches from it over one set of buses. A <b>Harvard architecture</b> keeps instructions and data in separate memories.</p>
      <h3>What the LMC leaves out</h3>
      <p>A real processor is also affected by its <b>clock speed</b>, its <b>number of cores</b>, its <b>cache</b> and <b>pipelining</b> (1.1.1 c to e). The LMC has none of these: it finishes one instruction completely before it starts the next, using one core and no cache, so its speed cannot be studied here.</p>`;

/** Follows the execute table in the fetch–decode–execute tab. */
export const CYCLE_END_HTML = `
      <h3>After execute</h3>
      <p>A real processor ends every cycle by <b>checking for interrupts</b>: signals from devices or other sources asking for attention. If one is waiting, it branches to the relevant <b>interrupt service routine</b>; if not, it starts the next fetch. OCR’s 1.1.1 delivery guide lists this as the last step. The LMC has no interrupts, so this simulator goes straight back to the fetch.</p>`;

/** Follows the two-pass assembly example in "Writing code". */
export const LABELS_HTML = `
      <h3>Why labels?</h3>
      <p>A label to the <b>left</b> of an instruction or <code>DAT</code> gives that mailbox a name. A label to the <b>right</b> of a mnemonic stands for that mailbox’s address. With <code>DAT</code> a label works as a <b>variable</b>: <code>one DAT 1</code> is a mailbox called <code>one</code> that starts off holding 1.</p>
      <p>Without labels you would have to work out the address of every mailbox by hand and write those numbers into your instructions. Insert one instruction and every mailbox after it moves down by one, so every instruction that refers to one of them would need changing. With labels, the assembler works the addresses out again each time you assemble, so you never have to.</p>`;
