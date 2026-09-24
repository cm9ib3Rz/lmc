const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType,
  BorderStyle, AlignmentType, VerticalAlign, LevelFormat, PageBreak,
} = require('docx');

const K = 1.2, S = (n) => Math.round(n * K);
const NAVY = '002269', CRIMSON = 'A50034', TINT = 'EEF1F8', ROSE = 'FBEAEE', GREY = 'C9CFDC', ROWALT = 'F6F8FC';
const BODY = 'Calibri', MONO = 'Consolas';
const W = 10466; // A4 (11906) minus 2 x 720 margins

const run = (t, o = {}) => new TextRun({ text: t, font: BODY, size: S(17), ...o });
const mono = (t, o = {}) => new TextRun({ text: t, font: MONO, size: S(16), ...o });
const para = (runs, o = {}) => new Paragraph({ spacing: { before: 0, after: 30 }, ...o, children: Array.isArray(runs) ? runs : [runs] });
const heading = (t) => new Paragraph({
  spacing: { before: 100, after: 50 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: CRIMSON, space: 1 } },
  children: [new TextRun({ text: t, font: BODY, size: S(21), bold: true, color: NAVY })],
});
const bullet = (runs) => new Paragraph({ numbering: { reference: 'b', level: 0 }, spacing: { before: 0, after: 20 }, children: Array.isArray(runs) ? runs : [runs] });
const code = (lines) => lines.map((l) => new Paragraph({ spacing: { before: 0, after: 0 }, children: [mono(l)] }));

const line = (c) => ({ style: BorderStyle.SINGLE, size: 4, color: c });
const boxBorders = { top: line(GREY), bottom: line(GREY), left: line(GREY), right: line(GREY) };
const noBorders = { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };

const cell = (children, width, o = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA },
  borders: boxBorders,
  margins: { top: 70, bottom: 70, left: 100, right: 100 },
  verticalAlign: VerticalAlign.TOP,
  ...o,
  children,
});
const tbl = (widths, rows, o = {}) => new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, rows, ...o });
const gap = (n = 60) => new Paragraph({ spacing: { before: 0, after: n }, children: [] });
const boxTitle = (t, colour = NAVY) => para([new TextRun({ text: t, font: BODY, size: S(18), bold: true, color: colour })], { spacing: { before: 0, after: 30 } });

/* ---------- title ---------- */
const title = new Paragraph({
  spacing: { before: 0, after: 20 },
  children: [
    new TextRun({ text: 'OCR A-Level Computer Science (H446)', font: BODY, size: 34, bold: true, color: NAVY }),
    new TextRun({ text: '   LMC Assembly Cheat Sheet', font: BODY, size: 34, bold: true, color: CRIMSON }),
  ],
});
const subtitle = new Paragraph({
  spacing: { before: 0, after: 80 },
  border: { bottom: { style: BorderStyle.DOTTED, size: 8, color: NAVY, space: 3 } },
  children: [run('Little Man Computer = OCR’s assembly language.  100 mailboxes (00–99) of 3-digit numbers (000–999).  One accumulator.', { color: '444444', italics: true })],
});

/* ---------- machine + syntax boxes ---------- */
const machine = cell([
  boxTitle('The machine'),
  bullet([run('ACC', { bold: true }), run(' accumulator – the only general register; all arithmetic happens here')]),
  bullet([run('PC', { bold: true }), run(' program counter – address of the next instruction (starts at 00)')]),
  bullet([run('MAR / MDR / CIR', { bold: true }), run(' – address reg. / data reg. / current instruction reg.')]),
  bullet([run('Instructions and data are both just numbers in mailboxes', { bold: true }), run(' (stored-program concept)')]),
  bullet([run('Machine code: ', { bold: true }), run('hundreds digit = opcode, last two digits = mailbox address  (e.g. '), mono('306'), run(' = '), mono('STA 06'), run(')')]),
], 5233, { shading: { type: ShadingType.CLEAR, fill: TINT } });

