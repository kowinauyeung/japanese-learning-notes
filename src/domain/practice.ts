import type { IsoDateTime } from './common';

export type PracticeMode = 'flashcard' | 'dictation';

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
  startedAt: IsoDateTime;
  finishedAt: IsoDateTime;
}

/**
 * Per-entry practice state, keyed by entry id within the owner's subcollection.
 *
 * Kept out of Entry so answering a card rewrites a small document instead of
 * the whole note, and so practice history survives edits to the note content.
 *
 * Writing these per card would cost one write per answer — a 50-card session at
 * two sessions a day reaches the 20,000/day free write quota at around 200
 * users. Batch the whole session at the end instead.
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
