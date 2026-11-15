import type { Entry } from '@/domain/entry';

/**
 * The note a related word already has in this notebook, if any.
 *
 * Matched on the headword exactly, after trimming both sides, because that is
 * the field a related word stores and the field the add form is prefilled
 * with: a word added from a 関連語 row matches that row on the next render, so
 * the row turns into 開く instead of offering the same word twice.
 */
export function findByHeadword(entries: readonly Entry[], headword: string): Entry | undefined {
  const wanted = headword.trim();
  if (!wanted) return undefined;
  return entries.find((entry) => entry.headword.trim() === wanted);
}
