import type {
  EntryRepository,
  Page,
  PageQuery,
  ProgressRepository,
  WordSetRepository,
} from '@/domain/ports';

/**
 * Exporting everything, and deleting everything.
 *
 * Pure of React and of Firebase: it takes the ports and returns data, so the
 * page that renders a button does not also own the rule for what "everything"
 * means. That rule is the whole difficulty — see `drain`.
 */

export const EXPORT_SCHEMA_VERSION = 1;

export interface ExportBundle {
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  profile: unknown;
  entries: unknown[];
  wordSets: unknown[];
  progress: unknown[];
  practiceSessions: unknown[];
}

/** One page at a time, all of them. */
const PAGE = 100;

/**
 * Read every page, not the first one.
 *
 * This is the defect an export is most likely to ship with, because every
 * screen in the app is correct while reading one page: History shows the recent
 * sessions and says so. An export that stops at the first page is **wrong in a
 * way nobody can see** — the file downloads, opens, and looks complete.
 *
 * The guard is a page count rather than a timeout: a cursor that stops moving
 * would otherwise spin forever, and 10,000 pages is far past any real notebook.
 */
async function drain<T>(read: (q: PageQuery) => Promise<Page<T>>): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10_000; page += 1) {
    const result: Page<T> = await read({ limit: PAGE, cursor });
    all.push(...result.items);
    if (!result.cursor) return all;
    cursor = result.cursor;
  }
  throw new Error('エクスポートが終わりませんでした。時間をおいて再度お試しください。');
}

export async function exportEverything({
  appVersion,
  profile,
  entries,
  wordSets,
  progress,
  now = new Date(),
}: {
  appVersion: string;
  /**
   * The signed-in identity, passed in rather than read through a port: there is
   * no `UserRepository` adapter yet, and what a user would expect to find here
   * is the Google profile the app displays — which the caller already holds.
   */
  profile: unknown;
  entries: EntryRepository;
  wordSets: WordSetRepository;
  progress: ProgressRepository;
  now?: Date;
}): Promise<ExportBundle> {
  // Sequential, not Promise.all: this runs on a free quota and a burst of
  // parallel paged reads is the shape most likely to trip a rate limit, for a
  // saving nobody waiting on a download would notice.
  const entryList = await drain((q) => entries.list(q));
  const setList = await drain((q) => wordSets.list(q));
  const progressList = await progress.listAll();
  const sessions = await drain((q) => progress.listSessions(q));

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    appVersion,
    exportedAt: now.toISOString(),
    profile,
    entries: entryList,
    wordSets: setList,
    progress: progressList,
    practiceSessions: sessions,
  };
}

export function exportFilename(now = new Date()): string {
  return `goitei-export-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Delete everything this account owns, one document at a time.
 *
 * **Firestore does not cascade.** Deleting `users/{uid}` leaves every
 * subcollection under it addressable, so the only correct order is bottom-up:
 * the rows first, the parent last. Nothing here is atomic — a failure part way
 * leaves the account partly emptied, which is why it reports what it removed
 * and asks the user to run it again rather than claiming success.
 *
 * A Cloud Function doing this server-side is the shape Firebase recommends and
 * would make it recoverable. It needs the Blaze plan, and moving to Blaze
 * replaces "the service stops when quota runs out" with "the bill grows" — a
 * decision worth making on its own rather than as a side effect of adding a
 * delete button.
 */
export async function deleteEverything({
  entries,
  wordSets,
}: {
  entries: EntryRepository;
  wordSets: WordSetRepository;
}): Promise<{ entries: number; wordSets: number }> {
  const setList = await drain((q) => wordSets.list(q));
  for (const set of setList) await wordSets.remove(set.id);

  const entryList = await drain((q) => entries.list(q));
  for (const entry of entryList) await entries.remove(entry.id);

  return { entries: entryList.length, wordSets: setList.length };
}
