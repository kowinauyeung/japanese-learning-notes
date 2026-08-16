import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  fromSearchParams,
  isDefault,
  matches,
  MAX_FREQ,
  sortEntries,
  toSearchParams,
} from '@/lib/filters';
import type { Filters } from '@/lib/filters';
import { makeEntry } from '../fixtures/entry';

/**
 * Filters are driven entirely by the query string, which is user-editable, so
 * `fromSearchParams` is a trust boundary and not merely a parser. `minFreq` in
 * particular feeds `'★'.repeat()`, where a negative or fractional value throws
 * and takes the route down.
 */

const withFilters = (overrides: Partial<Filters>): Filters => ({ ...EMPTY_FILTERS, ...overrides });
const parse = (query: string) => fromSearchParams(new URLSearchParams(query));

describe('fromSearchParams — freq', () => {
  it.each(['-1', '0', 'abc', 'Infinity', '', ' '])(
    'treats the unusable freq=%o as no filter',
    (raw) => {
      expect(parse(`freq=${raw}`).minFreq).toBe(0);
    },
  );

  it('clamps a freq above the scale instead of passing it to ★.repeat', () => {
    expect(parse('freq=1000000000').minFreq).toBe(MAX_FREQ);
    expect(parse('freq=6').minFreq).toBe(MAX_FREQ);
  });

  it('keeps a freq inside the scale', () => {
    expect(parse('freq=3').minFreq).toBe(3);
  });

  /**
   * parseInt stops at the first character it cannot use, so `3x` reads as 3 and
   * `2.7` truncates to 2. Pinned rather than tightened, and deliberately
   * different from `sanitize.ts`, which rejects a fractional freq outright:
   * there the value is *stored* and reaches `'★'.repeat()`, where a fraction
   * throws. Here it is only ever compared as a threshold, so the truncated
   * integer is indistinguishable from the user having typed it.
   */
  it.each([
    ['3x', 3],
    ['2.7', 2],
    ['4.0', 4],
  ])('truncates the freq=%o that parseInt can partially read, to %i', (raw, expected) => {
    expect(parse(`freq=${raw}`).minFreq).toBe(expected);
  });
});

describe('fromSearchParams — allowlists', () => {
  it('drops a pos, origin, style or sort that is not in the schema', () => {
    const filters = parse('pos=サ変動詞&origin=ラテン語&style=そこそこ&sort=random');
    expect(filters.pos).toBe('');
    expect(filters.origin).toBe('');
    expect(filters.style).toBe('');
    expect(filters.sort).toBe('new');
  });

  it('keeps recognised values', () => {
    const filters = parse('pos=名詞&origin=漢語&style=書き言葉&sort=headword');
    expect(filters).toMatchObject({
      pos: '名詞',
      origin: '漢語',
      style: '書き言葉',
      sort: 'headword',
    });
  });

  it('filters an unknown jlpt out of a multi-valued list, keeping the rest', () => {
    expect(parse('jlpt=N1&jlpt=N9&jlpt=N3').jlpt).toEqual(['N1', 'N3']);
  });

  /** Tags are user-created and have no allowlist; they pass through verbatim. */
  it('passes tags through unchanged', () => {
    expect(parse('tag=ニュース&tag=会議').tags).toEqual(['ニュース', '会議']);
  });

  it('returns the default filters for an empty query string', () => {
    expect(parse('')).toEqual(EMPTY_FILTERS);
    expect(isDefault(parse(''))).toBe(true);
  });
});

describe('URL round-trip', () => {
  it('restores every filter through serialise and parse', () => {
    const original = withFilters({
      q: '兆',
      tags: ['ニュース', '会議'],
      jlpt: ['N1', 'N2'],
      pos: '名詞',
      origin: '漢語',
      style: '書き言葉',
      minFreq: 4,
      from: '2026-01-01',
      to: '2026-12-31',
      sort: 'headword',
    });
    expect(fromSearchParams(toSearchParams(original))).toEqual(original);
  });

  /** The default sort is omitted from the URL, so a bare link stays clean. */
  it('omits defaults from the query string', () => {
    expect(toSearchParams(EMPTY_FILTERS).toString()).toBe('');
    expect(toSearchParams(withFilters({ sort: 'new' })).has('sort')).toBe(false);
    expect(toSearchParams(withFilters({ minFreq: 0 })).has('freq')).toBe(false);
  });

  it('survives a value that needs percent-encoding', () => {
    const original = withFilters({ q: 'a b&c=d', tags: ['日本語'] });
    expect(fromSearchParams(new URLSearchParams(toSearchParams(original).toString()))).toEqual(
      original,
    );
  });
});

