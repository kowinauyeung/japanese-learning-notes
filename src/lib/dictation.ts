import type { Entry } from '@/domain/entry';

/**
 * Deciding whether a typed answer matches the word that was spoken.
 *
 * String-in, string-out and separate from the component, because this is where
 * a dictation drill is either fair or infuriating and the interesting cases —
 * an IME that produced half-width kana, a full-width space, katakana where the
 * note has hiragana — are all invisible on screen.
 */

/** U+30A1…U+30F6: the katakana that have a hiragana counterpart at −0x60. */
const KATAKANA = /[ァ-ヶ]/gu;

/**
 * Two normalisations, and both are load-bearing.
 *
 * **NFKC** because a Japanese IME hands back characters that look identical and
 * are not: half-width katakana (`ﾁｮｯﾄ`) and the ideographic space U+3000 that
 * every Japanese keyboard produces both fail a `===` against the same word
 * typed on a different keyboard.
 *
 * **Katakana folded to hiragana** because the learner is answering something
 * they *heard*. Script is not audible, so marking ちょっと wrong for a spoken
 * チョット is punishing them for information the drill never gave them. It does
 * cost the ability to drill 外来語 spelling; that is a separate exercise, and a
 * dictation that only accepts one script is not it.
 */
export function normaliseAnswer(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .replace(KATAKANA, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

/**
 * The forms that count as right: the written word and its kana reading.
 *
 * Empty ones are dropped, and that is the whole reason this is a function.
 * `reading` is empty for a headword that is already kana, so a list built
 * without this filter contains `''` — and `normaliseAnswer('')` is also `''`,
 * which makes submitting an empty box a correct answer on exactly the words
 * that need no reading.
 */
export function acceptedAnswers(entry: Pick<Entry, 'headword' | 'reading'>): string[] {
  return [entry.headword, entry.reading].map(normaliseAnswer).filter((form) => form !== '');
}

/**
 * What the speech engine is asked to say.
 *
 * The kana reading wins over the written form when there is one. A TTS voice
 * guesses the reading of a kanji compound from context it does not have here —
 * a single word with no sentence around it — and 「辛い」 read as からい when
 * the note says つらい makes the answer unmarkable. Handing it kana removes the
 * guess.
 */
export function spokenForm(entry: Pick<Entry, 'headword' | 'reading'>): string {
  return entry.reading || entry.headword;
}

/**
 * An empty submission is handled by `acceptedAnswers` alone, and deliberately
 * not guarded again here. A second `answer !== ''` check reads as prudence and
 * is unreachable — it was written, and no test could be made to fail on it,
 * which is the definition of a line that cannot be wrong and cannot be right.
 */
export function isCorrectAnswer(
  typed: string,
  entry: Pick<Entry, 'headword' | 'reading'>,
): boolean {
  return acceptedAnswers(entry).includes(normaliseAnswer(typed));
}
