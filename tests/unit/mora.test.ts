import { describe, expect, it } from 'vitest';
import {
  accentKana,
  accentProblem,
  accentLabel,
  accentPattern,
  moraCount,
  pitchShape,
  splitMora,
} from '@/lib/mora';

/**
 * A mora is not a character, and every rule below exists because counting
 * characters gets a real word wrong. The accent field bounds itself on this
 * count and the detail page draws one mark per mora, so an off-by-one here is
 * an accent drawn over the wrong syllable.
 */
describe('splitMora', () => {
  it('fuses ょ into the mora before it, so きょ is one beat and きよ is two', () => {
    expect(splitMora('きょう')).toEqual(['きょ', 'う']);
    expect(splitMora('きよう')).toEqual(['き', 'よ', 'う']);
  });

  it('counts っ, ん and ー as their own mora despite being written small or short', () => {
    expect(splitMora('がっこう')).toEqual(['が', 'っ', 'こ', 'う']);
    expect(splitMora('にほん')).toEqual(['に', 'ほ', 'ん']);
    expect(splitMora('コーヒー')).toEqual(['コ', 'ー', 'ヒ', 'ー']);
  });

  it('fuses katakana yōon too, since readings and loanwords are not all hiragana', () => {
    expect(splitMora('ニュース')).toEqual(['ニュ', 'ー', 'ス']);
  });

  it('leaves a leading small kana alone rather than fusing it into nothing', () => {
    expect(splitMora('ゃ')).toEqual(['ゃ']);
    expect(splitMora('')).toEqual([]);
  });
});

/**
 * The class is derived, never stored. Getting 尾高 wrong is the interesting
 * case: it sounds identical to 平板 inside the word and is told apart only by
 * the mora count, which is exactly the input a caller is tempted to omit.
 */
describe('accentPattern', () => {
  it('names the four classes', () => {
    expect(accentPattern(0, 3)).toBe('平板'); // さくら
    expect(accentPattern(1, 3)).toBe('頭高'); // いのち
    expect(accentPattern(2, 3)).toBe('中高'); // たまご
    expect(accentPattern(3, 3)).toBe('尾高'); // おとこ
  });

  it('calls 1 on a one-mora word 頭高, not 尾高, the way a dictionary does', () => {
    expect(accentPattern(1, 1)).toBe('頭高');
  });

  it('refuses a drop past the end of the word instead of inventing 中高', () => {
    expect(accentPattern(4, 3)).toBeNull();
  });

  it('refuses the values the sanitiser used to let through', () => {
    expect(accentPattern(Number.NaN, 3)).toBeNull();
    expect(accentPattern(Number.POSITIVE_INFINITY, 3)).toBeNull();
    expect(accentPattern(-1, 3)).toBeNull();
    expect(accentPattern(2.5, 3)).toBeNull();
  });

  it('refuses any accent on an empty reading, which has no mora to drop after', () => {
    expect(accentPattern(0, 0)).toBeNull();
  });
});

/**
 * The shape a dictionary draws. The rule producing all of it is that the first
 * two mora always differ — so mora 0 is low in every class except 頭高, and a
 * shape that starts high anywhere else is drawn an octave wrong.
 */
