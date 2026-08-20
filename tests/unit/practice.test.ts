import { describe, expect, it } from 'vitest';
import { SESSION_LIMITS } from '@/domain/limits';
import type { EntryProgress } from '@/domain/practice';
import type { WordSet } from '@/domain/wordSet';
import {
  activeQuickRange,
  describeFilters,
  EMPTY_PRACTICE_FILTERS,
  matchesPractice,
  practiceFiltersFromParams,
  practiceFiltersToParams,
  mergeProgress,
  quickRangeStart,
  scopeFor,
  shuffle,
  summariseSession,
  weakIdsOf,
} from '@/lib/practice';
import type { PracticeFilters } from '@/lib/practice';
import { makeEntry } from '../fixtures/entry';

const makeSet = (id: string, name: string, entryIds: string[]): WordSet => ({
  id,
  ownerUid: 'uid-alice',
  name,
  description: '',
  entryIds,
  level: '',
  topics: [],
  publishedId: null,
  publishedVersion: 0,
  copiedFrom: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
});

const progress = (overrides: Partial<EntryProgress> & { entryId: string }): EntryProgress => ({
  status: 'correct',
  lastMode: 'flashcard',
  lastAt: '2026-06-20T00:00:00.000Z',
  attempts: 1,
  correctCount: 1,
  ...overrides,
});

describe('weakIdsOf', () => {
  /**
   * 苦手な語 is the most recent attempt, never a ratio. A word answered wrong
   * nine times and right today is not weak any more, and a list that kept it
   * would stop being the thing a learner drills.
   */
  it('takes the latest status only, so a correct answer clears a word', () => {
    const weak = weakIdsOf([
      progress({ entryId: 'a', status: 'wrong' }),
      progress({ entryId: 'b', status: 'correct', attempts: 10, correctCount: 1 }),
    ]);
    expect([...weak]).toEqual(['a']);
  });
});

describe('matchesPractice', () => {
  const entry = makeEntry({ id: 'e1', tags: ['仕事'], jlpt: 'N2' });
  /** Nothing weak, no set selected — the baseline every case narrows from. */
  const scope = { weak: new Set(['e9']), inSets: null };

  it('selects everything when no filter is set', () => {
    expect(matchesPractice(entry, EMPTY_PRACTICE_FILTERS, scope)).toBe(true);
  });

  /** Chips within one filter are OR, matching Browse. An AND would return nothing. */
  it('treats two levels as "either level", not "both"', () => {
    const filters = { ...EMPTY_PRACTICE_FILTERS, jlpt: ['N1', 'N2'] };
    expect(matchesPractice(entry, filters, scope)).toBe(true);
  });

  /** An entry carries several 品詞, so this is membership, not equality. */
  it('matches 品詞 against every part of speech the entry carries', () => {
    const verbal = makeEntry({ pos: ['名詞', '動詞'] });
    expect(matchesPractice(verbal, { ...EMPTY_PRACTICE_FILTERS, pos: '動詞' }, scope)).toBe(true);
    expect(matchesPractice(verbal, { ...EMPTY_PRACTICE_FILTERS, pos: '副詞' }, scope)).toBe(false);
  });

  it('matches 語種 exactly', () => {
    expect(matchesPractice(entry, { ...EMPTY_PRACTICE_FILTERS, origin: '漢語' }, scope)).toBe(true);
    expect(matchesPractice(entry, { ...EMPTY_PRACTICE_FILTERS, origin: '和語' }, scope)).toBe(
      false,
    );
  });

  describe('the learning-date range', () => {
    const on = (learnedOn: string) => makeEntry({ learnedOn });

    /** Both ends are inclusive, so a word learned on the boundary is in. */
    it('includes the first and last day of the range', () => {
      const filters = { ...EMPTY_PRACTICE_FILTERS, from: '2026-06-01', to: '2026-06-30' };
      expect(matchesPractice(on('2026-06-01'), filters, scope)).toBe(true);
      expect(matchesPractice(on('2026-06-30'), filters, scope)).toBe(true);
      expect(matchesPractice(on('2026-05-31'), filters, scope)).toBe(false);
      expect(matchesPractice(on('2026-07-01'), filters, scope)).toBe(false);
    });

    it('leaves the other end unbounded when only one is set', () => {
      expect(
        matchesPractice(on('2030-01-01'), { ...EMPTY_PRACTICE_FILTERS, from: '2026-06-01' }, scope),
      ).toBe(true);
      expect(
        matchesPractice(on('1999-01-01'), { ...EMPTY_PRACTICE_FILTERS, to: '2026-06-01' }, scope),
      ).toBe(true);
    });
  });

  it('combines different filters with AND', () => {
    expect(
      matchesPractice(entry, { ...EMPTY_PRACTICE_FILTERS, tags: ['仕事'], jlpt: ['N1'] }, scope),
    ).toBe(false);
  });

  it('excludes an entry with no failed attempt when 苦手のみ is on', () => {
    const filters = { ...EMPTY_PRACTICE_FILTERS, weakOnly: true };
    expect(matchesPractice(entry, filters, scope)).toBe(false);
    expect(matchesPractice(entry, filters, { weak: new Set(['e1']), inSets: null })).toBe(true);
  });
});

