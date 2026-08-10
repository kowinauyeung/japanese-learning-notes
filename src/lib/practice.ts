import type { Entry } from '@/domain/entry';
import type { EntryProgress, PracticeMode, PracticeSessionDraft } from '@/domain/practice';

/**
 * Everything a practice session is decided by, before any of it is rendered.
 *
 * Kept apart from `lib/filters.ts` on purpose. Browse filters answer "which
 * words do I want to look at" and grew a search box, date range, 頻度 floor and
 * a sort order to do it; a session only needs "which words am I drilling", and
 * folding the two would put a sort order on something that is deliberately
 * shuffled and a 苦手のみ toggle on a list that has no notion of practice.
 */
export interface PracticeFilters {
  tags: string[];
  jlpt: string[];
  /** Only entries whose most recent attempt was wrong. */
  weakOnly: boolean;
}

export const EMPTY_PRACTICE_FILTERS: PracticeFilters = { tags: [], jlpt: [], weakOnly: false };

/**
 * 苦手な語 is the *most recent* attempt, never an accumulated ratio: answering
 * a word correctly today has to clear it, or the list only ever grows and stops
 * describing what the learner still gets wrong.
 */
export function weakIdsOf(progress: readonly EntryProgress[]): Set<string> {
  return new Set(progress.filter((row) => row.status === 'wrong').map((row) => row.entryId));
}

/**
 * Same combination rule as Browse: different filters AND, chips within one
 * filter OR. Two tags means "either tag", because a word normally has one.
 */
export function matchesPractice(
  entry: Entry,
  filters: PracticeFilters,
  weak: ReadonlySet<string>,
): boolean {
  if (filters.tags.length && !filters.tags.some((tag) => entry.tags.includes(tag))) return false;
  if (filters.jlpt.length && !filters.jlpt.includes(entry.jlpt)) return false;
  if (filters.weakOnly && !weak.has(entry.id)) return false;
  return true;
}

/**
 * Fisher–Yates, with the source of randomness passed in.
 *
 * `Math.random()` inside would make the queue order untestable, and the order
 * is the entire point of a shuffle: an implementation that only ever moved the
 * first element would look fine in a browser and be a broken drill.
 */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

/**
 * The human-readable label stored on the session, e.g. 「#仕事 / N1 / 苦手のみ」.
 *
 * Stored rather than recomputed because 履歴 has to keep describing a session
 * after the tag it was filtered by has been renamed or deleted.
 */
export function describeFilters(filters: PracticeFilters): string {
  const parts = [
    ...filters.tags.map((tag) => `#${tag}`),
    ...filters.jlpt,
    ...(filters.weakOnly ? ['苦手のみ'] : []),
  ];
  return parts.length ? parts.join(' / ') : 'すべての語';
}

export interface Answer {
  entryId: string;
  correct: boolean;
}

/**
 * Folds a session's answers into the progress rows it touched, and returns
 * only those rows.
 *
 * Returning the full map instead would make every session overwrite every
 * entry, which is how a session finished on a phone silently reverts one
 * finished on a laptop a minute earlier.
 */
export function mergeProgress(
  existing: readonly EntryProgress[],
  answers: readonly Answer[],
  mode: PracticeMode,
  at: string,
): EntryProgress[] {
  const byId = new Map(existing.map((row) => [row.entryId, row]));
  const touched = new Map<string, EntryProgress>();

  for (const answer of answers) {
    const previous = touched.get(answer.entryId) ?? byId.get(answer.entryId);
    touched.set(answer.entryId, {
      entryId: answer.entryId,
      status: answer.correct ? 'correct' : 'wrong',
      lastMode: mode,
      lastAt: at,
      attempts: (previous?.attempts ?? 0) + 1,
      correctCount: (previous?.correctCount ?? 0) + (answer.correct ? 1 : 0),
    });
  }

  return [...touched.values()];
}

export function summariseSession(input: {
  mode: PracticeMode;
  filterLabel: string;
  answers: readonly Answer[];
  startedAt: string;
}): PracticeSessionDraft {
  return {
    mode: input.mode,
    filterLabel: input.filterLabel,
    total: input.answers.length,
    correct: input.answers.filter((answer) => answer.correct).length,
    missed: input.answers.filter((answer) => !answer.correct).map((answer) => answer.entryId),
    startedAt: input.startedAt,
  };
}