const syntax = cell([
  boxTitle('Writing assembly'),
  ...code(['[label]  MNEMONIC  [operand]   // comment']),
  bullet([run('One instruction per line. Operand is a '), run('label', { bold: true }), run(' (or a mailbox number).')]),
  bullet([mono('name DAT'), run(' reserves a mailbox (starts at 0). '), mono('one DAT 1'), run(' starts at 1.')]),
  bullet([run('Code is placed from mailbox 00 in source order; '), mono('DAT'), run(' lines take a mailbox too.')]),
  bullet([run('Put every '), mono('DAT'), run(' AFTER '), mono('HLT'), run(' – otherwise the CPU executes it.', {}), ]),
  bullet([run('Assembled in two passes: (1) build the symbol table, (2) generate the code.')]),
], 5233, { shading: { type: ShadingType.CLEAR, fill: TINT } });

const twoBoxes = tbl([5233, 5233], [new TableRow({ children: [machine, syntax] })]);

/* ---------- instruction table ---------- */
const CW = [1000, 850, 4700, 3916];
const hdr = (t, w) => cell([para([new TextRun({ text: t, font: BODY, size: S(17), bold: true, color: 'FFFFFF' })], { spacing: { after: 0 } })], w, { shading: { type: ShadingType.CLEAR, fill: NAVY } });
const rows = [
  ['ADD', '1xx', 'Add the contents of mailbox xx to the accumulator', 'ACC ← ACC + [xx]'],
  ['SUB', '2xx', 'Subtract the contents of mailbox xx from the accumulator', 'ACC ← ACC − [xx]'],
  ['STA', '3xx', 'Store the accumulator in mailbox xx', '[xx] ← ACC'],
  ['LDA', '5xx', 'Load the contents of mailbox xx into the accumulator', 'ACC ← [xx]'],
  ['BRA', '6xx', 'Branch always: jump to xx', 'PC ← xx'],
  ['BRZ', '7xx', 'Branch to xx if the accumulator is zero', 'if ACC = 0  then  PC ← xx'],
  ['BRP', '8xx', 'Branch to xx if the accumulator is zero or positive', 'if ACC ≥ 0  then  PC ← xx'],
  ['INP', '901', 'Input a number into the accumulator', 'ACC ← input'],
  ['OUT', '902', 'Output the accumulator', 'output ← ACC'],
  ['HLT', '000', 'Stop the program  (COB is an alias in some simulators)', 'stop'],
  ['DAT', '–', 'Not an instruction. Reserves a labelled mailbox, with an optional starting value (default 0)', 'assembler only – no opcode'],
];
const instrRows = [
  new TableRow({ tableHeader: true, children: [hdr('Mnemonic', CW[0]), hdr('Opcode', CW[1]), hdr('What it does', CW[2]), hdr('Effect (register transfer)', CW[3])] }),
  ...rows.map((r, i) => {
    const fill = i % 2 ? ROWALT : 'FFFFFF';
    const sh = { type: ShadingType.CLEAR, fill };
    return new TableRow({
      cantSplit: true,
      children: [
        cell([para([mono(r[0], { bold: true, color: NAVY, size: S(18) })], { spacing: { after: 0 } })], CW[0], { shading: sh }),
        cell([para([mono(r[1])], { spacing: { after: 0 } })], CW[1], { shading: sh }),
        cell([para([run(r[2])], { spacing: { after: 0 } })], CW[2], { shading: sh }),
        cell([para([mono(r[3])], { spacing: { after: 0 } })], CW[3], { shading: sh }),
      ],
    });
  }),
];
const instrTable = tbl(CW, instrRows);

