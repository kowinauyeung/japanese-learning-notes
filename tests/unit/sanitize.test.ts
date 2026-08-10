import { describe, expect, it } from 'vitest';
import { toDraft } from '@/lib/draft';
import { isValidIsoDate, sanitizeDraft, sanitizeEntry, sanitizeProgressMap } from '@/lib/sanitize';
import { makeEntry } from '../fixtures/entry';

/**
 * `sanitize` is the boundary between the app and two untrusted sources:
 * assistant-written JSON pasted into the import box, and Firestore documents
 * that may predate the current schema. Its contract is total — every function
 * returns a usable value for any input — so these tests feed it the shapes that
 * have actually turned up rather than well-formed variations.
 *
 * Everything downstream (filters, cards, the dashboard, the detail page) reads
 * the same `Entry`, so one bad value here surfaces as a white screen somewhere
 * unrelated.
 */

/** Distinct from every default, so "fell back" and "kept the input" differ. */
const FALLBACK = toDraft(
  makeEntry({
    headword: 'fallback-headword',
    definition: 'fallback-definition',
    freq: 5,
    jlpt: 'N5',
    learnedOn: '2020-01-01',
  }),
);

describe('isValidIsoDate', () => {
  /**
   * The defect that opened the testing backlog. `new Date('2026-02-31')` does
   * not return NaN — it rolls the day forward to 2026-03-03 — so a NaN check
   * accepts a date that does not exist. Since `learnedOn` is stored and sorted
   * as a plain string, that impossible day would then filter and sort as if it
   * were real, and hand the dashboard an Invalid Date.
   */
  it.each(['2026-02-31', '2026-04-31', '2026-06-31', '2025-02-29'])(
    'rejects %s, which Date silently rolls forward instead of refusing',
    (value) => {
      expect(isValidIsoDate(value)).toBe(false);
    },
  );

  it('accepts a leap day in a year that has one', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
  });

  it.each(['2026-13-01', '2026-00-10', '2026-06-00', '2026-06-32'])(
    'rejects the out-of-range %s',
    (value) => {
      expect(isValidIsoDate(value)).toBe(false);
    },
  );

  it.each(['', '2026-6-24', '26-06-24', '2026/06/24', '2026-06-24T00:00:00Z', 'yesterday'])(
    'rejects the malformed %o',
    (value) => {
      expect(isValidIsoDate(value)).toBe(false);
    },
  );

  it.each([null, undefined, 20260624, [], {}, true])('rejects the non-string %o', (value) => {
    expect(isValidIsoDate(value)).toBe(false);
  });

  it('accepts a real day, and tolerates surrounding whitespace', () => {
    expect(isValidIsoDate('2026-06-24')).toBe(true);
    expect(isValidIsoDate('  2026-06-24  ')).toBe(true);
  });
});

describe('sanitizeDraft — arrays containing junk', () => {
  /** An assistant asked for a list it has nothing to put in emits `[null]`. */
  it('drops nulls inside senses rather than mapping over them', () => {
    const draft = sanitizeDraft({ senses: [null, { label: 'せいじゃく' }, undefined, 'x', 42] });
    expect(draft.senses).toHaveLength(1);
    expect(draft.senses[0]?.label).toBe('せいじゃく');
    // The surviving sense is filled out, not left partial.
    expect(draft.senses[0]?.description).toBe('');
  });

  it('drops nulls inside examples and related', () => {
    const draft = sanitizeDraft({
      examples: [null, { ja: '兆候が見える' }],
      related: [null, { headword: '前兆' }, null],
    });
    expect(draft.examples).toHaveLength(1);
    expect(draft.related).toHaveLength(1);
    expect(draft.related[0]?.note).toBe('');
  });

  it('returns an empty array when the field is not an array at all', () => {
    const draft = sanitizeDraft({ senses: 'ひとつ', examples: null, related: { headword: 'x' } });
    expect(draft.senses).toEqual([]);
    expect(draft.examples).toEqual([]);
    expect(draft.related).toEqual([]);
  });

  it('keeps only recognised parts of speech', () => {
    const draft = sanitizeDraft({ pos: ['名詞', 'サ変動詞', null, 42, '動詞'] });
    expect(draft.pos).toEqual(['名詞', '動詞']);
  });
});

describe('sanitizeDraft — enum fields', () => {
  it('falls back when jlpt is outside the scale', () => {
    expect(sanitizeDraft({ jlpt: 'N9' }, FALLBACK).jlpt).toBe('N5');
    expect(sanitizeDraft({ jlpt: 42 }, FALLBACK).jlpt).toBe('N5');
    expect(sanitizeDraft({ jlpt: 'N1' }, FALLBACK).jlpt).toBe('N1');
  });

  /** These three have no meaningful default, so an unknown value means "blank". */
  it('blanks origin, style and politeness when unrecognised', () => {
    const draft = sanitizeDraft({ origin: 'ラテン語', style: 'そこそこ', politeness: 'とても' });
    expect(draft.origin).toBe('');
    expect(draft.style).toBe('');
    expect(draft.politeness).toBe('');
  });
});

