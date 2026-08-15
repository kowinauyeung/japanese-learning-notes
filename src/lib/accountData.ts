import type {
  AuthPort,
  EntryRepository,
  Page,
  PageQuery,
  ProgressRepository,
  UserRepository,
  WordSetRepository,
} from '@/domain/ports';

/**
 * Exporting everything, and deleting everything.
 *
 * Pure of React and of Firebase: it takes the ports and returns data, so the
 * page that renders a button does not also own the rule for what "everything"
 * means. That rule is the whole difficulty — see `drain`.
 */

export const EXPORT_SCHEMA_VERSION = 2;

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
/**
 * One literal, because `deleteEverything` drains as well — so this string is
 * already reachable from a path it does not describe. Two copies would drift,
 * and the copy that drifts is the one nobody is looking at.
 */
const WALK_STOPPED = 'エクスポートが終わりませんでした。時間をおいて再度お試しください。';

async function drain<T>(read: (q: PageQuery) => Promise<Page<T>>): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  // A cursor already handed out means the walk is not advancing. Recognising
  // that is the guard; the page count below is only a backstop.
  //
  // It used to be the other way round, and the cost of that was the whole
  // point: a stuck cursor ran the loop to its 10,000-page limit at 100 records
  // a page, so the failure mode of "this query stopped moving" was a million
  // document reads — twenty times the free daily allowance, spent proving
  // something the second page already showed. Worse, `deleteEverything` drains
  // twice too, so it was reachable from the delete button as well as from
  // export.
  const seen = new Set<string>();
  for (let page = 0; page < 10_000; page += 1) {
    const result: Page<T> = await read({ limit: PAGE, cursor });
    all.push(...result.items);
    if (!result.cursor) return all;
    if (seen.has(result.cursor)) throw new Error(WALK_STOPPED);
    seen.add(result.cursor);
    cursor = result.cursor;
  }
  throw new Error(WALK_STOPPED);
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
   * The signed-in identity and persisted settings. The caller already holds
   * both, so exporting them does not spend another Firestore read.
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
 * Delete everything this account owns, one document at a time, then the account.
 *
 * **Firestore does not cascade**, and this function deliberately does not
 * delete `users/{uid}`, because that document does not exist. Nothing writes
 * it: the three adapters address subcollections only, `UserRepository` has no
 * adapter, and `firestore.rules` allows the client `read, delete` on the path
 * and nothing else — so there is no code path, here or in `migration/`, that
 * could bring one into being. Deleting a document that was never created is a
 * write billed for nothing.
 *
 * That is an invariant, not an observation, and it is the reason there is no
 * parent step below. If a profile is ever added, `create, update` come back to
 * that rule — and this function grows a last step, after the rows, because a
 * parent removed first leaves every subcollection under it addressable.
 *
 * Nothing here is atomic. A failure part way leaves the account partly emptied,
 * which is why it reports what it removed and asks the user to run it again
 * rather than claiming success.
 *
 * **All four collections, and the account.** An earlier version drained words
 * and word sets and stopped, while the button, the dialog and the privacy
 * policy all promised more — so "deleting the account" signed the user out and
 * left their practice history for the next sign-in with the same Google
 * account. Practice records are the sensitive half: a session carries the ids
 * it got wrong and a label built from the user's own tag names.
 *
 * The account itself goes last, because it is the one step that cannot be
 * retried: once it is gone there is no session left to delete anything with.
 *
 * A Cloud Function doing this server-side is the shape Firebase recommends and
 * would make it recoverable. It needs the Blaze plan, and moving to Blaze
 * replaces "the service stops when quota runs out" with "the bill grows" — a
 * decision worth making on its own rather than as a side effect of adding a
 * delete button.
 */
/**
 * The session could not be proved, so **nothing was deleted**.
 *
 * This exists because the caller was inferring that from a provider error code
 * and could not. `auth/requires-recent-login` is the clearest case: it is
 * `CREDENTIAL_TOO_OLD_LOGIN_AGAIN`, which the backend returns for a *sensitive
 * operation* — here `deleteAccount()`, the last statement below. Reading it as
 * "the re-authentication was refused" inverts the truth exactly: by the time it
 * can be raised, every word set, entry, session and the progress map are gone.
 *
 * `reauthenticateWithPopup` raises `auth/user-mismatch`, `auth/popup-blocked`
 * and the cancellation codes; `authAdapter` can also throw with no `code` at
 * all. That list is provider-defined and moves between SDK versions. This
 * function is the only place that knows which half it got through, so it says
 * so and the caller stops guessing.
 */
export class NothingDeleted extends Error {
  /** What the provider actually raised, for the console. */
  readonly reason: unknown;

  constructor(reason: unknown) {
    super('reauthentication failed, so nothing was deleted');
    this.name = 'NothingDeleted';
    this.reason = reason;
  }
}

export async function deleteEverything({
  entries,
  wordSets,
  progress,
  userProfiles,
  uid,
  auth,
}: {
  entries: EntryRepository;
  wordSets: WordSetRepository;
  progress: ProgressRepository;
  userProfiles: UserRepository;
  uid: string;
  auth: AuthPort;
}): Promise<{ entries: number; wordSets: number }> {
  // **First, and before anything irreversible.**
  //
  // The order below — data, then the account — is deliberate and stays: delete
  // the account first and there is no session left to delete the data with.
  // What that order cannot survive is the provider refusing the last step. On a
  // session old enough for `auth/requires-recent-login`, every destructive write
  // succeeded and only the account remained, so a user who pressed delete was
  // left with an account holding nothing and a message telling them some of it
  // was already gone.
  //
  // Proving the session up front costs a popup and moves that failure to the
  // one place where nothing has happened yet.
  try {
    await auth.reauthenticate();
  } catch (cause) {
    throw new NothingDeleted(cause);
  }

  const setList = await drain((q) => wordSets.list(q));
  for (const set of setList) await wordSets.remove(set.id);

  const entryList = await drain((q) => entries.list(q));
  for (const entry of entryList) await entries.remove(entry.id);

  // The progress map and every session, which the count above does not cover:
  // the map is one document and the sessions are a collection, and neither is
  // something a user thinks of as a row.
  await progress.removeAll();

  // Firestore does not cascade. The parent profile comes after every
  // subcollection, but before Auth removes the identity needed to retry it.
  await userProfiles.remove(uid);

  // Last, and separately fallible: providers refuse this on a stale session.
  await auth.deleteAccount();

  return { entries: entryList.length, wordSets: setList.length };
}
