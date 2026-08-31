import { describe, expect, it } from 'vitest';
import { POS } from '@/domain/entry';
import { toDraft } from '@/lib/draft';
import {
  isValidIsoDate,
  sanitizeDraft,
  sanitizeEntry,
  sanitizeProgressMap,
  sanitizeSession,
} from '@/lib/sanitize';
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

  it('keeps pitchAccent when it is a number, since 0 is meaningful', () => {
    expect(sanitizeDraft({ pitchAccent: 0 }).pitchAccent).toBe(0);
    expect(sanitizeDraft({ pitchAccent: null }).pitchAccent).toBeNull();
  });

  /**
   * The other end of this field is an assistant writing JSON by hand, and one
   * asked for a number sends `"2"` often enough that refusing it drops a correct
   * answer on a technicality — silently, because the import says nothing about a
   * field it could not read. `freq` has always accepted a numeric string from
   * the same source; this now matches it.
   */
  it('accepts the quoted number an assistant sends instead of a bare one', () => {
    expect(sanitizeDraft({ pitchAccent: '2' }).pitchAccent).toBe(2);
    expect(sanitizeDraft({ pitchAccent: ' 0 ' }).pitchAccent).toBe(0);
  });

  /**
   * The empty string is the trap: `Number('')` is 0, and 0 is 平板 — a positive
   * claim about the word, invented out of a blank field.
   */
  it('reads a blank string as absent rather than as 平板', () => {
    expect(sanitizeDraft({ pitchAccent: '' }).pitchAccent).toBeNull();
    expect(sanitizeDraft({ pitchAccent: '   ' }).pitchAccent).toBeNull();
  });

  /**
   * `typeof value === 'number'` was the entire check here for the field's whole
   * life, and every value below satisfies it. None of them is a mora anything
   * can drop after: they reached the detail page as "NaN" drawn over the kana,
   * or as a border on no mora at all.
   *
   * The field had no input and no display until the accent work, so nothing
   * could put one there — which is why this went unnoticed rather than why it
   * was safe.
   */
  it('rejects NaN, Infinity and a fractional or negative mora', () => {
    expect(sanitizeDraft({ pitchAccent: Number.NaN }).pitchAccent).toBeNull();
    expect(sanitizeDraft({ pitchAccent: Number.POSITIVE_INFINITY }).pitchAccent).toBeNull();
    expect(sanitizeDraft({ pitchAccent: -3 }).pitchAccent).toBeNull();
    expect(sanitizeDraft({ pitchAccent: 2.7 }).pitchAccent).toBeNull();
  });

  /**
   * A string is coerced with `Number`, not `parseInt`, so it fails on exactly
   * the values the bare number fails on. `parseInt` would read '2.7' as 2 and
   * '2（中高）' as 2 — a different answer for the same input depending only on
   * whether the assistant quoted it.
   */
  it('holds a quoted value to the same rules as a bare one', () => {
    expect(sanitizeDraft({ pitchAccent: '2.7' }).pitchAccent).toBeNull();
    expect(sanitizeDraft({ pitchAccent: '-3' }).pitchAccent).toBeNull();
    expect(sanitizeDraft({ pitchAccent: '2（中高）' }).pitchAccent).toBeNull();
    expect(sanitizeDraft({ pitchAccent: 'わかりません' }).pitchAccent).toBeNull();
  });

  /**
   * The bound that is *not* enforced here, stated as a test so removing it is a
   * decision rather than an accident. 9 does not fit a three-mora reading, but
   * the reading is a sibling field the user edits: rejecting it on read would
   * delete a correct value the moment the kana were shortened. `PitchAccentField`
   * refuses it where there is still someone to fix it, and `pitchShape` draws
   * nothing meanwhile.
   */
  it('keeps an accent too large for the reading, which only the form can judge', () => {
    expect(sanitizeDraft({ pitchAccent: 9, reading: 'たまご' }).pitchAccent).toBe(9);
  });

  /**
   * The read path and the write path share `TAG_PATTERN` now. They did not:
   * `parseTags` splits and de-duplicates and never checked the shape, so `a/b`
   * and a 40-character tag were refused by `invalidTags` on save and waved
   * through on read. A document written before the rule existed came back as a
   * valid `Entry` carrying a tag the form rejects and no filter chip can match.
   */
  it('drops a stored tag the form itself would refuse', () => {
    expect(sanitizeDraft({ tags: ['a/b', 'ニュース', '仕事!'] }).tags).toEqual(['ニュース']);
    expect(sanitizeDraft({ tags: ['x'.repeat(40)] }).tags).toEqual([]);
  });

  /**
   * The consequence of tightening `TAG_PATTERN` from 32 characters to 10, in
   * the direction that is easy to miss: the pattern is read on the way *in* as
   * well as on the way out, so a tag that was legal when it was saved now
   * disappears from the entry rather than being reported anywhere.
   *
   * That is the right degradation — a filter chip no query could match is worse
   * than no chip — but it is a silent data loss on read and it should be a
   * decision somebody made, not a surprise somebody finds.
   */
  it('drops a stored tag that was legal before the limit was tightened to 10', () => {
    expect(sanitizeDraft({ tags: ['x'.repeat(10), 'x'.repeat(11)] }).tags).toEqual([
      'x'.repeat(10),
    ]);
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

/**
 * The one place the two shapes of `missed` meet.
 *
 * Sessions written before `MissedWord` existed hold a bare id, and there is no
 * backfill that could fix that — a headword for a word already deleted cannot
 * be recovered. So the reader takes both, and the old shape reads back as a
 * snapshot with nothing in it, which is what it is.
 */
/**
 * 品詞 read back from a document nobody is editing.
 *
 * `togglePos` puts the form's own list in `POS` order, but a reader who never
 * touches a 品詞 chip never rewrites the field — so every note stored before
 * that, and every note imported from an assistant that listed them its own way,
 * would keep the order it arrived in. `EntryHeadline` and the manifest row in
 * `EntryBody` map `pos` as stored, so that order is what is drawn.
 */
describe('sanitizeEntry — 品詞 as a set', () => {
  it('reads a stored order back in the order the app renders, so a note nobody edits stops disagreeing with one that was', () => {
    const [first, second] = POS;

    expect(sanitizeEntry('e1', { pos: [second, first] }).pos).toEqual([first, second]);
  });

  it('drops a repeat rather than drawing the same part of speech twice', () => {
    const [first] = POS;

    expect(sanitizeEntry('e1', { pos: [first, first] }).pos).toEqual([first]);
  });

  it('still refuses a value that is not a part of speech at all', () => {
    const [first] = POS;

    expect(sanitizeEntry('e1', { pos: [first, 'ヌルポ', 42, null] }).pos).toEqual([first]);
  });
});

describe('sanitizeSession — the missed list, in both shapes it is stored in', () => {
  const stored = (missed: unknown) => ({
    mode: 'flashcard',
    filterLabel: 'すべて',
    total: 3,
    correct: 1,
    missed,
    startedAt: '2026-06-24T09:00:00.000Z',
    finishedAt: '2026-06-24T09:04:00.000Z',
  });

  it('reads the snapshot a session records now', () => {
    expect(
      sanitizeSession('s1', stored([{ entryId: 'w1', headword: '切り分け', reading: 'きりわけ' }]))
        .missed,
    ).toEqual([{ entryId: 'w1', headword: '切り分け', reading: 'きりわけ' }]);
  });

  /**
   * A session recorded before this field existed. Read as anything other than
   * a `MissedWord`, every history row it holds throws on `.entryId`.
   */
  it('reads a pre-snapshot session, whose missed list is bare ids', () => {
    expect(sanitizeSession('s1', stored(['w1', 'w2'])).missed).toEqual([
      { entryId: 'w1', headword: '', reading: '' },
      { entryId: 'w2', headword: '', reading: '' },
    ]);
  });

  /**
   * The id is what makes a surviving word a link, so a row without one can
   * never be anything but dead text. Dropped rather than rendered, the same
   * way a pre-snapshot id with no word behind it is.
   */
  it('drops an element with no entry id, which could never link anywhere', () => {
    expect(
      sanitizeSession('s1', stored([{ headword: '切り分け' }, null, 42, '', { entryId: 'w1' }]))
        .missed,
    ).toEqual([{ entryId: 'w1', headword: '', reading: '' }]);
  });

  it('reads a missed list that is not a list at all as empty', () => {
    expect(sanitizeSession('s1', stored('w1')).missed).toEqual([]);
  });

  /**
   * The drill a session was recorded in, when it is one this version does not
   * have. `PracticeMode` is a closed union, so an unrecognised string read
   * straight off the document is a value the type says cannot exist — and it
   * reaches `SessionDialog`, which picks its heading and its chips from it.
   *
   * Named for the mode rather than for the sanitiser because that is the fact
   * that decides it: a drill removed in a later version leaves sessions behind
   * that still have to be readable, which is what this whole module is for.
   */
  it('reads a session recorded in a drill this version no longer has as a flashcard run', () => {
    // Only the unrecognised string. `oneOf` also refuses a non-string, but that
    // half of it is shared with every other enum field and is already covered
    // by `falls back when jlpt is outside the scale` — asserting it again here
    // would test the helper a second time rather than this field's wiring.
    expect(sanitizeSession('s1', { ...stored([]), mode: 'writing' }).mode).toBe('flashcard');
  });

  it('keeps a mode it does recognise', () => {
    expect(sanitizeSession('s1', { ...stored([]), mode: 'dictation' }).mode).toBe('dictation');
  });
});

/**
 * The full run, and the missed list that is read out of it.
 *
 * Nothing writes `missed` any more — it is `words` with the correct answers
 * taken out — so a session recorded now has no such field, and reading one
 * without deriving it leaves every history row's missed list empty.
 */
describe('sanitizeSession — the run', () => {
  const stored = (over: Record<string, unknown>) => ({
    mode: 'flashcard',
    filterLabel: 'すべて',
    total: 2,
    correct: 1,
    startedAt: '2026-06-24T09:00:00.000Z',
    finishedAt: '2026-06-24T09:04:00.000Z',
    ...over,
  });

  const RUN = [
    { entryId: 'w1', headword: '切り分け', reading: 'きりわけ', correct: true },
    { entryId: 'w2', headword: '兆候', reading: 'ちょうこう', correct: false },
  ];

  it('derives the missed list from the run, since nothing stores it any more', () => {
    expect(sanitizeSession('s1', stored({ words: RUN })).missed).toEqual([
      { entryId: 'w2', headword: '兆候', reading: 'ちょうこう' },
    ]);
  });

  /**
   * A document that somehow holds both. The run is the record of what happened
   * and the other is a list that was derived from something; trusting the
   * stored copy would let a stale one outrank the answers themselves.
   */
  it('reads the missed list out of the run even when a stored one sits beside it', () => {
    const session = sanitizeSession(
      's1',
      stored({ words: RUN, missed: [{ entryId: 'w9', headword: '曖昧', reading: 'あいまい' }] }),
    );
    expect(session.missed).toEqual([{ entryId: 'w2', headword: '兆候', reading: 'ちょうこう' }]);
  });

  /**
   * Null and `[]` are different claims, and the dialog leans on the difference:
   * null means the session never recorded a run, which is every session written
   * before the field existed. An empty list would claim a drill that dealt no
   * cards, and the dialog would print a heading over nothing.
   */
  it('reports no run at all, rather than an empty one, when the field is absent', () => {
    expect(sanitizeSession('s1', stored({ missed: ['w2'] })).words).toBeNull();
  });

  /**
   * The direction `sanitizeProgressMap` already defaults in, for the same
   * reason: a word shown as missed gets looked at again, one shown as correct
   * does not. So anything that is not exactly `true` reads as a wrong answer.
   */
  it('reads an unusable answer as wrong, so the word surfaces rather than hides', () => {
    const session = sanitizeSession(
      's1',
      stored({ words: [{ entryId: 'w1', headword: '切り分け', reading: '', correct: 'yes' }] }),
    );
    expect(session.words).toEqual([
      { entryId: 'w1', headword: '切り分け', reading: '', correct: false },
    ]);
    expect(session.missed).toHaveLength(1);
  });
});