describe('sanitizeDraft — freq', () => {
  /**
   * `freq` reaches `'★'.repeat(freq)`, which throws on a negative or fractional
   * count and takes the whole route down with it. Only 1..5 may get through.
   */
  it.each([-1, 0, 6, 1e9, 2.7, Number.NaN, Number.POSITIVE_INFINITY, 'abc', null, {}])(
    'falls back for the unusable freq %o',
    (value) => {
      expect(sanitizeDraft({ freq: value }, FALLBACK).freq).toBe(5);
    },
  );

  it('accepts 1 through 5, including as a numeric string', () => {
    expect(sanitizeDraft({ freq: 1 }, FALLBACK).freq).toBe(1);
    expect(sanitizeDraft({ freq: 5 }, FALLBACK).freq).toBe(5);
    expect(sanitizeDraft({ freq: '3' }, FALLBACK).freq).toBe(3);
  });
});

describe('sanitizeDraft — objects that are not objects', () => {
  it.each([null, undefined, 'その文で', ['a'], 42])(
    'returns a blank context for the non-object %o',
    (value) => {
      expect(sanitizeDraft({ context: value }).context).toEqual({
        original: '',
        ja: '',
        translation: '',
      });
    },
  );

  it.each([null, 'いつでも', ['a'], 42])(
    'returns blank usage notes for the non-object %o',
    (value) => {
      expect(sanitizeDraft({ usage: value }).usage).toEqual({
        when: '',
        translation: '',
        caution: '',
      });
    },
  );

  it('coerces the whole input when it is not an object', () => {
    // Reaching this with a string or an array means the caller lost the
    // document; returning the fallback beats throwing inside a render.
    expect(sanitizeDraft('nonsense', FALLBACK).headword).toBe('fallback-headword');
    expect(sanitizeDraft(null, FALLBACK).headword).toBe('fallback-headword');
    expect(sanitizeDraft([1, 2], FALLBACK).headword).toBe('fallback-headword');
  });

  it('keeps posInfo null unless it is an object, and cleans its rows', () => {
    expect(sanitizeDraft({ posInfo: 'なし' }).posInfo).toEqual({ title: '', rows: [] });
    expect(sanitizeDraft({ posInfo: null }).posInfo).toBeNull();
    expect(
      sanitizeDraft({ posInfo: { title: '名詞情報', rows: [null, { label: '可算性' }] } }),
    ).toHaveProperty('posInfo.rows', [{ label: '可算性', value: '' }]);
  });
});

describe('sanitizeDraft — scalars', () => {
  it('renders a number as its string, rather than dropping the field', () => {
    expect(sanitizeDraft({ headword: 2026 }).headword).toBe('2026');
  });

  it('falls back for a headword that is blank or only whitespace', () => {
    expect(sanitizeDraft({ headword: '   ' }, FALLBACK).headword).toBe('fallback-headword');
    expect(sanitizeDraft({ definition: '' }, FALLBACK).definition).toBe('fallback-definition');
  });

  it('keeps pitchAccent only when it is a number, since 0 is meaningful', () => {
    expect(sanitizeDraft({ pitchAccent: 0 }).pitchAccent).toBe(0);
    expect(sanitizeDraft({ pitchAccent: '2' }).pitchAccent).toBeNull();
    expect(sanitizeDraft({ pitchAccent: null }).pitchAccent).toBeNull();
  });

  it('splits, strips and de-duplicates tags', () => {
    expect(sanitizeDraft({ tags: ['#ニュース', 'ビジネス 会議', null, 'ニュース'] }).tags).toEqual([
      'ニュース',
      'ビジネス',
      '会議',
    ]);
  });

  it('falls back for a learnedOn that is not a real calendar day', () => {
    expect(sanitizeDraft({ learnedOn: '2026-02-31' }, FALLBACK).learnedOn).toBe('2020-01-01');
    expect(sanitizeDraft({ learnedOn: '2026-06-24' }, FALLBACK).learnedOn).toBe('2026-06-24');
  });
});

describe('sanitizeEntry — bookkeeping and ownership', () => {
  it('takes the id from the caller and ownerUid from the document', () => {
    const entry = sanitizeEntry('doc-1', { ownerUid: 'uid-alice', headword: '清高' });
    expect(entry.id).toBe('doc-1');
    expect(entry.ownerUid).toBe('uid-alice');
  });

  it('blanks an ownerUid that is not a string rather than casting it through', () => {
    expect(sanitizeEntry('doc-1', { ownerUid: { uid: 'alice' } }).ownerUid).toBe('');
    expect(sanitizeEntry('doc-1', {}).ownerUid).toBe('');
  });

  it.each([-1, 2.5, 'many', null, Number.NaN])(
    'clamps the unusable publishedVersion %o to 0',
    (value) => {
      expect(sanitizeEntry('doc-1', { publishedVersion: value }).publishedVersion).toBe(0);
    },
  );

  it('keeps a real publishedVersion, including as a numeric string', () => {
    expect(sanitizeEntry('doc-1', { publishedVersion: 3 }).publishedVersion).toBe(3);
    expect(sanitizeEntry('doc-1', { publishedVersion: '3' }).publishedVersion).toBe(3);
  });

  it('normalises publishedId to null when absent', () => {
    expect(sanitizeEntry('doc-1', {}).publishedId).toBeNull();
    expect(sanitizeEntry('doc-1', { publishedId: 'pub-9' }).publishedId).toBe('pub-9');
  });

  /**
   * serverTimestamp() resolves asynchronously, so a document read back from the
   * local cache immediately after a write has null there. An empty string is
   * the honest answer; an Invalid Date rendered into the UI is not.
   */
  it('returns an empty string for a timestamp that has not resolved', () => {
    const entry = sanitizeEntry('doc-1', { createdAt: null, updatedAt: 'not a date' });
    expect(entry.createdAt).toBe('');
    expect(entry.updatedAt).toBe('');
  });

  it('normalises a resolved timestamp to ISO', () => {
    expect(sanitizeEntry('doc-1', { createdAt: '2026-06-24T09:00:00+09:00' }).createdAt).toBe(
      '2026-06-24T00:00:00.000Z',
    );
  });
});

