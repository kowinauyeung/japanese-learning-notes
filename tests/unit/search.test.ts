import { describe, expect, it } from 'vitest';
import { normalizeSearchText, searchMatchRanges } from '@/lib/search';

describe('kana-insensitive search', () => {
  it.each([
    ['ガリレオ', 'がりれお'],
    ['ねんがん', 'ねんがん'],
    ['ヴァイオリン', 'ゔぁいおりん'],
    ['スーパー', 'すーぱー'],
  ])('normalizes %s to %s', (text, expected) => {
    expect(normalizeSearchText(text)).toBe(expected);
  });

  it.each(['が', 'ガ', '  ガ  '])('finds both scripts with %s', (query) => {
    expect(searchMatchRanges('ガリレオ・ねんがん', query)).toEqual([
      { start: 0, end: 1 },
      { start: 7, end: 8 },
    ]);
  });

  it('preserves offsets after lowercase expansion and surrogate pairs', () => {
    const text = 'İ😀ガリレオ';
    const ranges = searchMatchRanges(text, 'が');
    expect(ranges.map(({ start, end }) => text.slice(start, end))).toEqual(['ガ']);
    expect(searchMatchRanges(text, 'i')).toEqual([{ start: 0, end: 1 }]);
  });

  it.each(['', '   ', 'か', '[live]'])('does not invent a match for %j', (query) => {
    expect(searchMatchRanges('ガリレオ', query)).toEqual([]);
  });
});
