import type { Dialect, PcIncrement } from './engine';

/**
 * URL settings for teachers. Nothing here appears in the UI.
 *
 *   ?pc=after    PC ← PC + 1 last, after CIR ← MDR (the default: OCR's 2015 delivery guide order)
 *   ?pc=before   PC ← PC + 1 straight after MAR ← PC (an order some textbooks use)
 *   ?lmc=extended   the extended LMC: addressing modes, an index register and two-word instructions.
 *                   NOT part of OCR's LMC; the standard LMC (direct addressing only) is the default.
 *
 * `early` and `late` are accepted as synonyms for `before` and `after`, and `x` for `extended`.
 * Anything else falls back to the default.
 */
export function parsePcIncrement(search: string): PcIncrement {
  const value = new URLSearchParams(search).get('pc')?.trim().toLowerCase();
  return value === 'before' || value === 'early' ? 'early' : 'late';
}

export function parseDialect(search: string): Dialect {
  const value = new URLSearchParams(search).get('lmc')?.trim().toLowerCase();
  return value === 'extended' || value === 'x' ? 'extended' : 'standard';
}