describe('sanitizeEntry — copiedFrom is all or nothing', () => {
  /**
   * A half-populated attribution renders as an empty creator name beside a real
   * "copied from" label, which reads as a bug in someone else's account.
   */
  it('drops an attribution missing its nickname or its timestamp', () => {
    expect(
      sanitizeEntry('doc-1', {
        copiedFrom: { ownerNickname: '', copiedAt: '2026-06-24T00:00:00Z' },
      }).copiedFrom,
    ).toBeNull();
    expect(
      sanitizeEntry('doc-1', { copiedFrom: { ownerNickname: 'kowin', copiedAt: null } }).copiedFrom,
    ).toBeNull();
    expect(sanitizeEntry('doc-1', { copiedFrom: 'kowin' }).copiedFrom).toBeNull();
  });

  it('keeps a complete attribution and defaults sourceKind to entry', () => {
    const complete = sanitizeEntry('doc-1', {
      copiedFrom: { ownerNickname: 'kowin', copiedAt: '2026-06-24T09:00:00.000Z' },
    });
    expect(complete.copiedFrom).toEqual({
      ownerNickname: 'kowin',
      sourceKind: 'entry',
      copiedAt: '2026-06-24T09:00:00.000Z',
    });

    const fromSet = sanitizeEntry('doc-1', {
      copiedFrom: {
        ownerNickname: 'kowin',
        sourceKind: 'set',
        copiedAt: '2026-06-24T09:00:00.000Z',
      },
    });
    expect(fromSet.copiedFrom?.sourceKind).toBe('set');
  });
});

describe('sanitizeEntry — a document from the previous schema', () => {
  /**
   * Two Phase 1 renames and the ownership refactor mean stored documents can
   * disagree with the current shape in several ways at once. Reading one must
   * degrade field by field, never throw.
   */
  it('reads a pre-refactor document without throwing, dropping what no longer exists', () => {
    const legacy = {
      headword: '清高',
      reading: 'せいこう',
      definitionJa: '清らかで高い', // renamed to `definition`
      wordSets: ['set-1'], // moved to WordSet.entryIds
      jlpt: 'N2',
      freq: 3,
      learnedOn: '2025-11-02',
      // no ownerUid, no publication fields, no timestamps
    };

    const entry = sanitizeEntry('legacy-1', legacy);

    expect(entry.headword).toBe('清高');
    expect(entry.learnedOn).toBe('2025-11-02');
    // The renamed field is simply absent now; nothing pretends to recover it.
    expect(entry.definition).toBe('');
    expect(entry).not.toHaveProperty('wordSets');
    expect(entry.ownerUid).toBe('');
    expect(entry.publishedVersion).toBe(0);
    expect(entry.createdAt).toBe('');
  });

  it('survives a document that is empty, or not an object', () => {
    expect(() => sanitizeEntry('x', {})).not.toThrow();
    expect(() => sanitizeEntry('x', null)).not.toThrow();
    expect(sanitizeEntry('x', 'corrupt').headword).toBe('');
  });
});

/**
 * The progress map is a single document, so unlike an entry there is no "one
 * bad row, one bad card" containment: whatever this returns is every word's
 * practice state at once.
 */
describe('sanitizeProgressMap', () => {
  it('keeps the good rows when one key holds something unusable', () => {
    const rows = sanitizeProgressMap({
      good: { status: 'correct', lastMode: 'dictation', attempts: 2, correctCount: 2 },
      broken: 'not an object',
    });

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.entryId === 'good')).toMatchObject({
      status: 'correct',
      attempts: 2,
    });
  });

  /**
   * The direction of the default is the point. An unreadable row surfaces the
   * word in 苦手な語, where the learner sees it and drills it again; defaulting
   * to 'correct' would drop a word they are getting wrong out of the one list
   * built to catch that.
   */
  it("defaults an unreadable row to 'wrong', so it surfaces rather than disappears", () => {
    expect(sanitizeProgressMap({ broken: null })[0]).toMatchObject({
      entryId: 'broken',
      status: 'wrong',
      attempts: 0,
    });
  });
});
