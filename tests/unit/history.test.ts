import { describe, expect, it } from 'vitest';
import type { PracticeSession } from '@/domain/practice';
import { latestByMode, missedWords, RECENT_WINDOW, sessionTime, weakWords } from '@/lib/history';
import { makeEntry } from '../fixtures/entry';

/**
 * Reading a session back long after the drill that produced it.
 *
 * The hazard throughout is the one word sets have: a session names entry ids
 * and nothing prunes it when a word is deleted, so every list on 履歴 is a
 * resolution against a notebook that may no longer hold what it names.
 */

const KIRIWAKE = makeEntry({ id: 'w1', headword: '切り分け' });
const CHOUKOU = makeEntry({ id: 'w2', headword: '兆候' });
const NOTEBOOK = [KIRIWAKE, CHOUKOU];

const makeSession = (overrides: Partial<PracticeSession> = {}): PracticeSession => ({
  id: 's1',
  mode: 'flashcard',
  filterLabel: 'すべての語',
  total: 3,
  correct: 1,
  missed: ['w1', 'w2'],
  startedAt: '2026-06-24T09:00:00.000Z',
  finishedAt: '2026-06-24T09:04:00.000Z',
  ...overrides,
});

describe('missedWords', () => {
  it('keeps the order the session recorded them in', () => {
    const session = makeSession({ missed: ['w2', 'w1'] });
    expect(missedWords(session, NOTEBOOK).map((entry) => entry.headword)).toEqual([
      '兆候',
      '切り分け',
    ]);
  });

  /**
   * A word answered wrong and then deleted keeps its id in `missed` forever,
   * and rightly so — the record of that day is true either way. What must not
   * happen is 「間違えた語：切り分け、」 with nothing after the separator.
   */
  it('drops an id whose word has been deleted rather than rendering a gap', () => {
    const session = makeSession({ missed: ['w1', 'gone', 'w2'] });
    expect(missedWords(session, NOTEBOOK).map((entry) => entry.id)).toEqual(['w1', 'w2']);
  });

  it('has nothing to show for a perfect session', () => {
    expect(missedWords(makeSession({ missed: [], correct: 3 }), NOTEBOOK)).toEqual([]);
  });
});

describe('weakWords', () => {
  /**
   * Counted over the notebook, not over the progress map — the same way the
   * practice screen already counts 苦手. A word answered wrong and then deleted
   * keeps its row, so the map would offer a list one longer than the drill the
   * button beneath it starts.
   */
  it('offers only words the notebook still holds', () => {
    expect(weakWords(new Set(['w1', 'gone']), NOTEBOOK).map((entry) => entry.id)).toEqual(['w1']);
  });

  it('reads in the notebook’s order, not the set’s', () => {
    expect(weakWords(new Set(['w2', 'w1']), NOTEBOOK).map((entry) => entry.id)).toEqual([
      'w1',
      'w2',
    ]);
  });
});

/**
 * The formatter itself is an `Intl` call and its output depends on the timezone
 * the suite runs in, so what it renders is deliberately not asserted. The guard
 * in front of it is a different matter: `sanitizeSession` coerces a missing
 * timestamp to `''`, and `new Date('')` is an Invalid Date that formats as
 * 「Invalid Date」 in the middle of a history row.
 */
describe('sessionTime', () => {
  it.each(['', 'not a date'])('renders nothing for %o rather than Invalid Date', (value) => {
    expect(sessionTime(value)).toBe('');
  });

  it('renders something for a real instant', () => {
    expect(sessionTime('2026-06-24T09:04:00.000Z')).not.toBe('');
  });
});

/**
 * What the dashboard's 最新の練習 panel shows, out of the window it read.
 *
 * A window rather than a query per mode, because the per-mode query needs a
 * composite index the emulator does not enforce — see `RECENT_WINDOW`. The
 * cost of that choice is the last case here, and it is written down rather
 * than hidden.
 */
describe('latestByMode', () => {
  const session = (id: string, mode: 'flashcard' | 'dictation', finishedAt: string) =>
    makeSession({ id, mode, finishedAt });

  it('picks the newest of each mode out of a mixed list', () => {
    const newestFirst = [
      session('s3', 'flashcard', '2026-06-24T12:00:00.000Z'),
      session('s2', 'dictation', '2026-06-23T12:00:00.000Z'),
      session('s1', 'flashcard', '2026-06-22T12:00:00.000Z'),
    ];
    const latest = latestByMode(newestFirst);
    expect(latest.flashcard?.id).toBe('s3');
    expect(latest.dictation?.id).toBe('s2');
  });

  it('reports a mode that has never been drilled as null', () => {
    const latest = latestByMode([session('s1', 'flashcard', '2026-06-24T12:00:00.000Z')]);
    expect(latest.flashcard?.id).toBe('s1');
    expect(latest.dictation).toBeNull();
  });

  it('has both modes as keys even with nothing to show', () => {
    expect(latestByMode([])).toEqual({ flashcard: null, dictation: null });
  });

  /**
   * The limitation, pinned so it is a decision rather than a surprise: a mode
   * that has not been drilled inside the window reads as untouched. It takes
   * `RECENT_WINDOW` sessions of one mode without a single one of the other.
   */
  it('cannot see a mode that fell out of the window it was given', () => {
    const onlyFlashcards = Array.from({ length: RECENT_WINDOW }, (_, index) =>
      session(`s${index}`, 'flashcard', '2026-06-24T12:00:00.000Z'),
    );
    expect(latestByMode(onlyFlashcards).dictation).toBeNull();
  });
});
