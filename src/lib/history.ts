import type { Entry } from '@/domain/entry';
import { PRACTICE_MODES } from '@/domain/practice';
import type { MissedWord, PracticeMode, PracticeSession } from '@/domain/practice';

/**
 * Reading a recorded session back, weeks after the drill that produced it.
 *
 * Nothing prunes a session when a word it names is deleted, and nothing should:
 * the record of what was drilled on the day is true whether or not the word
 * still exists. What used to undermine that is that a row could only be *drawn*
 * by resolving its id against today's notebook, so deleting a word did rewrite
 * the history that named it. `MissedWord` carries a copy of the headword for
 * exactly that case.
 */

/**
 * One word a session recorded, in one of the two states it can be read back in.
 *
 * `entry` and not the snapshot when the word survives, deliberately: the
 * snapshot is a fallback for lost data, not an override of live data. A word
 * that still exists is the same word, so the row shows what the notebook says
 * about it now and links to it exactly as it always has.
 */
export type WordRow =
  | { kind: 'entry'; entry: Entry }
  | { kind: 'deleted'; entryId: string; headword: string; reading: string };

/**
 * One recorded word against the notebook as it stands now.
 *
 * A snapshot with no headword resolves to nothing rather than to a blank row,
 * and that is the *only* thing dropped anywhere on this screen: it means a
 * session written before the snapshot existed, naming a word since deleted,
 * where there is genuinely nothing left to print. A history row is a sentence
 * a person reads, and a stray 「、」 with nothing either side of it is worse
 * than a shorter list.
 */
function resolve(word: MissedWord, byId: Map<string, Entry>): WordRow | null {
  const entry = byId.get(word.entryId);
  if (entry) return { kind: 'entry', entry };
  if (!word.headword) return null;
  return { kind: 'deleted', entryId: word.entryId, headword: word.headword, reading: word.reading };
}

const index = (entries: readonly Entry[]) => new Map(entries.map((entry) => [entry.id, entry]));

/**
 * The words a session got wrong, in the order it recorded them.
 *
 * For anything recorded from now on the length equals `total - correct`; for
 * the sessions that predate the snapshot it still may not, because a deleted
 * word leaves nothing behind to draw.
 */
export function missedWords(session: PracticeSession, entries: readonly Entry[]): WordRow[] {
  const byId = index(entries);
  return session.missed.flatMap((word) => {
    const row = resolve(word, byId);
    return row ? [row] : [];
  });
}

/**
 * Every card the session dealt, in the order it dealt them — or null.
 *
 * **Null means the session never recorded its run**, not that it dealt nothing.
 * Only the wrong answers were written down before `PractisedWord` existed, so
 * there is no full list to show and no way to reconstruct one; the dialog
 * leaves the section out rather than printing the missed words under a heading
 * that claims to be the whole drill.
 */
export function practisedWords(
  session: PracticeSession,
  entries: readonly Entry[],
): (WordRow & { correct: boolean })[] | null {
  if (session.words === null) return null;
  const byId = index(entries);
  return session.words.flatMap((word) => {
    const row = resolve(word, byId);
    return row ? [{ ...row, correct: word.correct }] : [];
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
