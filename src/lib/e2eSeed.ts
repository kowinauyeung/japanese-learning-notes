import type { Entry } from '@/domain/entry';
import type { PracticeSession } from '@/domain/practice';
import type { UserProfile } from '@/domain/user';
import type { WordSet } from '@/domain/wordSet';

export interface E2ESeed {
  /** Start already signed in, skipping the login screen. */
  signedIn?: boolean;
  /**
   * Checked-in seed literals should still be entry-shaped, even though the
   * runtime adapter sanitises them before use.
   */
  entries?: Partial<Entry>[];
  /** Entry ids to start marked wrong, so 苦手のみ has something to select. */
  weak?: string[];
  /** Checked-in 単語集 seed literals should stay word-set-shaped. */
  wordSets?: Partial<WordSet>[];
  /** Keep a word-set write in flight long enough to exercise the busy gate. */
  wordSetWriteDelayMs?: number;
  /** Finished sessions, so 履歴 can be reached without drilling first. */
  sessions?: Partial<PracticeSession>[];
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
  /** Put a waiting build on screen, so `UpdatePrompt` can be laid out against. */
  updateWaiting?: boolean;
}
