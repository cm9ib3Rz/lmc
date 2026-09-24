import { describe, expect, it } from 'vitest';
import { explainWord } from './explain';

const labelAt = (a: number) => ({ 6: 'first', 1: 'loop', 21: 'data' })[a];
const roles = (e: ReturnType<typeof explainWord>) => e.digits?.map((d) => `${d.digit}:${d.role}`);

describe('explainWord (standard LMC)', () => {
  it('splits an instruction into opcode and operand, and never mentions addressing modes', () => {
    const memory = new Array(100).fill(0);
    memory[6] = 5;
    const e = explainWord(506, { labelAt, memory });
    expect(e).toMatchObject({ kind: 'instruction', word: '506', title: 'LDA first', effect: 'ACC ← [06]' });
    expect(roles(e)).toEqual(['5:opcode', '0:operand', '6:operand']);
    expect(e.opcode).toMatch(/^LDA: load/);
    expect(e.operand).toBe('mailbox 06 (first), which currently holds 5. LDA 06 uses what is stored there, not the number 6.');
    expect(e.mode).toBeUndefined();
    expect(JSON.stringify(e)).not.toMatch(/mode|addressing|immediate|indirect|indexed/i);
  });

  it('explains stores, arithmetic and branches', () => {
    expect(explainWord(306).effect).toBe('[06] ← ACC');
    expect(explainWord(106).effect).toBe('ACC ← ACC + [06]');
    expect(explainWord(206).effect).toBe('ACC ← ACC − [06]');
    const bra = explainWord(601, { labelAt });
    expect(bra.effect).toBe('PC ← 01');
    expect(bra.operand).toBe('mailbox 01 (loop), the address of the next instruction to run');
    expect(explainWord(705).effect).toBe('if ACC = 0 then PC ← 05');
    expect(explainWord(805).effect).toBe('if ACC ≥ 0 then PC ← 05');
  });

  it('explains the instructions with no operand', () => {
    const inp = explainWord(901);
    expect(inp).toMatchObject({ title: 'INP', effect: 'ACC ← input' });
    expect(roles(inp)).toEqual(['9:opcode', '0:operand', '1:operand']);
    expect(inp.operand).toMatch(/not an address/);
    expect(explainWord(902)).toMatchObject({ title: 'OUT', effect: 'output ← ACC' });
    expect(explainWord(0)).toMatchObject({ title: 'HLT', effect: 'stop' });
  });

  it('describes DAT data, including what it would be if executed', () => {
    expect(explainWord(5, { isData: true })).toMatchObject({ kind: 'data', title: 'Data: 5' });
    expect(explainWord(5, { isData: true }).note).toMatch(/not a valid instruction/);
    expect(explainWord(506, { isData: true }).note).toMatch(/read as LDA 6/);
    expect(explainWord(0, { isData: true }).note).toMatch(/read as HLT/);
    expect(explainWord(-7, { isData: true }).title).toBe('Data: -7');
  });

  it('describes empty and illegal mailboxes', () => {
    expect(explainWord(0, { isEmpty: true }).kind).toBe('empty');
    const bad = explainWord(410);
    expect(bad.kind).toBe('illegal');
    expect(roles(bad)).toEqual(['4:opcode', '1:operand', '0:operand']);
    expect(explainWord(903).kind).toBe('illegal');
    expect(explainWord(1200).note).toMatch(/outside/);
  });

  it('does not reveal the undocumented instruction', () => {
    const e = explainWord(999);
    expect(e.kind).toBe('other');
    expect(JSON.stringify(e)).not.toMatch(/HCF|fire|catch/i);
    expect(JSON.stringify(explainWord(999, { dialect: 'extended' }))).not.toMatch(/HCF|fire|catch/i);
  });
});

describe('explainWord (extended LMC)', () => {
  const memory = new Array(100).fill(0);
  memory[21] = 4;
  memory[5] = 12;

  it('splits an indexed instruction into opcode, mode and unused digits, and names the mode', () => {
    const e = explainWord(530, { dialect: 'extended', operandWord: 21, labelAt, memory, x: 2 });
    expect(e).toMatchObject({ kind: 'instruction', title: 'LDA data,X', effect: 'ACC ← [21 + X]' });
    expect(roles(e)).toEqual(['5:opcode', '3:mode', '0:spare']);
    expect(e.mode).toEqual({ name: 'Indexed (3)', text: 'the address of the data is the operand plus the index register X' });
    expect(e.operand).toMatch(/next mailbox holds 21 \(mailbox 21, data\)/);
    expect(e.operand).toMatch(/with X = 2 the address is 23/);
    expect(e.note).toMatch(/not part of the OCR specification/);
  });

  it('explains each mode of LDA', () => {
    const at = (word: number, operandWord: number) => explainWord(word, { dialect: 'extended', operandWord, memory });
    expect(at(510, 5)).toMatchObject({ title: 'LDA #5', effect: 'ACC ← 5' });
    expect(at(510, 5).mode!.name).toBe('Immediate (1)');
    expect(at(500, 5)).toMatchObject({ title: 'LDA 05', effect: 'ACC ← [05]' });
    expect(at(500, 5).operand).toMatch(/which holds 12/);
    expect(at(520, 5)).toMatchObject({ title: 'LDA (05)', effect: 'ACC ← [[05]]' });
    expect(at(520, 5).operand).toMatch(/a pointer to mailbox 12/);
    expect(at(310, 5).kind).toBe('illegal'); // STA has no immediate mode
  });

  it('explains the store, branch and index instructions', () => {
    const at = (word: number, operandWord: number) => explainWord(word, { dialect: 'extended', operandWord, memory });
    expect(at(300, 7).effect).toBe('[07] ← ACC');
    expect(at(330, 7).effect).toBe('[07 + X] ← ACC');
    expect(at(410, 0)).toMatchObject({ title: 'LDX #0', effect: 'X ← 0' });
    expect(at(600, 2).effect).toBe('PC ← 02');
    expect(at(700, 2).effect).toBe('if ACC = 0 then PC ← 02');
    expect(explainWord(903, { dialect: 'extended' })).toMatchObject({ title: 'INX', effect: 'X ← X + 1' });
    expect(explainWord(904, { dialect: 'extended' })).toMatchObject({ title: 'TXA', effect: 'ACC ← X' });
    expect(roles(explainWord(903, { dialect: 'extended' }))).toEqual(['9:opcode', '0:spare', '3:operand']);
    expect(explainWord(0, { dialect: 'extended' })).toMatchObject({ title: 'HLT', effect: 'stop' });
  });

  it('explains an operand word as part of the instruction before it', () => {
    const imm = explainWord(5, { dialect: 'extended', operandOf: { addr: 0, mnemonic: 'LDA', mode: 'immediate' } });
    expect(imm).toMatchObject({ kind: 'operand', title: 'Operand of LDA' });
    expect(imm.operand).toMatch(/5: the value itself/);
    const idx = explainWord(21, { dialect: 'extended', labelAt, operandOf: { addr: 2, mnemonic: 'LDA', mode: 'indexed' } });
    expect(idx.operand).toMatch(/21 \(data\): a mailbox address, because the instruction at mailbox 02 is indexed/);
    expect(idx.note).toMatch(/not executed as an instruction/);
  });

  it('describes invalid words and data in extended terms', () => {
    expect(explainWord(505, { dialect: 'extended' }).note).toMatch(/not a valid instruction in the extended LMC/);
    expect(explainWord(530, { dialect: 'extended', isData: true }).note).toMatch(/read as LDA/);
    expect(explainWord(0, { dialect: 'extended', isEmpty: true }).kind).toBe('empty');
  });
});
