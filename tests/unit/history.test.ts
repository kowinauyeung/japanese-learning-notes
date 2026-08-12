import { describe, expect, it } from 'vitest';
import type { PracticeSession } from '@/domain/practice';
import { missedWords, sessionTime, weakWords } from '@/lib/history';
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