const remember = tbl([W], [new TableRow({ children: [cell([
  boxTitle('Remember', CRIMSON),
  bullet([mono('LDA 10', { bold: true }), run(' loads the '), run('contents of mailbox 10', { bold: true }), run(', not the number 10. To use a constant, give it a '), mono('DAT'), run(' (e.g. '), mono('one DAT 1'), run(' then '), mono('ADD one'), run(').')]),
  bullet([run('There is no compare instruction: subtract, then test.  '), run('Equal?', { bold: true }), run(' '), mono('SUB'), run(' then '), mono('BRZ'), run('.   '), run('Greater or equal?', { bold: true }), run(' '), mono('SUB'), run(' then '), mono('BRP'), run('.   There is no “branch if negative”: invert the test.')]),
  bullet([run('Opcode '), mono('4xx'), run(' is unused. '), mono('INP'), run(', '), mono('OUT'), run(', '), mono('HLT'), run(' take no operand. No multiply, divide, AND/OR or shifts: build them from the 11 above.')]),
], W, { shading: { type: ShadingType.CLEAR, fill: ROSE }, borders: { ...boxBorders, left: { style: BorderStyle.SINGLE, size: 24, color: CRIMSON } } })] })]);

/* ---------- page 2: FDE ---------- */
const fetchBox = cell([
  boxTitle('Fetch (every instruction)'),
  ...code(['MAR ← PC', 'PC  ← PC + 1', 'MDR ← [MAR]', 'CIR ← MDR']),
  para([run('Decode: ', { bold: true }), run('control unit splits CIR into opcode (first digit) and operand (last two).')], { spacing: { before: 60, after: 0 } }),
], 3700, { shading: { type: ShadingType.CLEAR, fill: TINT } });
const execBox = cell([
  boxTitle('Execute'),
  ...code([
    'LDA xx   MAR ← xx ; MDR ← [MAR] ; ACC ← MDR',
    'STA xx   MAR ← xx ; MDR ← ACC   ; [MAR] ← MDR',
    'ADD xx   MAR ← xx ; MDR ← [MAR] ; ACC ← ACC + MDR',
    'SUB xx   MAR ← xx ; MDR ← [MAR] ; ACC ← ACC − MDR',
    'BRA xx   PC ← xx',
    'BRZ xx   if ACC = 0  then PC ← xx',
    'BRP xx   if ACC ≥ 0  then PC ← xx',
    'INP      ACC ← input        OUT   output ← ACC',
  ]),
  para([run('A branch overwrites the PC after fetch has already incremented it.', { italics: true })], { spacing: { before: 40, after: 0 } }),
], 6766, { shading: { type: ShadingType.CLEAR, fill: TINT } });
const fde = tbl([3700, 6766], [new TableRow({ children: [fetchBox, execBox] })]);

/* ---------- program patterns ---------- */
const PW = [3488, 3488, 3490];
const p1 = cell([
  boxTitle('Sequence: add two numbers'),
  ...code(['Addr Code Source', '00   901  INP', '01   306  STA first', '02   901  INP', '03   106  ADD first', '04   902  OUT', '05   000  HLT', '06   000  first DAT']),
  para([run('Inputs 5, 3 give output 8.', { italics: true })], { spacing: { before: 30, after: 0 } }),
], PW[0]);
const p2 = cell([
  boxTitle('Selection: if a ≥ b'),
  ...code([
    '      LDA a',
    '      SUB b      // a - b',
    '      BRP athen  // a >= b',
    '      ...else...',
    '      BRA endif',
    'athen ...then...',
    'endif ...',
  ]),
], PW[1]);
const p3 = cell([
  boxTitle('Iteration'),
  ...code([
    '// while ACC <> 0',
    'loop  BRZ end',
    '      ...body...',
    '      SUB one',
    '      BRA loop',
    'end   HLT',
    'one   DAT 1',
  ]),
  para([run('Sentinel loop: ', { bold: true }), mono('INP'), run(', '), mono('BRZ finish'), run(', body, '), mono('BRA loop')], { spacing: { before: 40, after: 0 } }),
], PW[2]);
const patterns = tbl(PW, [new TableRow({ children: [p1, p2, p3] })]);

