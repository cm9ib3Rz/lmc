import { describe, expect, it } from 'vitest';
import { parseDialect, parsePcIncrement } from './config';

describe('?pc= URL setting', () => {
  it('defaults to increment-last (OCR\'s order)', () => {
    expect(parsePcIncrement('')).toBe('late');
    expect(parsePcIncrement('?x=1')).toBe('late');
  });

  it('accepts before/after and the early/late synonyms', () => {
    expect(parsePcIncrement('?pc=before')).toBe('early');
    expect(parsePcIncrement('?pc=early')).toBe('early');
    expect(parsePcIncrement('?pc=after')).toBe('late');
    expect(parsePcIncrement('?pc=late')).toBe('late');
  });

  it('ignores case and other parameters, and falls back for unknown values', () => {
    expect(parsePcIncrement('?a=b&pc=AFTER')).toBe('late');
    expect(parsePcIncrement('?pc=%20After%20')).toBe('late');
    expect(parsePcIncrement('?pc=sideways')).toBe('late');
    expect(parsePcIncrement('?pc=')).toBe('late');
    expect(parsePcIncrement('?pc=BEFORE')).toBe('early');
  });
});

describe('?lmc= URL setting', () => {
  it('defaults to the standard LMC', () => {
    expect(parseDialect('')).toBe('standard');
    expect(parseDialect('?pc=after')).toBe('standard');
    expect(parseDialect('?lmc=standard')).toBe('standard');
    expect(parseDialect('?lmc=pimped')).toBe('standard');
    expect(parseDialect('?lmc=')).toBe('standard');
  });

  it('turns on the extended LMC with extended (or x), ignoring case', () => {
    expect(parseDialect('?lmc=extended')).toBe('extended');
    expect(parseDialect('?lmc=EXTENDED')).toBe('extended');
    expect(parseDialect('?lmc=x')).toBe('extended');
  });

  it('combines with the other settings', () => {
    expect(parseDialect('?pc=after&lmc=extended')).toBe('extended');
    expect(parsePcIncrement('?pc=after&lmc=extended')).toBe('late');
  });
});
