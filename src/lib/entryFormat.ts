/**
 * Two ways the notes have always been written, kept out of the components that
 * render them so the page and the dialog cannot disagree about either.
 */

/** ①②③… for sense and example numbering, matching the notes. */
export function circled(index: number): string {
  return index < 20 ? String.fromCharCode(0x2460 + index) : `${index + 1}`;
}

/** 1 (rare) – 5 (everyday), as ★×freq + ☆×(5−freq). */
export function stars(freq: number): string {
  return '★'.repeat(freq) + '☆'.repeat(Math.max(0, 5 - freq));
}