describe('scopeFor — 単語集', () => {
  const sets = [makeSet('s1', '仕事', ['a', 'b']), makeSet('s2', '旅行', ['b', 'c'])];
  const weak = new Set<string>();

  /**
   * Null, not an empty set. The two mean opposite things — "do not filter by
   * set" and "a set with nothing in it" — and collapsing them makes selecting
   * an empty 単語集 deal the entire notebook.
   */
  it('does not filter at all when no set is selected', () => {
    expect(scopeFor(EMPTY_PRACTICE_FILTERS, sets, weak).inSets).toBeNull();
  });

  it('yields an empty membership for a set with no words, not a null one', () => {
    const empty = [makeSet('s3', '空', [])];
    const scope = scopeFor({ ...EMPTY_PRACTICE_FILTERS, sets: ['s3'] }, empty, weak);
    expect(scope.inSets?.size).toBe(0);
    expect(
      matchesPractice(makeEntry({ id: 'a' }), { ...EMPTY_PRACTICE_FILTERS, sets: ['s3'] }, scope),
    ).toBe(false);
  });

  /** Two sets is "either set", the same rule the tag and level chips follow. */
  it('unions the members of every selected set, counting a shared word once', () => {
    const scope = scopeFor({ ...EMPTY_PRACTICE_FILTERS, sets: ['s1', 's2'] }, sets, weak);
    expect([...(scope.inSets ?? [])].sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignores a selected id that no longer names a set', () => {
    const scope = scopeFor({ ...EMPTY_PRACTICE_FILTERS, sets: ['gone'] }, sets, weak);
    expect(scope.inSets?.size).toBe(0);
  });

  it('keeps a word out of the drill when it is in no selected set', () => {
    const filters = { ...EMPTY_PRACTICE_FILTERS, sets: ['s1'] };
    const scope = scopeFor(filters, sets, weak);
    expect(matchesPractice(makeEntry({ id: 'a' }), filters, scope)).toBe(true);
    expect(matchesPractice(makeEntry({ id: 'c' }), filters, scope)).toBe(false);
  });
});

describe('shuffle', () => {
  /**
   * A shuffle that only ever moved one element passes a length check and a
   * membership check, and is a broken drill. Pinning the randomness is the only
   * way to assert on the order it actually produces.
   */
  it('permutes the whole list, not just the ends', () => {
    // Always picks index 0 as the swap target, which walks the first element
    // to the end and moves every other element down one.
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
  });

  it('keeps every element exactly once', () => {
    const source = [1, 2, 3, 4, 5];
    let seed = 0.17;
    const result = shuffle(source, () => (seed = (seed * 9301 + 0.49297) % 1));
    expect([...result].sort()).toEqual(source);
  });

  it('does not mutate its input', () => {
    const source = [1, 2, 3];
    shuffle(source, () => 0);
    expect(source).toEqual([1, 2, 3]);
  });
});

describe('quick ranges', () => {
  // A Tuesday, deliberately the 31st — the day the naive implementation breaks.
  const NOW = new Date(2026, 2, 31, 10, 0, 0);

  it('reads 直近1週間 as seven days back', () => {
    expect(quickRangeStart('week', NOW)).toBe('2026-03-24');
  });

  /**
   * The defect: `setMonth(month - 1)` on 3月31日 asks for 2月31日, which `Date`
   * rolls forward to 3月3日. 「直近1ヶ月」 would then start three days *after*
   * the day it was clicked, and a range meant to widen the drill would return
   * almost nothing.
   */
  it('clamps 直近1ヶ月 from the 31st to the last day of a shorter month', () => {
    expect(quickRangeStart('month', NOW)).toBe('2026-02-28');
  });

  it('reads 直近1年 as the same day twelve months back', () => {
    expect(quickRangeStart('year', NOW)).toBe('2025-03-31');
  });

  it('reports which chip the current bounds are', () => {
    const filters = { ...EMPTY_PRACTICE_FILTERS, from: '2026-03-24' };
    expect(activeQuickRange(filters, NOW)).toBe('week');
    expect(activeQuickRange({ ...EMPTY_PRACTICE_FILTERS, from: '2026-03-01' }, NOW)).toBeNull();
    expect(activeQuickRange(EMPTY_PRACTICE_FILTERS, NOW)).toBeNull();
  });

  /**
   * A quick range sets only the start. Once an end is typed in, no chip
   * describes the window any more, and one showing as selected would be
   * claiming a range the drill is not using.
   */
  it('reports no chip once an end date narrows the range by hand', () => {
    const filters = { ...EMPTY_PRACTICE_FILTERS, from: '2026-03-24', to: '2026-03-28' };
    expect(activeQuickRange(filters, NOW)).toBeNull();
  });
});

describe('describeFilters', () => {
  it('reads back the chips that were on', () => {
    expect(
      describeFilters({ ...EMPTY_PRACTICE_FILTERS, tags: ['仕事'], jlpt: ['N1'], weakOnly: true }),
    ).toBe('#仕事 / N1 / 苦手のみ');
  });

  /**
   * Written out as days, never as 「直近1ヶ月」. The label is stored on the
   * session and read back in 履歴 weeks later, where a relative phrase would
   * describe a different window every time it is read.
   */
  it('records a quick range as the days it resolved to', () => {
    expect(describeFilters({ ...EMPTY_PRACTICE_FILTERS, from: '2026-02-28' })).toBe('2026-02-28〜');
    expect(
      describeFilters({ ...EMPTY_PRACTICE_FILTERS, pos: '動詞', origin: '和語', to: '2026-03-31' }),
    ).toBe('動詞 / 和語 / 〜2026-03-31');
  });

  it('stores localized metadata in a non-Japanese session label', () => {
    expect(
      describeFilters({ ...EMPTY_PRACTICE_FILTERS, pos: '動詞', origin: '漢語' }, [], {
        set: (name) => `Set: ${name}`,
        metadata: (value) =>
          (({ 動詞: 'Verb', 漢語: 'Sino-Japanese' }) as Record<string, string>)[value] ?? value,
        unknown: 'Unknown',
        weakOnly: 'Weak only',
        all: 'All words',
      }),
    ).toBe('Verb / Sino-Japanese');
  });

  /**
   * By name, because 履歴 is read by a person weeks later. A set deleted in
   * between is named as missing rather than dropped: silently omitting a
   * filter would misdescribe which words the session actually drilled.
   */
  it('names the 単語集, and says so when one has since been deleted', () => {
    const sets = [makeSet('s1', '仕事', [])];
    expect(describeFilters({ ...EMPTY_PRACTICE_FILTERS, sets: ['s1'] }, sets)).toBe('単語集:仕事');
    expect(describeFilters({ ...EMPTY_PRACTICE_FILTERS, sets: ['s1'] }, [])).toBe('単語集:不明');
  });

  /** 履歴 shows this string, and an empty cell there says nothing. */
  it('names the unfiltered case rather than returning an empty label', () => {
    expect(describeFilters(EMPTY_PRACTICE_FILTERS)).toBe('すべての語');
  });
});

describe('mergeProgress', () => {
  const at = '2026-06-24T10:00:00.000Z';

  it('adds to the previous counts instead of restarting them', () => {
    const merged = mergeProgress(
      [progress({ entryId: 'a', attempts: 3, correctCount: 2, status: 'wrong' })],
      [{ entryId: 'a', correct: true }],
      'dictation',
      at,
    );
    expect(merged).toEqual([
      {
        entryId: 'a',
        status: 'correct',
        lastMode: 'dictation',
        lastAt: at,
        attempts: 4,
        correctCount: 3,
      },
    ]);
  });

  it('starts a word that has never been practised at one attempt', () => {
    const [row] = mergeProgress([], [{ entryId: 'new', correct: false }], 'flashcard', at);
    expect(row).toMatchObject({ attempts: 1, correctCount: 0, status: 'wrong' });
  });

  /**
   * The rows returned are written to Firestore with `merge: true`. Returning
   * every known row instead of only the answered ones would make each session
   * rewrite the whole map — which is how a session finished on one device
   * silently reverts one finished on another.
   */
  it('returns only the entries this session answered', () => {
    const merged = mergeProgress(
      [progress({ entryId: 'a' }), progress({ entryId: 'untouched' })],
      [{ entryId: 'a', correct: true }],
      'flashcard',
      at,
    );
    expect(merged.map((row) => row.entryId)).toEqual(['a']);
  });
});

describe('summariseSession', () => {
  it('counts the answers and lists the ids that were missed', () => {
    expect(
      summariseSession({
        mode: 'flashcard',
        filterLabel: '#仕事',
        answers: [
          { entryId: 'a', correct: true },
          { entryId: 'b', correct: false },
          { entryId: 'c', correct: false },
        ],
        startedAt: '2026-06-24T09:59:00.000Z',
      }),
    ).toEqual({
      mode: 'flashcard',
      filterLabel: '#仕事',
      total: 3,
      correct: 1,
      missed: ['b', 'c'],
      startedAt: '2026-06-24T09:59:00.000Z',
    });
  });

  /**
   * The caption is assembled from set and tag names, and a word set may be
   * named with an emoji — so the cut can land between the two halves of a
   * surrogate pair. What that leaves behind is not a character: it renders as
   * the replacement glyph in the history row, and it is not encodable as UTF-8,
   * so the value Firestore stores is not the value that was measured here.
   */
  it('does not cut an emoji in half when it shortens the caption', () => {
    // The label is built so that the slice at `filterLabel - 1` falls exactly
    // between the high and low surrogate of the final 🍣.
    const label = `${'あ'.repeat(SESSION_LIMITS.filterLabel - 2)}🍣🍣`;
    expect(label.length).toBeGreaterThan(SESSION_LIMITS.filterLabel);

    const { filterLabel } = summariseSession({
      mode: 'flashcard',
      filterLabel: label,
      answers: [],
      startedAt: '2026-06-24T09:59:00.000Z',
    });

    expect(filterLabel.length).toBeLessThanOrEqual(SESSION_LIMITS.filterLabel);
    expect(filterLabel.endsWith('…')).toBe(true);
    // No unpaired surrogate anywhere: every code unit in D800-DFFF has to be
    // half of a pair that `Array.from` can read back as one code point.
    expect(
      [...filterLabel].every((char) => char.codePointAt(0)! < 0xd800 || char.length === 2),
    ).toBe(true);
  });

  it('leaves a caption inside the limit exactly as it was given', () => {
    const label = '#仕事 / 🍣';
    expect(
      summariseSession({
        mode: 'flashcard',
        filterLabel: label,
        answers: [],
        startedAt: '2026-06-24T09:59:00.000Z',
      }).filterLabel,
    ).toBe(label);
  });
});

/**
 * Practice filters in a query string — what 履歴's 復習 button hands the drill.
 *
 * A query string is user input, so the read side has to refuse what it does not
 * recognise: a filter nothing can satisfy leaves the setup screen showing
 * 「0 件が対象」 with no visible reason why.
 */
describe('practice filters in the URL', () => {
  it('round-trips everything the setup screen can express', () => {
    const filters: PracticeFilters = {
      sets: ['set-work', 'set-news'],
      tags: ['仕事'],
      jlpt: ['N1', 'N2'],
      pos: '名詞',
      origin: '漢語',
      from: '2026-01-01',
      to: '2026-06-30',
      weakOnly: true,
    };
    expect(practiceFiltersFromParams(practiceFiltersToParams(filters))).toEqual(filters);
  });

  it('reads an empty query string as no filter at all', () => {
    expect(practiceFiltersFromParams(new URLSearchParams())).toEqual(EMPTY_PRACTICE_FILTERS);
  });

  /** The 復習 link's whole payload, and the only parameter it needs. */
  it('turns weak=1 into 苦手のみ', () => {
    expect(practiceFiltersFromParams(new URLSearchParams('weak=1')).weakOnly).toBe(true);
    expect(practiceFiltersFromParams(new URLSearchParams('weak=yes')).weakOnly).toBe(false);
  });

  it('drops a 品詞 or a level the app does not have', () => {
    const params = new URLSearchParams('pos=nonsense&jlpt=N2&jlpt=N9&origin=nonsense');
    const filters = practiceFiltersFromParams(params);
    expect(filters.pos).toBe('');
    expect(filters.origin).toBe('');
    expect(filters.jlpt).toEqual(['N2']);
  });

  /**
   * Set ids and tags are user-defined, so there is nothing to validate them
   * against. An id naming no set resolves to an empty scope, which `scopeFor`
   * already keeps distinct from "no set selected".
   */
  it('passes through a set id it cannot know is real', () => {
    expect(practiceFiltersFromParams(new URLSearchParams('set=gone')).sets).toEqual(['gone']);
  });

  it('leaves a default out of the query string entirely', () => {
    expect(practiceFiltersToParams(EMPTY_PRACTICE_FILTERS).toString()).toBe('');
  });
});

/**
 * A bound that is not a date is not a bound.
 *
 * The two are compared as plain strings, so anything sorting above a real date
 * excludes every entry at once — and the learner sees a blank date field,
 * 「0 件が対象」 and nothing on screen accounting for either. `pos`, `origin`
 * and `jlpt` were already refused; these two were passed straight through.
 */
describe('practice filters — date bounds from the URL', () => {
  it.each(['zzz', '2026-6-1', '2026-02-31', 'yesterday'])(
    'refuses %o rather than filtering everything out',
    (value) => {
      const filters = practiceFiltersFromParams(new URLSearchParams(`from=${value}&to=${value}`));
      expect(filters.from).toBe('');
      expect(filters.to).toBe('');
    },
  );

  it('keeps a real date on both ends', () => {
    const params = new URLSearchParams('from=2026-01-01&to=2026-06-30');
    expect(practiceFiltersFromParams(params)).toMatchObject({
      from: '2026-01-01',
      to: '2026-06-30',
    });
  });
});
