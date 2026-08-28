/**
 * The boundary between the app and whatever stores its data.
 *
 * Four rules keep this swappable, and they are the whole value of the file:
 *
 * 1. Nothing here may reference a vendor type. `src/infra/firebase` is the only
 *    place allowed to import `firebase/*`, enforced by ESLint.
 * 2. **Request/response only — no `subscribe()`.** Firestore may use listeners
 *    internally to observe its own write metadata, but no port exposes a live
 *    subscription. REST and SQL have no realtime equivalent, so a subscription
 *    on a port turns "write another adapter" into "rewrite the data flow". If
 *    realtime is ever wanted, add it as an explicit separate capability rather
 *    than folding it in here.
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

export interface EntryDashboardStats {
  ownerUid: string;
  total: number;
  countsByDay: Record<string, number>;
  jlptCounts: Record<string, number>;
  posCounts: Record<string, number>;
}

export interface EntryRepository {
  list(q: PageQuery): Promise<Page<Entry>>;
  dashboardStats(): Promise<EntryDashboardStats | null>;
  countLearnedSince(date: string): Promise<number>;
  recentLearned(limit: number): Promise<Entry[]>;
  listLearnedOn(day: string, q: PageQuery): Promise<Page<Entry>>;
  wordOfDay(seed: string): Promise<Entry | null>;
  get(id: string): Promise<Entry | null>;
  create(draft: EntryDraft): Promise<string>;
  update(id: string, draft: EntryDraft): Promise<void>;
  remove(id: string): Promise<void>;
  /** Waits until locally accepted writes have either reached durable storage or failed. */
  settlePendingWrites(): Promise<void>;
}

export interface WordSetRepository {
  list(q: PageQuery): Promise<Page<WordSet>>;
  get(id: string): Promise<WordSet | null>;
  create(draft: WordSetDraft): Promise<string>;
  update(id: string, draft: WordSetDraft): Promise<void>;
  remove(id: string): Promise<void>;
  /** Waits until locally accepted writes have either reached durable storage or failed. */
  settlePendingWrites(): Promise<void>;
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
  /** Waits until locally accepted writes have either reached durable storage or failed. */
  settlePendingWrites(): Promise<void>;
}

export interface UserRepository {
  get(uid: string): Promise<UserProfile | null>;
  save(uid: string, draft: UserProfileDraft): Promise<void>;
  remove(uid: string): Promise<void>;
  /**
   * Record that this account is gone, before anything is removed.
   *
   * Deleting the Auth user does not invalidate the ID tokens already minted for
   * it, and Firestore rules have no revocation check — so a second tab signed
   * in as the same uid keeps writing for up to an hour after the account and
   * its data are gone, and what it writes lands under a uid nothing will ever
   * issue a token for again. This is the one thing rules can see that the token
   * cannot carry.
   *
   * Must be safe to call twice: deletion is retried and is not atomic.
   */
  markDeleted(uid: string): Promise<void>;
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
  /**
   * The picture the provider has for this account, or empty when it has none.
   *
   * A URL rather than an image: every provider hosts these itself, and copying
   * one into Storage would mean owning a stale copy of a photo the user changes
   * somewhere else. Empty is the normal case, not an error — an account created
   * with an email link has no picture at all.
   */
  photoUrl: string;
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

/**
 * A new build is waiting to replace the one that is running.
 *
 * A port rather than a direct call into Workbox, for the same reason the
 * repositories above are: the mechanism is a service worker on the web and the
 * decision it drives — "offer the reader the new version" — is not about
 * service workers at all. The `e2e` build supplies an implementation that never
 * reports one, because that build has no worker to report it.
 */
export interface AppUpdatePort {
  /**
   * Calls `onWaiting` when a build has installed and is waiting for the running
   * one to step aside. Returns an unsubscribe function, like `AuthPort.onChange`.
   *
   * It may never fire. That is the ordinary case, not an error: most sessions
   * start and end on the same build.
   */
  onWaiting(fn: () => void): () => void;
  /**
   * Hand the session over to the waiting build.
   *
   * Resolves only in the sense that the request was made — the page is expected
   * to be replaced out from under the caller, so nothing should be sequenced
   * after this.
   */
  activate(): Promise<void>;
}

/**
 * Ask a model to draft a vocabulary entry, so the reader does not have to carry
 * a prompt to a chatbot and the answer back by hand.
 *
 * **It returns the model's text, not an `EntryDraft`, and that is deliberate.**
 * `jsonToDraft` already turns an assistant's reply into a draft or into a named
 * refusal, and it is the only thing that does. Parsing here would create a
 * second path into the form — one that a malformed reply could slip through
 * while the pasted one was refused. A reply that is wrong has to be wrong the
 * same way whichever route it arrived by, so both routes hand the same string
 * to the same function.
 *
 * A port rather than a call into the AI SDK from a component, for the reason
 * every other port here exists: the decision is "draft an entry from this
 * word", and which vendor answers is not part of it. The `e2e` build supplies
 * one that answers from a fixture, so the form can be exercised end to end
 * without a network, a key or a quota.
 */
export interface EntryDraftingPort {
  /**
   * True when this build can ask a model at all.
   *
   * Not every build or every reader has the capability: the `e2e` build stands
   * one in, and the Gemini API is not offered in every country. The caller uses
   * this to decide whether to show the button, because a button that is always
   * present and sometimes explains itself away is worse than one that is not
   * there — the manual prompt below it is the route in either case.
   */
  available(): boolean;
  /**
   * The model's reply, verbatim, for `jsonToDraft` to accept or refuse.
   *
   * Rejects with an `EntryDraftingError` rather than a bare `Error`, because
   * the four ways this fails need four different things said to the reader and
   * only one of them is worth a retry.
   */
  draft(prompt: string): Promise<string>;
}

/**
 * Why a drafting request did not produce text.
 *
 * `unavailable` covers the country where the API is not offered and the project
 * where it was never enabled — both are permanent for that reader, so the
 * message points at the manual prompt instead of inviting a retry.
 * `quota` is the allowance, which returns tomorrow. `blocked` is the model
 * declining to answer, which a different word may not trigger. `failed` is
 * everything else, including the network.
 */
export type EntryDraftingFailure = 'unavailable' | 'quota' | 'blocked' | 'failed';

export class EntryDraftingError extends Error {
  // Assigned in the body rather than declared as a parameter property, because
  // `erasableSyntaxOnly` is on: a parameter property is syntax that has to be
  // compiled away, and this project builds by erasing types and nothing else.
  readonly reason: EntryDraftingFailure;

  constructor(reason: EntryDraftingFailure) {
    super(`Entry drafting failed: ${reason}`);
    this.name = 'EntryDraftingError';
    this.reason = reason;
  }
}
