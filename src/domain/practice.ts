import type { IsoDateTime } from './common';

export const PRACTICE_MODES = ['flashcard', 'dictation'] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

/**
 * One word a session got wrong, with enough of the note copied in to outlive it.
 *
 * The id alone was the whole record until this field existed, and it made 履歴
 * mutable by the back door: deleting a word rewrote every session that had
 * named it, because a row could only be drawn by resolving the id against the
 * notebook as it stands today. A session is a statement about a day that has
 * already happened, so the words it names are copied rather than referenced.
 *
 * The id stays, and is still what links a surviving word to its note. The
 * snapshot is the fallback for when there is nothing left to link to — it is
 * never preferred over the live entry, because a word that still exists is the
 * same word and the notebook is the truth about it.
 *
 * **Empty strings are the legacy shape**, not corruption: sessions written
 * before this field carried a bare id, and no backfill can invent a headword
 * for a word already deleted. `sanitizeSession` reads both.
 */
export interface MissedWord {
  entryId: string;
  /** The headword as it read on the day of the session. */
  headword: string;
  /** Its reading on the day, or '' — the note may not have carried one. */
  reading: string;
}

/** One card as it was dealt: the same snapshot, plus how it was answered. */
export interface PractisedWord extends MissedWord {
  correct: boolean;
}

/** A completed practice run — the source for 履歴 and the dashboard panel. */
export interface PracticeSession {
  id: string;
  mode: PracticeMode;
  /** Human-readable description of the filters used, e.g. 「#work / 苦手のみ」. */
  filterLabel: string;
  total: number;
  correct: number;
  /**
   * Every card the session dealt, in the order it dealt them.
   *
   * **Null for a session recorded before this field existed**, where only the
   * wrong answers were ever written down — an absent list and an empty one are
   * different claims, and a drill of nothing is not a thing that happens.
   */
  words: PractisedWord[] | null;
  /**
   * The words answered wrong, in the order the session recorded them.
   *
   * Derived from `words` and not stored beside it, so the two cannot disagree.
   * Read from the stored field only for a session that predates `words`, which
   * is the one case where the wrong answers are all there is.
   */
  missed: MissedWord[];
  /** When the learner pressed 開始する — necessarily their own clock. */
  startedAt: IsoDateTime;
  /** Set by the write path from the server clock, never by the device. */
  finishedAt: IsoDateTime;
}

/**
 * Fields the caller may send when recording a session.
 *
 * The id is assigned by the write path, the same way `EntryDraft` omits it: a
 * caller that invented one would either collide or have to know how the
 * datasource generates ids.
 *
 * `missed` is omitted because nothing writes it any more: it is `words` with
 * the correct answers taken out, and a stored copy of a derived list is a
 * second thing that can be wrong.
 *
 * `finishedAt` is omitted for a different reason. 履歴 is ordered and paged by
 * it, and a cursor is only sound over a value one clock produced — a device an
 * hour fast would file its sessions above everything and repeat or skip rows at
 * every page boundary. `startedAt` stays a device value because that is what it
 * honestly is: the session had already begun before any write happened.
 *
 * **`words` is narrowed rather than inherited.** Null is a *read* state — it
 * says a stored session predates the field — and it is not a thing any caller
 * may send. `validSession` in `firestore.rules` asks that `words` is a list,
 * and `get('words', [])` falls back to the default only when the key is absent,
 * so an explicit null reaches `null is list` and the write is refused. Inheriting
 * the nullable type would let a draft typecheck that production rejects, with
 * nothing between the two to say so.
 */
export type PracticeSessionDraft = Omit<
  PracticeSession,
  'id' | 'finishedAt' | 'missed' | 'words'
> & { words: PractisedWord[] };

/**
 * Per-entry practice state.
 *
 * Kept out of Entry so answering a card rewrites a small record instead of the
 * whole note, and so practice history survives edits to the note content.
 *
 * **All of these live in one document, not one document each** — see
 * `ProgressRepository`. The interface is still per entry because that is what
 * every caller works in; where they are stored is the adapter's business.
 */
export interface EntryProgress {
  entryId: string;
  /** Outcome of the most recent attempt — what 苦手な語 is derived from. */
  status: 'correct' | 'wrong';
  lastMode: PracticeMode;
  lastAt: IsoDateTime;
  attempts: number;
  correctCount: number;
}
