import type { Entry } from '@/domain/entry';
import { PRACTICE_MODES } from '@/domain/practice';
import type { PracticeMode, PracticeSession } from '@/domain/practice';

/**
 * Reading a recorded session back, weeks after the drill that produced it.
 *
 * A session stores entry ids and a filter label, not the words themselves —
 * so everything here is the same resolution `membersOf` does for a 単語集, and
 * carries the same hazard: nothing prunes a session when a word it names is
 * deleted, and nothing should. The record of what was drilled on the day is
 * true whether or not the word still exists.
 */

/**
 * The words a session got wrong, in the order it recorded them.
 *
 * **An id with no entry behind it is dropped rather than rendered blank.** A
 * word answered wrong and then deleted keeps its id in `missed` forever, and a
 * history row is a sentence a person reads — a stray 「、」 with nothing either
 * side of it is worse than a shorter list.
 *
 * The count of what is shown therefore does not always equal `total - correct`.
 * That is deliberate: the score is what happened, and this is what is left of
 * it to look at.
 */
export function missedWords(session: PracticeSession, entries: readonly Entry[]): Entry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return session.missed.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
}

/**
 * The words currently answered wrong, in the notebook's own order.
 *
 * Resolved against `entries` rather than counted off the progress map, for the
 * reason the practice screen already counts them that way: a word answered
 * wrong and then deleted keeps its row, and 苦手な語 would otherwise offer a
 * list one longer than the drill it starts.
 */
export function weakWords(weakIds: ReadonlySet<string>, entries: readonly Entry[]): Entry[] {
  return entries.filter((entry) => weakIds.has(entry.id));
}

/**
 * 「6月24日 19:32」 — when a session finished, in the reader's own timezone.
 *
 * `finishedAt` is a server-clock instant precisely so that ordering and paging
 * are sound; it is displayed local because the person reading it wants to know
 * when *they* did the drill. Several sessions a day is the normal case, so the
 * time of day is what tells two rows apart.
 *
 * Deliberately not asserted anywhere: its output depends on the timezone the
 * suite runs in, and pinning that would change what every other date-rendering
 * test and screenshot means. It is an `Intl` call with no logic of its own.
 */
export function sessionTime(finishedAt: string, locale = 'ja-JP'): string {
  const at = new Date(finishedAt);
  if (Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

/**
 * How many sessions the dashboard reads to find the newest of each mode.
 *
 * A window, not a per-mode query, and the reason is that the per-mode query
 * needs a composite index on `(mode, finishedAt)`. The Firestore emulator does
 * **not** enforce composite indexes — it answers any query — so an integration
 * test would pass against the emulator and the query would fail in production
 * on an index nobody had deployed. `firestore.indexes.json` exists but is empty
 * and no script deploys it. A test that cannot tell the two apart is worse than
 * the limitation below.
 */
export const RECENT_WINDOW = 20;

/**
 * The most recent session of each mode, out of the window that was read.
 *
 * **Null does not always mean "never drilled".** A mode last practised more
 * than `RECENT_WINDOW` sessions ago falls out of the window and reads as
 * untouched. That is the cost of not needing an index, and it is bounded: it
 * takes twenty sessions of one mode without a single one of the other.
 *
 * Takes the sessions already ordered, because that is how `listSessions`
 * returns them — re-sorting here would hide a caller that had not.
 */
export function latestByMode(
  newestFirst: readonly PracticeSession[],
): Record<PracticeMode, PracticeSession | null> {
  const found = Object.fromEntries(PRACTICE_MODES.map((mode) => [mode, null])) as Record<
    PracticeMode,
    PracticeSession | null
  >;
  for (const session of newestFirst) {
    if (found[session.mode] === null) found[session.mode] = session;
  }
  return found;
}
