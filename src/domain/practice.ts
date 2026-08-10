import type { IsoDateTime } from './common';

export const PRACTICE_MODES = ['flashcard', 'dictation'] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

/** A completed practice run — the source for 履歴 and the dashboard panel. */
export interface PracticeSession {
  id: string;
  mode: PracticeMode;
  /** Human-readable description of the filters used, e.g. 「#work / 苦手のみ」. */
  filterLabel: string;
  total: number;
  correct: number;
  /** Entry ids answered wrong, for the session summary and quick re-practice. */
  missed: string[];
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
 * `finishedAt` is omitted for a different reason. 履歴 is ordered and paged by
 * it, and a cursor is only sound over a value one clock produced — a device an
 * hour fast would file its sessions above everything and repeat or skip rows at
 * every page boundary. `startedAt` stays a device value because that is what it
 * honestly is: the session had already begun before any write happened.
 */
export type PracticeSessionDraft = Omit<PracticeSession, 'id' | 'finishedAt'>;

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
