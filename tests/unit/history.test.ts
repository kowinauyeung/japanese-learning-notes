import { describe, expect, it } from 'vitest';
import type { Entry } from '@/domain/entry';
import type { MissedWord, PracticeSession, PractisedWord } from '@/domain/practice';
import {
  latestByMode,
  missedWords,
  practisedWords,
  RECENT_WINDOW,
  sessionTime,
  weakWords,
} from '@/lib/history';
import type { WordRow } from '@/lib/history';
import { makeEntry } from '../fixtures/entry';

/**
 * Reading a session back long after the drill that produced it.
 *
 * The hazard throughout is the one word sets have: a session names entry ids
 * and nothing prunes it when a word is deleted, so every list on 履歴 is a
 * resolution against a notebook that may no longer hold what it names.
 *
 * 苦手な語 accepts that — a deleted word is one the learner chose to stop
 * studying, and it should leave the review list. 練習履歴 must not, and the
 * copy `MissedWord` carries is what stops it.
 */

const KIRIWAKE = makeEntry({ id: 'w1', headword: '切り分け' });
const CHOUKOU = makeEntry({ id: 'w2', headword: '兆候' });
const NOTEBOOK = [KIRIWAKE, CHOUKOU];

/** As a session records it: the id to link by, and the word as it read. */
const dealt = (entry: Entry, correct: boolean): PractisedWord => ({
  entryId: entry.id,
  headword: entry.headword,
  reading: entry.reading,
  correct,
});

const wrong = (entry: Entry): MissedWord => {
  const { correct: _correct, ...word } = dealt(entry, false);
  return word;
};

/** How a session written before `MissedWord` existed reads back. */
const legacyWrong = (entryId: string): MissedWord => ({ entryId, headword: '', reading: '' });

/**
 * A session as `sanitizeSession` hands it over: `words` is the whole run, and
 * `missed` has already been derived from it. Overriding one without the other
 * is how these tests describe a session written before `words` existed.
 */
const makeSession = (overrides: Partial<PracticeSession> = {}): PracticeSession => ({
  id: 's1',
  mode: 'flashcard',
  filterLabel: 'すべての語',
  total: 3,
  correct: 1,
  words: [dealt(KIRIWAKE, false), dealt(CHOUKOU, false)],
  missed: [wrong(KIRIWAKE), wrong(CHOUKOU)],
  startedAt: '2026-06-24T09:00:00.000Z',
  finishedAt: '2026-06-24T09:04:00.000Z',
  ...overrides,
});

/** A session from before the run was kept: wrong answers and nothing else. */
const legacySession = (missed: MissedWord[]) => makeSession({ words: null, missed });

const label = (row: WordRow) => (row.kind === 'entry' ? row.entry.headword : row.headword);

describe('missedWords', () => {
  it('keeps the order the session recorded them in', () => {
    const session = makeSession({ missed: [wrong(CHOUKOU), wrong(KIRIWAKE)] });
    expect(missedWords(session, NOTEBOOK).map(label)).toEqual(['兆候', '切り分け']);
  });

  /**
   * The defect this whole field exists for. Deleting a word used to erase it
   * from every session that had ever recorded it getting the word wrong —
   * 履歴 is a record of a day that has happened, and deleting a note today
   * cannot make yesterday's drill have gone differently.
   */
  it('still shows a missed word whose note has since been deleted', () => {
    const deleted = makeEntry({ id: 'w3', headword: '曖昧', reading: 'あいまい' });
    const session = makeSession({ missed: [wrong(KIRIWAKE), wrong(deleted)] });

    expect(missedWords(session, NOTEBOOK)).toEqual([
      { kind: 'entry', entry: KIRIWAKE },
      { kind: 'deleted', entryId: 'w3', headword: '曖昧', reading: 'あいまい' },
    ]);
  });

  /**
   * The snapshot is a fallback for a note that is gone, never an override of
   * one that is not. A headword corrected after the drill reads as corrected
   * everywhere — and the row links, which a `deleted` row cannot.
   */
  it('prefers the live note over the snapshot for a word that still exists', () => {
    const session = makeSession({
      missed: [{ entryId: 'w1', headword: '切分け', reading: 'きりわけ' }],
    });
    expect(missedWords(session, NOTEBOOK)).toEqual([{ kind: 'entry', entry: KIRIWAKE }]);
  });

  /**
   * Sessions recorded before the snapshot existed carry a bare id, and no
   * backfill can invent a headword for a word already deleted. Those rows keep
   * the old behaviour: dropped, rather than rendered as an empty line.
   */
  it('drops a pre-snapshot id whose word is gone, having nothing left to print', () => {
    const session = legacySession([legacyWrong('w1'), legacyWrong('gone'), legacyWrong('w2')]);
    expect(missedWords(session, NOTEBOOK).map(label)).toEqual(['切り分け', '兆候']);
  });

  it('has nothing to show for a perfect session', () => {
    expect(missedWords(makeSession({ missed: [], correct: 3 }), NOTEBOOK)).toEqual([]);
  });
});

describe('practisedWords', () => {
  it('keeps the deal order, correct answers included', () => {
    const session = makeSession({
      words: [dealt(CHOUKOU, true), dealt(KIRIWAKE, false), dealt(CHOUKOU, false)],
    });

    expect(practisedWords(session, NOTEBOOK)?.map((row) => [label(row), row.correct])).toEqual([
      ['兆候', true],
      ['切り分け', false],
      ['兆候', false],
    ]);
  });

  /**
   * The same rule the missed list follows, and it has to be the same one: the
   * two lists print the same word, so a word deleted since would otherwise
   * appear in one and not the other.
   */
  it('still shows a correctly answered word whose note has since been deleted', () => {
    const deleted = makeEntry({ id: 'w3', headword: '曖昧', reading: 'あいまい' });
    const session = makeSession({ words: [dealt(deleted, true)] });

    expect(practisedWords(session, NOTEBOOK)).toEqual([
      { kind: 'deleted', entryId: 'w3', headword: '曖昧', reading: 'あいまい', correct: true },
    ]);
  });

  /**
   * Null, not `[]`, and the dialog leans on the difference: a session recorded
   * before the run was kept never wrote one down, and only its wrong answers
   * survive. Printing those under a heading that claims to be the whole drill
   * would say the learner got nothing right.
   */
  it('reports no run at all for a session recorded before one was kept', () => {
    expect(practisedWords(legacySession([legacyWrong('w1')]), NOTEBOOK)).toBeNull();
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
