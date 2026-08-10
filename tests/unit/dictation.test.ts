import { describe, expect, it } from 'vitest';
import { acceptedAnswers, isCorrectAnswer, normaliseAnswer, spokenForm } from '@/lib/dictation';

/**
 * Marking a typed answer. Every case here is one where the screen shows two
 * identical-looking strings and `===` disagrees, or where the drill would be
 * unfair for a reason the learner cannot see.
 */
describe('normaliseAnswer', () => {
  /**
   * Half-width katakana is what a Japanese keyboard produces in half-width
   * mode, and what several Windows IMEs still emit by default.
   */
  it('folds half-width katakana ﾁｮｯﾄ onto the same value as ちょっと', () => {
    expect(normaliseAnswer('ﾁｮｯﾄ')).toBe(normaliseAnswer('ちょっと'));
  });

  it('drops the ideographic space U+3000 that a Japanese keyboard produces', () => {
    expect(normaliseAnswer('兆　候')).toBe('兆候');
    expect(normaliseAnswer('  ちょうこう ')).toBe('ちょうこう');
  });

  it('folds katakana onto hiragana, because script is not audible', () => {
    expect(normaliseAnswer('チョット')).toBe('ちょっと');
    expect(normaliseAnswer('ヴァイオリン')).toBe('ゔぁいおりん');
  });

  /**
   * The prolonged sound mark and the middle dot have no hiragana counterpart at
   * −0x60, so a fold that walked the whole katakana block would map them into
   * unrelated characters and quietly break every 外来語.
   */
  it('leaves ー and ・ alone rather than shifting them out of the block', () => {
    expect(normaliseAnswer('コーヒー')).toBe('こーひー');
    expect(normaliseAnswer('ア・イ')).toBe('あ・い');
  });
});

describe('acceptedAnswers', () => {
  it('accepts the written form and the reading', () => {
    expect(acceptedAnswers({ headword: '兆候', reading: 'ちょうこう' })).toEqual([
      '兆候',
      'ちょうこう',
    ]);
  });

  /**
   * `reading` is empty whenever the headword is already kana. Leaving that
   * empty string in the list makes a blank submission match, because a blank
   * submission also normalises to the empty string.
   */
  it('drops the empty reading instead of accepting an empty answer', () => {
    expect(acceptedAnswers({ headword: 'ちょっと', reading: '' })).toEqual(['ちょっと']);
  });
});

describe('isCorrectAnswer', () => {
  const entry = { headword: '兆候', reading: 'ちょうこう' };

  it.each(['兆候', 'ちょうこう', 'チョウコウ', '　ちょうこう　'])('accepts %s', (typed) => {
    expect(isCorrectAnswer(typed, entry)).toBe(true);
  });

  it.each(['', '   ', 'ちょうこ', '徴候'])('rejects %o', (typed) => {
    expect(isCorrectAnswer(typed, entry)).toBe(false);
  });

  /** The defect `acceptedAnswers` exists to prevent, asserted end to end. */
  it('rejects an empty answer for a kana headword, which has no reading to fall back on', () => {
    expect(isCorrectAnswer('', { headword: 'ちょっと', reading: '' })).toBe(false);
  });
});

describe('spokenForm', () => {
  /**
   * A TTS voice reading 「辛い」 has no sentence to disambiguate from, so it
   * guesses — and a guess of からい makes つらい unanswerable.
   */
  it('speaks the kana reading rather than the kanji it could misread', () => {
    expect(spokenForm({ headword: '辛い', reading: 'つらい' })).toBe('つらい');
  });

  it('falls back to the headword when the word is already kana', () => {
    expect(spokenForm({ headword: 'ちょっと', reading: '' })).toBe('ちょっと');
  });
});
