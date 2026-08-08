import { describe, expect, it } from 'vitest';
import { segmentFurigana } from '@/lib/furigana';

/**
 * Entries store one whole-word reading, so the okurigana has to be used as
 * anchors to cut it up and put each annotation over the characters it belongs
 * to. The two properties that matter are: nothing is invented, and nothing is
 * lost — bases always rebuild the headword exactly.
 */

const bases = (headword: string, reading: string) =>
  segmentFurigana(headword, reading)
    .map((segment) => segment.base)
    .join('');

describe('segmentFurigana — alignment', () => {
  it('pins each kanji to its own reading using the okurigana between them', () => {
    // り and け appear in both strings, which is what fixes 切→き and 分→わ.
    expect(segmentFurigana('切り分け', 'きりわけ')).toEqual([
      { base: '切', rt: 'き' },
      { base: 'り', rt: '' },
      { base: '分', rt: 'わ' },
      { base: 'け', rt: '' },
    ]);
  });

  /**
   * Adjacent kanji have no anchor between them, and splitting 兆候 into
   * ちょう/こう would need a dictionary. Keeping the run together is less
   * precise but never wrong.
   */
  it('keeps a run of adjacent kanji under one annotation', () => {
    expect(segmentFurigana('兆候', 'ちょうこう')).toEqual([{ base: '兆候', rt: 'ちょうこう' }]);
  });

  it('handles kana at the start and in the middle', () => {
    expect(segmentFurigana('お食事', 'おしょくじ')).toEqual([
      { base: 'お', rt: '' },
      { base: '食事', rt: 'しょくじ' },
    ]);
    expect(segmentFurigana('食べ物', 'たべもの')).toEqual([
      { base: '食', rt: 'た' },
      { base: 'べ', rt: '' },
      { base: '物', rt: 'もの' },
    ]);
  });

  it('treats 々 as a kanji needing annotation', () => {
    expect(segmentFurigana('人々', 'ひとびと')).toEqual([{ base: '人々', rt: 'ひとびと' }]);
  });
});

describe('segmentFurigana — nothing to annotate', () => {
  it.each([
    ['no reading at all', 'ひらがな', ''],
    ['a reading identical to the headword', 'メロい', 'メロい'],
    ['a headword with no kanji in it', 'ちょっと', 'ちょっと'],
    ['a katakana loanword', 'ハラスメント', 'はらすめんと'],
  ])('returns one unannotated segment for %s', (_case, headword, reading) => {
    expect(segmentFurigana(headword, reading)).toEqual([{ base: headword, rt: '' }]);
  });
});

describe('segmentFurigana — fallback', () => {
  /**
   * Anything that fails to line up falls back to one annotation over the whole
   * word. Less precise, still correct — and far better than dropping a reading
   * or attaching it to the wrong character.
   */
  it('annotates the whole word when the okurigana anchors do not match', () => {
    expect(segmentFurigana('切り分け', 'せつぶん')).toEqual([{ base: '切り分け', rt: 'せつぶん' }]);
  });

  it('annotates the whole word when the reading is shorter than the anchors need', () => {
    expect(segmentFurigana('食べ物', 'た')).toEqual([{ base: '食べ物', rt: 'た' }]);
  });

  /** Regex metacharacters in the kana runs must be escaped, not interpreted. */
  it('does not let punctuation in the headword be read as a pattern', () => {
    expect(() => segmentFurigana('切(り)分け', 'きりわけ')).not.toThrow();
    expect(bases('切(り)分け', 'きりわけ')).toBe('切(り)分け');
  });
});

describe('segmentFurigana — reconstruction', () => {
  it.each([
    ['切り分け', 'きりわけ'],
    ['兆候', 'ちょうこう'],
    ['食べ物', 'たべもの'],
    ['お食事', 'おしょくじ'],
    ['メロい', ''],
    ['切り分け', 'せつぶん'],
    ['', ''],
  ])('rebuilds %o exactly from its segment bases', (headword, reading) => {
    expect(bases(headword, reading)).toBe(headword);
  });

  /**
   * The other half of losslessness: reading the annotations and the plain kana
   * left to right must give the reading back. This is what would break if a
   * lazy capture group ever swallowed or dropped a mora.
   */
  it.each([
    ['切り分け', 'きりわけ'],
    ['兆候', 'ちょうこう'],
    ['食べ物', 'たべもの'],
    ['お食事', 'おしょくじ'],
  ])('rebuilds the reading of %o from its annotations', (headword, reading) => {
    const rebuilt = segmentFurigana(headword, reading)
      .map((segment) => segment.rt || segment.base)
      .join('');
    expect(rebuilt).toBe(reading);
  });
});
