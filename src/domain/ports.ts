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
import type { EntryProgress, PracticeSession, PracticeSessionDraft } from './practice';
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

/**
 * Practice state, and the one port whose cost model is part of its contract.
 *
 * `listAll` returns every entry's progress and `recordSession` takes only the
 * rows a session touched, because **the whole map is expected to be one
 * document**. Firestore bills per document, not per round trip, so a
 * `writeBatch` of fifty per-entry documents is still fifty writes: batching
 * saves latency and atomicity, not quota. A 50-card session therefore costs two
 * writes here — the progress map and the session record — instead of 51, and
 * loading the 苦手な語 count costs one read instead of one per word.
 *
 * What that trades away is a per-entry query, which nothing wants: the caller
 * already holds every entry in memory. And the map has a ceiling — Firestore
 * caps a document at 1 MiB, roughly 15,000 entries at this shape. That is far
 * beyond the point at which `EntriesProvider` loading the whole notebook has
 * already had to change.
 *
 * `data-model-redesign.md` specifies `users/{uid}/entryProgress/{entryId}`.
 * This deviates from it deliberately; the doc records the change.
 */
export interface ProgressRepository {
  listAll(): Promise<EntryProgress[]>;
  /**
   * Writes the session and merges `progress` into the map, in that one call.
   * Pass only the entries the session answered — anything omitted is left as
   * it was, so a session on another device is not clobbered.
   */
  recordSession(session: PracticeSessionDraft, progress: EntryProgress[]): Promise<string>;
  listSessions(q: PageQuery): Promise<Page<PracticeSession>>;
  /**
   * Everything this port owns, gone: the progress map and every session.
   *
   * One method rather than a delete per row because the two are one concept to
   * the caller — "the practice history" — and because the map is a single
   * document while the sessions are a collection, which is an asymmetry the
   * caller has no reason to know about.
   */
  removeAll(): Promise<void>;
}

export interface UserRepository {
  get(uid: string): Promise<UserProfile | null>;
  save(uid: string, draft: UserProfileDraft): Promise<void>;
  remove(uid: string): Promise<void>;
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
  /**
   * Must delete the snapshot's entries **before** the set document itself.
   *
   * Firestore does not cascade: deleting a parent leaves its subcollection in
   * place, and those documents stay addressable by anyone who noted the set id.
   * The rules refuse to read a snapshot entry whose parent is gone, so a
   * half-finished unpublish fails closed rather than leaking — but that is a
   * backstop for a crash, not permission to rely on it.
   */
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
  /**
   * Prove the session is current, before anything irreversible depends on it.
   *
   * Providers refuse a sensitive operation on a stale session, and `deleteAccount`
   * is one — so a deletion that runs the data first and the account last will,
   * on an old-enough session, succeed at every irreversible step and fail at the
   * one that needed proving. The user is then left with an account and no data.
   *
   * Calling this first moves that failure to the front, where it costs a
   * re-authentication prompt instead of everything the account had.
   */
  reauthenticate(): Promise<void>;
  /**
   * Delete the account itself, not just its data.
   *
   * Providers generally refuse this on a stale session — Firebase raises
   * `auth/requires-recent-login` — so a caller has to be prepared to ask the
   * user to sign in again rather than treating a failure as fatal. The port
   * says so here because the alternative is every caller discovering it from a
   * support ticket.
   */
  deleteAccount(): Promise<void>;
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
