import { describe, expect, it } from 'vitest';
import type { EntryProgress } from '@/domain/practice';
import {
  describeFilters,
  EMPTY_PRACTICE_FILTERS,
  matchesPractice,
  mergeProgress,
  shuffle,
  summariseSession,
  weakIdsOf,
} from '@/lib/practice';
import { makeEntry } from '../fixtures/entry';

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
  const weak = new Set(['e9']);

  it('selects everything when no filter is set', () => {
    expect(matchesPractice(entry, EMPTY_PRACTICE_FILTERS, weak)).toBe(true);
  });

  /** Chips within one filter are OR, matching Browse. An AND would return nothing. */
  it('treats two levels as "either level", not "both"', () => {
    const filters = { ...EMPTY_PRACTICE_FILTERS, jlpt: ['N1', 'N2'] };
    expect(matchesPractice(entry, filters, weak)).toBe(true);
  });

  it('combines different filters with AND', () => {
    expect(
      matchesPractice(entry, { ...EMPTY_PRACTICE_FILTERS, tags: ['仕事'], jlpt: ['N1'] }, weak),
    ).toBe(false);
  });

  it('excludes an entry with no failed attempt when 苦手のみ is on', () => {
    const filters = { ...EMPTY_PRACTICE_FILTERS, weakOnly: true };
    expect(matchesPractice(entry, filters, weak)).toBe(false);
    expect(matchesPractice(entry, filters, new Set(['e1']))).toBe(true);
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

describe('describeFilters', () => {
  it('reads back the chips that were on', () => {
    expect(describeFilters({ tags: ['仕事'], jlpt: ['N1'], weakOnly: true })).toBe(
      '#仕事 / N1 / 苦手のみ',
    );
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
});
