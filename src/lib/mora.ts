import type { AccentPattern } from '@/domain/entry';

/**
 * Mora counting and pitch shape — the two things `pitchAccent` means nothing
 * without.
 *
 * `pitchAccent` is the mora the pitch drops *after*: 0 is 平板, 1 is 頭高, and
 * anything else drops mid-word. The number alone is not enough to draw or to
 * classify, because both depend on how many mora the reading has, and a mora is
 * not a character — きょ is one, きよ is two, and the difference decides where
 * the line breaks.
 */

/**
 * The small kana that fuse with the mora before them.
 *
 * っ, ん and ー are deliberately absent: each is its own mora despite being
 * written small or short, which is exactly the mistake counting characters
 * makes in the other direction.
 */
const YOON = new Set('ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ');

/** Split kana into mora. Anything not kana is left as one mora per character. */
export function splitMora(kana: string): string[] {
  const mora: string[] = [];
  // Iterating the string, not indexing it, so a surrogate pair stays whole.
  for (const char of kana) {
    const last = mora.at(-1);
    if (last !== undefined && YOON.has(char)) mora[mora.length - 1] = last + char;
    else mora.push(char);
  }
  return mora;
}

export function moraCount(kana: string): number {
  return splitMora(kana).length;
}

/**
 * Name the accent class, or `null` when the number cannot describe this word.
 *
 * A drop after mora 4 of a three-mora word is not a class, it is a typo, and
 * naming it 中高 would be inventing a fact. The caller decides what to do with
 * `null`: the form says so, the detail page draws nothing.
 */
export function accentPattern(pitchAccent: number, mora: number): AccentPattern | null {
  if (!Number.isInteger(pitchAccent) || pitchAccent < 0) return null;
  if (mora <= 0 || pitchAccent > mora) return null;
  if (pitchAccent === 0) return '平板';
  // Order matters for a one-mora word, where 1 is both the first mora and the
  // last: dictionaries call it 頭高, so that test comes first.
  if (pitchAccent === 1) return '頭高';
  if (pitchAccent === mora) return '尾高';
  return '中高';
}

export interface MoraPitch {
  mora: string;
  /** Whether this mora is in the high register. */
  high: boolean;
  /** Whether the pitch falls immediately after this mora. */
  drop: boolean;
}

/**
 * The high/low shape a dictionary draws as a line over the kana.
 *
 * Japanese pitch has one rule that produces all four classes: the first two
 * mora always differ. So 平板 starts low and stays high; 頭高 starts high and
 * drops at once; everything else starts low, rises, and drops after mora `n`.
 *
 * 尾高 gets a drop mark on its last mora even though nothing inside the word
 * sounds different from 平板 — the fall lands on the particle that follows, and
 * omitting the mark would render the two classes identically.
 *
 * Returns `[]` when the number does not fit the reading, so a bad value draws
 * nothing rather than drawing a lie. See `accentPattern`.
 */
export function pitchShape(kana: string, pitchAccent: number): MoraPitch[] {
  const mora = splitMora(kana);
  if (accentPattern(pitchAccent, mora.length) === null) return [];

  return mora.map((text, index) => ({
    mora: text,
    // The first two mora always differ, which is why mora 0 is excluded here
    // and is the only high one in 頭高.
    high:
      pitchAccent === 0
        ? index > 0
        : pitchAccent === 1
          ? index === 0
          : index >= 1 && index < pitchAccent,
    drop: pitchAccent > 0 && index === pitchAccent - 1,
  }));
}

/** `2（中高）`, the way a dictionary prints it. Empty when the value does not fit. */
export function accentLabel(pitchAccent: number, kana: string): string {
  const pattern = accentPattern(pitchAccent, moraCount(kana));
  return pattern === null ? '' : `${pitchAccent}（${pattern}）`;
}
