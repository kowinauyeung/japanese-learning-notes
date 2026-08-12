import type { Entry } from '@/domain/entry';
import type { PracticeSession } from '@/domain/practice';

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
export function sessionTime(finishedAt: string): string {
  const at = new Date(finishedAt);
  if (Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}
