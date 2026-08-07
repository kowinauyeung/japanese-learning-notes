/**
 * The boundary between the app and whatever stores its data.
 *
 * Four rules keep this swappable, and they are the whole value of the file:
 *
 * 1. Nothing here may reference a vendor type. `src/infra/firebase` is the only
 *    place allowed to import `firebase/*`, enforced by ESLint.
 * 2. **Request/response only — no `subscribe()`.** `onSnapshot` is currently
 *    used zero times, and that is worth keeping deliberately: REST and SQL have
 *    no realtime equivalent, so a subscription on a port turns "write another
 *    adapter" into "rewrite the data flow". If realtime is ever wanted, add it
 *    as an explicit separate capability rather than folding it in here.
 * 3. Cursors are opaque strings. A `DocumentSnapshot` on a signature would leak
 *    Firestore's pagination model into every caller.
 * 4. No use-case or service layer on top. React hooks are the application
 *    layer; another one would only add typing.
 */

import type { Entry, EntryDraft, JlptLevel, Pos } from './entry';
import type { EntryProgress, PracticeSession } from './practice';
import type { PublicEntry, PublicSet } from './publication';
import type { UserProfile, UserProfileDraft } from './user';
import type { WordSet, WordSetDraft } from './wordSet';

export interface Page<T> {
  items: T[];
  /** Null when there is nothing after this page. */
  cursor: string | null;
}

export interface PageQuery {
  limit: number;
  cursor: string | null;
}

export interface EntryRepository {
  list(q: PageQuery): Promise<Page<Entry>>;
  get(id: string): Promise<Entry | null>;
  create(draft: EntryDraft): Promise<string>;
  update(id: string, draft: EntryDraft): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface WordSetRepository {
  list(q: PageQuery): Promise<Page<WordSet>>;
  get(id: string): Promise<WordSet | null>;
  create(draft: WordSetDraft): Promise<string>;
  update(id: string, draft: WordSetDraft): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ProgressRepository {
  listAll(): Promise<EntryProgress[]>;
  /** One write for a whole session, never one per card. */
  recordSession(session: PracticeSession, progress: EntryProgress[]): Promise<void>;
  listSessions(q: PageQuery): Promise<Page<PracticeSession>>;
}

export interface UserRepository {
  get(uid: string): Promise<UserProfile | null>;
  save(uid: string, draft: UserProfileDraft): Promise<void>;
}

/**
 * Publishing, unpublishing and adopting.
 *
 * Publish and republish are the same operation: overwrite the snapshot and bump
 * its version. Adopt never touches the source.
 */
export interface PublicationRepository {
  publishEntry(entryId: string): Promise<string>;
  unpublishEntry(entryId: string): Promise<void>;
  adoptEntry(publicEntryId: string): Promise<string>;

  publishSet(setId: string): Promise<string>;
  unpublishSet(setId: string): Promise<void>;
  adoptSet(publicSetId: string): Promise<string>;
}

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

export interface AuthPort {
  current(): AuthUser | null;
  /** Returns an unsubscribe function. */
  onChange(fn: (user: AuthUser | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

// ------------------------------------------------------------------- search

export interface SearchQuery {
  text: string;
  filters: {
    jlpt?: JlptLevel[];
    pos?: Pos[];
    tags?: string[];
    topics?: string[];
  };
  /**
   * The hinge of the whole design. `'mine'` is answerable in memory over the
   * user's own entries, which is what ships today. `'public'` needs a real
   * index — Firestore has no substring or full-text search — so the UI is
   * written once against this port and the public path lights up when an
   * OpenSearch/Typesense/Algolia adapter exists, with no component changes.
   */
  scope: 'mine' | 'public';
  limit: number;
  cursor: string | null;
}

export interface SearchHit<T> {
  item: T;
  score: number;
}

export interface SearchPort {
  entries(q: SearchQuery): Promise<Page<SearchHit<Entry | PublicEntry>>>;
  sets(q: SearchQuery): Promise<Page<SearchHit<PublicSet>>>;
  /** False means the UI hides that tab rather than showing an empty state. */
  supports(scope: SearchQuery['scope']): boolean;
}