describe('matches — search', () => {
  const entry = makeEntry({
    headword: '兆候',
    reading: 'ちょうこう',
    citationForm: '兆候',
    definition: '何かが起こる前ぶれ。',
    definitionSub: 'sign of something',
    tags: ['ニュース'],
    context: { original: '不況の兆候が見える', ja: '', translation: '' },
    senses: [
      {
        label: '前触れ',
        description: '',
        example: '',
        exampleGloss: '',
        translation: '',
        usage: '',
      },
    ],
    examples: [{ ja: '株価に兆候が出た', translation: 'the share price showed a sign' }],
    related: [{ headword: '前兆', note: '' }],
  });

  /**
   * Substring matching without a tokenizer is what makes searching Japanese
   * work: 兆 finds 兆候 because it is literally a substring, which a
   * word-boundary index would miss.
   */
  it('matches a substring rather than a whole word', () => {
    expect(matches(entry, withFilters({ q: '兆' }))).toBe(true);
  });

  it.each([
    ['headword', '兆候'],
    ['reading', 'ちょうこう'],
    ['tag', 'ニュース'],
    ['definition', '前ぶれ'],
    ['definitionSub', 'sign of'],
    ['context', '不況'],
    ['sense label', '前触れ'],
    ['example', '株価'],
    ['example translation', 'share price'],
    ['related headword', '前兆'],
  ])('searches the %s', (_field, query) => {
    expect(matches(entry, withFilters({ q: query }))).toBe(true);
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(matches(entry, withFilters({ q: '  SIGN OF  ' }))).toBe(true);
  });

  it('does not match text that is absent', () => {
    expect(matches(entry, withFilters({ q: '存在しない' }))).toBe(false);
  });

  /**
   * The haystack is memoised per Entry object. Entries are replaced rather than
   * mutated on every write, so a stale cache would need the same object to
   * change identity-free — but asserting it here pins the assumption.
   */
  it('reflects an edit made by replacing the entry object', () => {
    const edited = makeEntry({ ...entry, headword: '前兆' });
    expect(matches(edited, withFilters({ q: '前兆' }))).toBe(true);
  });
});

describe('matches — dimensions', () => {
  const entry = makeEntry({
    jlpt: 'N2',
    pos: ['名詞', '動詞'],
    origin: '漢語',
    style: '書き言葉',
    freq: 3,
    tags: ['ニュース', '会議'],
    learnedOn: '2026-06-24',
  });

  it('applies each dimension on its own', () => {
    expect(matches(entry, withFilters({ jlpt: ['N2'] }))).toBe(true);
    expect(matches(entry, withFilters({ jlpt: ['N1'] }))).toBe(false);
    expect(matches(entry, withFilters({ pos: '動詞' }))).toBe(true);
    expect(matches(entry, withFilters({ pos: '副詞' }))).toBe(false);
    expect(matches(entry, withFilters({ origin: '和語' }))).toBe(false);
    expect(matches(entry, withFilters({ style: '書き言葉' }))).toBe(true);
  });

  it('treats minFreq as a floor, and 0 as no filter', () => {
    expect(matches(entry, withFilters({ minFreq: 3 }))).toBe(true);
    expect(matches(entry, withFilters({ minFreq: 4 }))).toBe(false);
    expect(matches(makeEntry({ freq: 1 }), withFilters({ minFreq: 0 }))).toBe(true);
  });

  it('treats from and to as an inclusive range over learnedOn', () => {
    expect(matches(entry, withFilters({ from: '2026-06-24' }))).toBe(true);
    expect(matches(entry, withFilters({ from: '2026-06-25' }))).toBe(false);
    expect(matches(entry, withFilters({ to: '2026-06-24' }))).toBe(true);
    expect(matches(entry, withFilters({ to: '2026-06-23' }))).toBe(false);
  });

  /**
   * Chips within one filter are OR; separate filters are AND. An AND within a
   * dimension would return nothing, since a word has exactly one JLPT level.
   */
  it('ORs values inside one dimension', () => {
    expect(matches(entry, withFilters({ jlpt: ['N1', 'N2'] }))).toBe(true);
    expect(matches(entry, withFilters({ tags: ['存在しない', '会議'] }))).toBe(true);
    expect(matches(entry, withFilters({ tags: ['存在しない'] }))).toBe(false);
  });

  it('ANDs across dimensions', () => {
    expect(matches(entry, withFilters({ jlpt: ['N2'], origin: '漢語' }))).toBe(true);
    expect(matches(entry, withFilters({ jlpt: ['N2'], origin: '和語' }))).toBe(false);
  });

  it('matches everything when no filter is set', () => {
    expect(matches(entry, EMPTY_FILTERS)).toBe(true);
  });
});

describe('sortEntries', () => {
  const a = makeEntry({ id: 'a', headword: 'あいさつ', learnedOn: '2026-01-01' });
  const b = makeEntry({ id: 'b', headword: '兆候', learnedOn: '2026-06-24' });
  const c = makeEntry({ id: 'c', headword: 'ざつだん', learnedOn: '2026-03-15' });
  const input = [b, a, c];

  it('orders newest first by default', () => {
    expect(sortEntries(input, 'new').map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('orders oldest first', () => {
    expect(sortEntries(input, 'old').map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });

  it('orders by headword using Japanese collation', () => {
    expect(sortEntries(input, 'headword').map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });

  /** Same day, so only the id tiebreaker can decide — and it must be stable. */
  it('breaks a date tie by id, in the same direction as the sort', () => {
    const x = makeEntry({ id: 'x', learnedOn: '2026-06-24' });
    const y = makeEntry({ id: 'y', learnedOn: '2026-06-24' });
    expect(sortEntries([y, x], 'old').map((e) => e.id)).toEqual(['x', 'y']);
    expect(sortEntries([x, y], 'new').map((e) => e.id)).toEqual(['y', 'x']);
  });

  it('does not mutate the array it is given', () => {
    const original = [b, a, c];
    sortEntries(original, 'headword');
    expect(original.map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('isDefault', () => {
  it('ignores sort, which is always set', () => {
    expect(isDefault(withFilters({ sort: 'headword' }))).toBe(true);
  });

  it.each([
    ['q', { q: 'x' }],
    ['tags', { tags: ['x'] }],
    ['jlpt', { jlpt: ['N1'] }],
    ['pos', { pos: '名詞' }],
    ['minFreq', { minFreq: 1 }],
    ['from', { from: '2026-01-01' }],
  ])('reports not-default once %s is set', (_name, overrides) => {
    expect(isDefault(withFilters(overrides))).toBe(false);
  });
});
