import type { Entry } from '@/domain/entry';
import type { PracticeSession } from '@/domain/practice';
import type { UserProfile } from '@/domain/user';
import type { WordSet } from '@/domain/wordSet';

export type SeedEntry = Pick<Entry, 'id'> & Partial<Entry>;
export type SeedWordSet = Pick<WordSet, 'id'> & Partial<WordSet>;
export type SeedSession = Pick<PracticeSession, 'id'> & Partial<PracticeSession>;

export interface E2ESeed {
  /** Start already signed in, skipping the login screen. */
  signedIn?: boolean;
  /**
   * Checked-in seed literals should still be entry-shaped, even though the
   * runtime adapter sanitises them before use.
   */
  entries?: SeedEntry[];
  /** Entry ids to start marked wrong, so 苦手のみ has something to select. */
  weak?: string[];
  /** Checked-in 単語集 seed literals should stay word-set-shaped. */
  wordSets?: SeedWordSet[];
  /** Keep a word-set write in flight long enough to exercise the busy gate. */
  wordSetWriteDelayMs?: number;
  /** Finished sessions, so 履歴 can be reached without drilling first. */
  sessions?: SeedSession[];
  /** Raw persisted profile; absent means first sign-in. */
  profile?: Partial<UserProfile>;
  /**
   * `unreachable` rejects with Firestore's `unavailable`, which is what a
   * settings save produces when the backend cannot be reached — the save is a
   * transaction, and a transaction cannot be queued. Named for what the client
   * saw, not for a cause: the same code arrives whether the device dropped off
   * the network or the service did.
   */
  settingsSave?: 'fail' | 'defer' | 'unreachable';
  /** Fail the profile re-read that follows a committed save, and only that one. */
  settingsRefresh?: 'fail';
  /**
   * Fails an entry `create`/`update`. `denied` carries Firestore's own
   * `permission-denied`, so `EntryFormModal` renders the account-denial
   * sentence rather than the generic 保存できませんでした. `unreachable`
   * mirrors `settingsSave`'s branch of the same name.
   */
  entrySave?: 'denied' | 'unreachable';
  /**
   * Fails the entry page this account's export walk reads first. `denied`
   * carries `permission-denied`; `unreachable` carries `unavailable`, so
   * `Account.tsx` renders export wording rather than `settingsSave`'s save
   * wording for the same code. See the comment on `entryRepositoryFor`'s
   * `list` for why this does not also break the notebook itself.
   */
  accountExport?: 'denied' | 'unreachable';
  /**
   * Rejects the named provider's read with Firestore's `unavailable` while
   * `navigator.onLine` is false, and lets it through once true. Models the one
   * thing a reconnect retry (#84) needs to observe: a read that failed because
   * the network was down, and would succeed if asked again now that it is not.
   *
   * Independent of `entrySave`/`progressLoad`/`accountExport`, which fail
   * unconditionally — a retry against one of those would just repeat the same
   * rejection, which is a different claim from this one.
   */
  failWhileOffline?: Array<'entries' | 'progress' | 'wordSets' | 'settings'>;
  /**
   * Hold the notebook's successful read open this long before resolving it.
   *
   * Only for the read that actually succeeds — `failWhileOffline`'s rejection
   * is unaffected — so this exists to make a reconnect retry (#84) slow enough
   * to observe: `EntriesProvider.refresh` used to clear its error before the
   * new read landed, and against the in-memory adapter's usual same-tick
   * resolution that gap is too fast for a spec to see.
   */
  entriesReadDelayMs?: number;
  /**
   * Fails the progress read `ProgressProvider` makes on sign-in. `denied`
   * carries `permission-denied`, `unreachable` carries `unavailable` — the two
   * codes `PracticeSetup`'s 苦手のみ row must tell apart rather than collapsing
   * to one hard-coded sentence (#24). Independent of `entries`, so the setup
   * screen still renders: a full lockout fails that read too and `Practice.tsx`
   * returns its own message first, which is why this needs its own seed.
   */
  progressLoad?: 'denied' | 'unreachable';
  /** Put a waiting build on screen, so `UpdatePrompt` can be laid out against. */
  updateWaiting?: boolean;
  /**
   * Make the drafting port refuse, with the reason it refuses for.
   *
   * Four reasons rather than a boolean because the panel says something
   * different for each, and only one of them is worth a retry.
   * **`unavailable` also stops the port reporting itself available**, matching
   * the real adapter: a retired model or a project with the API off fails on
   * the first call and never succeeds after it, so the button goes rather than
   * offering to try again forever.
   */
  entryDrafting?: 'unavailable' | 'quota' | 'blocked' | 'failed';
}
