import { describe, expect, it } from 'vitest';
import { examplesFor } from './examples';

const EXTENDED_SYNTAX = /\bLDX\b|\bINX\b|\bTXA\b|#\d|\(\w+\)|,\s*X\b/i;

describe('examplesFor', () => {
  it('the standard list has no extended samples and no extended syntax', async () => {
    const list = await examplesFor('standard');
    expect(list.length).toBeGreaterThan(8);
    for (const ex of list) {
      expect(ex.id, ex.id).not.toMatch(/-x\.lmc$/);
      // strip comments: the samples' own explanations may use ordinary words such as "index"
      const code = ex.source.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
      expect(code, ex.id).not.toMatch(EXTENDED_SYNTAX);
    }
    expect(list.map((e) => e.id)).toContain('sieve.lmc');
    expect(list.map((e) => e.id)).toContain('array-sum-indexed.lmc');
  });

  it('the extended list adds the extended samples and drops the self-modifying ones', async () => {
    const list = await examplesFor('extended');
    const ids = list.map((e) => e.id);
    for (const id of ['countdown-x.lmc', 'fibonacci-x.lmc', 'reverse-x.lmc', 'bubble-sort-x.lmc', 'sieve-x.lmc', 'pointer-x.lmc', 'linked-list-x.lmc']) {
      expect(ids, id).toContain(id);
    }
    expect(ids).not.toContain('sieve.lmc');
    expect(ids).not.toContain('array-sum-indexed.lmc');
    expect(ids).toContain('add.lmc'); // the plain programs still work here
  });

  it('every sample comes with sample input, and the searches open on an interesting one', async () => {
    const list = await examplesFor('extended');
    const search = list.find((e) => e.id === 'linear-search-x.lmc')!;
    expect(search.inputs).toEqual([33]);
    expect(list.find((e) => e.id === 'bubble-sort-x.lmc')!.inputs).toHaveLength(6);
  });
});