/* ---------- mistakes + addressing modes ---------- */
const mistakes = cell([
  boxTitle('Top mistakes', CRIMSON),
  bullet([run('Treating '), mono('LDA 5'), run(' as “load the number 5”.')]),
  bullet([run('Placing '), mono('DAT'), run(' lines before or inside the code. '), mono('DAT 0'), run(' = '), mono('000'), run(' = '), mono('HLT'), run(', so the program stops at once.')]),
  bullet([run('Forgetting '), mono('HLT'), run(': the CPU runs on into the data and executes it.')]),
  bullet([run('Forgetting '), mono('BRA loop'), run(' at the bottom of a loop.')]),
  bullet([run('Branching on stale ACC: '), mono('BRZ'), run('/'), mono('BRP'), run(' test the ACC '), run('now', { italics: true }), run('. Check what it holds.')]),
  bullet([run('Using a mnemonic (or a repeated name) as a label.')]),
  bullet([run('Mixing up OCR (LMC) with AQA’s ARM-style assembly.')]),
], 4900, { shading: { type: ShadingType.CLEAR, fill: 'FFFFFF' } });

const AW = [1000, 2000, 2566];
const ahdr = (t, w) => cell([para([new TextRun({ text: t, font: BODY, size: S(16), bold: true, color: 'FFFFFF' })], { spacing: { after: 0 } })], w, { shading: { type: ShadingType.CLEAR, fill: NAVY }, margins: { top: 30, bottom: 30, left: 70, right: 70 } });
const acell = (runs, w, fill) => cell([para(runs, { spacing: { after: 0 } })], w, { shading: { type: ShadingType.CLEAR, fill }, margins: { top: 30, bottom: 30, left: 70, right: 70 } });
const arow = (a, b, c, i) => new TableRow({ children: [acell([run(a, { bold: true, size: S(16) })], AW[0], i % 2 ? ROWALT : 'FFFFFF'), acell([run(b, { size: S(16) })], AW[1], i % 2 ? ROWALT : 'FFFFFF'), acell([run(c, { size: S(16) })], AW[2], i % 2 ? ROWALT : 'FFFFFF')] });
const addr = cell([
  boxTitle('Addressing modes (spec concept)'),
  para([run('Example memory: [5] = 12, [12] = 99, [7] = 40, index register IX = 2', { size: S(16), italics: true })], { spacing: { after: 30 } }),
  tbl(AW, [
    new TableRow({ tableHeader: true, children: [ahdr('Mode', AW[0]), ahdr('Operand is…', AW[1]), ahdr('LDA 5 gives…', AW[2])] }),
    arow('Immediate', 'the value itself', '5', 0),
    arow('Direct', 'the address of the value', '[5] = 12', 1),
    arow('Indirect', 'the address of the address', '[[5]] = [12] = 99', 2),
    arow('Indexed', 'a base address; add the index register', '[5 + IX] = [7] = 40', 3),
  ]),
  para([run('The LMC itself only has ', { size: S(16) }), run('direct', { size: S(16), bold: true }), run(' addressing. Indexed access can be imitated by adding 1 to an instruction word (self-modifying code).', { size: S(16) })], { spacing: { before: 40, after: 0 } }),
], 5566, { shading: { type: ShadingType.CLEAR, fill: TINT } });
const lower = tbl([4900, 5566], [new TableRow({ children: [mistakes, addr] })]);

const footer = new Paragraph({
  spacing: { before: 80, after: 0 },
  children: [run('OCR H446 uses the LMC as its assembly language; AQA uses a different instruction set. Always check against the current specification and past papers.', { size: S(14), color: '666666', italics: true })],
});

const doc = new Document({
  creator: 'Cheat sheet',
  title: 'OCR A-Level LMC Assembly Cheat Sheet',
  numbering: { config: [{ reference: 'b', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 240, hanging: 180 } } } }] }] },
  styles: { default: { document: { run: { font: BODY, size: S(17) } } } },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 620, bottom: 560, left: 720, right: 720 } } },
    children: [
      title, subtitle,
      twoBoxes, gap(50),
      heading('The 11 instructions'),
      instrTable, gap(60),
      remember,
      new Paragraph({ children: [new PageBreak()] }),
      heading('Fetch–decode–execute in the LMC'),
      fde, gap(40),
      heading('Program patterns'),
      patterns, gap(40),
      heading('Pitfalls and addressing modes'),
      lower,
      footer,
    ],
  }],
});

Packer.toBuffer(doc).then((b) => { fs.writeFileSync(process.argv[2], b); console.log('wrote', process.argv[2]); });