describe('pitchShape', () => {
  const registers = (kana: string, accent: number) =>
    pitchShape(kana, accent)
      .map((mora) => (mora.high ? 'H' : 'L') + (mora.drop ? '↓' : ''))
      .join(' ');

  it('starts 平板 low and never drops', () => {
    expect(registers('さくら', 0)).toBe('L H H');
  });

  it('starts 頭高 high and drops at once', () => {
    expect(registers('いのち', 1)).toBe('H↓ L L');
  });

  it('rises then drops after the named mora for 中高', () => {
    expect(registers('たまご', 2)).toBe('L H↓ L');
  });

  /**
   * 尾高 looks identical to 平板 across the word itself — the fall lands on the
   * particle after it. Without the mark on the last mora the two classes render
   * the same, and the one distinction the notation exists to carry is lost.
   */
  it('marks the fall on the last mora of 尾高, where nothing else shows it', () => {
    expect(registers('おとこ', 3)).toBe('L H H↓');
    expect(registers('さくら', 0)).toBe('L H H');
  });

  it('counts by mora, not by character, when placing the drop', () => {
    // びょういん is four mora (びょ/う/い/ん); the drop after mora 1 belongs on
    // びょ, which is two characters wide.
    expect(pitchShape('びょういん', 1)[0]).toEqual({ mora: 'びょ', high: true, drop: true });
  });

  it('draws nothing at all rather than a lie when the number does not fit', () => {
    expect(pitchShape('たまご', 9)).toEqual([]);
    expect(pitchShape('たまご', Number.NaN)).toEqual([]);
  });
});

describe('accentLabel', () => {
  it('prints the number with its class, the way a dictionary does', () => {
    expect(accentLabel(2, 'たまご')).toBe('2（中高）');
    expect(accentLabel(0, 'さくら')).toBe('0（平板）');
  });

  it('is empty when the value does not fit, so nothing claims a class', () => {
    expect(accentLabel(9, 'たまご')).toBe('');
  });
});

describe('moraCount', () => {
  it('bounds the accent field by beats rather than characters', () => {
    expect(moraCount('きょう')).toBe(2);
    expect(moraCount('がっこう')).toBe(4);
  });
});

/**
 * `reading || headword` was the fallback at all three call sites, and it is
 * wrong wherever the convention it rests on is not enforced — which is
 * everywhere, since 読み方 is optional in both entry forms.
 */
describe('accentKana', () => {
  it('uses the reading when there is one', () => {
    expect(accentKana('兆候', 'ちょうこう')).toBe('ちょうこう');
  });

  it('falls back to a headword that is already kana, which is why reading is blank', () => {
    expect(accentKana('ちょっと', '')).toBe('ちょっと');
    expect(accentKana('コンシェルジュ', '')).toBe('コンシェルジュ');
    expect(accentKana('コーヒー', '')).toBe('コーヒー');
  });

  /**
   * The case the naive fallback got wrong. `splitMora` gives one mora per
   * character for anything that is not kana, so 兆候 measured 2 where ちょうこう
   * is 4: the form refused the real accent 3, and the detail page drew a pitch
   * line over kanji — the lie `pitchShape` exists to refuse.
   */
  it('refuses a kanji headword with no reading, rather than counting characters', () => {
    expect(accentKana('兆候', '')).toBe('');
    expect(accentKana('学校', '')).toBe('');
    expect(moraCount(accentKana('兆候', ''))).toBe(0);
    expect(pitchShape(accentKana('学校', ''), 0)).toEqual([]);
  });

  it('refuses a mixed headword, where only part of it is kana', () => {
    expect(accentKana('小ネタ', '')).toBe('');
    expect(accentKana('メロい', '')).toBe('メロい');
  });
});

/**
 * The sentence shown when a value is refused. It lives beside the rule rather
 * than in the field, because the save gate needs the same words and `lib` cannot
 * import from a component — which is how the field and the footer came to answer
 * the same rejection differently.
 */
describe('accentProblem', () => {
  it('says nothing when the value fits', () => {
    expect(accentProblem(0, 'たまご')).toBeNull();
    expect(accentProblem(3, 'たまご')).toBeNull();
  });

  /**
   * The point of splitting it. All three used to answer with the mora count,
   * so `2.5` against たまご was told "たまご は3拍です" — true, and not the
   * problem.
   */
  it('names the reason rather than the mora count', () => {
    expect(accentProblem(2.5, 'たまご')).toContain('整数');
    expect(accentProblem(-1, 'たまご')).toContain('0（平板）以上');
    expect(accentProblem(9, 'たまご')).toBe('たまご は3拍です。');
    expect(accentProblem(0, '')).toContain('読み方');
  });
});
