import type { Entry, EntryDraft } from '@/domain/entry';
import type {
  AppUpdatePort,
  AuthPort,
  AuthUser,
  EntryRepository,
  Page,
  PageQuery,
  ProgressRepository,
  UserRepository,
  WordSetRepository,
} from '@/domain/ports';
import type { EntryProgress, PracticeSession, PracticeSessionDraft } from '@/domain/practice';
import type { UserProfile, UserProfileDraft } from '@/domain/user';
import type { WordSet, WordSetDraft } from '@/domain/wordSet';
import { sanitizeEntry, sanitizeSession, sanitizeWordSet } from './sanitize';

/**
 * In-memory adapters for the end-to-end build, and nothing else.
 *
 * `vite build --mode e2e` aliases `./backend` to this module, so a normal build
 * cannot resolve it: no flag is read at runtime, no branch survives into the
 * production bundle, and there is no configuration a real deploy could get
 * wrong. Nothing in `src/` outside this file knows it exists.
 *
 * These are substitutes for a *port*, not mocks of our own code — the seam is
 * one the architecture already has. What that buys is determinism: no emulator
 * to boot, no Google popup to drive, and no IndexedDB left behind between
 * tests. What it costs is that Playwright proves nothing about Firestore, which
 * is deliberate — the adapter is covered in tests/integration and the rules in
 * tests/rules, both against a real emulator, and neither needs a browser.
 */

interface Seed {
  /** Start already signed in, skipping the login screen. */
  signedIn?: boolean;
  /** Raw documents, coerced through the same sanitiser the real read path uses. */
  entries?: unknown[];
  /** Entry ids to start marked wrong, so 苦手のみ has something to select. */
  weak?: string[];
  /** Raw 単語集 documents. Nothing in the app creates one yet. */
  wordSets?: unknown[];
  /** Test-only network latency used to make concurrent-write guards observable. */
  wordSetWriteDelayMs?: number;
  /** Finished sessions, so 履歴 can be reached without drilling first. */
  sessions?: unknown[];
  /** Raw persisted profile; absent means first sign-in. */
  profile?: unknown;
  /** Force the next settings write to fail so the localized error path is reachable. */
  settingsSave?: 'fail' | 'defer' | 'offline';
  settingsRefresh?: 'fail';
  updateWaiting?: boolean;
}

declare global {
  interface Window {
    __GOITEI_E2E__?: Seed;
    __GOITEI_E2E_READS__?: Record<'entries' | 'progress' | 'wordSets', number>;
    __GOITEI_E2E_RELEASE_SETTINGS_SAVE__?: () => void;
  }
}

const seed = (): Seed => (typeof window === 'undefined' ? {} : (window.__GOITEI_E2E__ ?? {}));

function countRead(store: 'entries' | 'progress' | 'wordSets'): void {
  if (typeof window === 'undefined') return;
  const reads = (window.__GOITEI_E2E_READS__ ??= { entries: 0, progress: 0, wordSets: 0 });
  reads[store] += 1;
}

const E2E_USER: AuthUser = {
  uid: 'e2e-user',
  email: 'e2e@example.test',
  displayName: 'テスト太郎',
  // No picture, so the substitute exercises the fallback. A URL here would be
  // a request to a host Playwright cannot reach, and the visual baselines would
  // then be a screenshot of a broken image.
  photoUrl: '',
  emailVerified: true,
};

/**
 * State survives a reload, because the thing it stands in for does.
 *
 * A plain module-level store is emptied by `page.goto`, so a spec that saves a
 * word and then navigates would find it gone — a failure produced entirely by
 * the substitute, describing nothing about the app. Firestore persists and the
 * Firebase session is restored, so this persists too. sessionStorage rather
 * than localStorage keeps each Playwright context isolated for free.
 */
const PERSIST_KEY = 'goitei.e2e';

function load<T>(slot: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(`${PERSIST_KEY}.${slot}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function save(slot: string, value: unknown): void {
  try {
    sessionStorage.setItem(`${PERSIST_KEY}.${slot}`, JSON.stringify(value));
  } catch {
    // Storage disabled or full: the run degrades to per-page state rather than
    // failing, which is still correct for every spec that does not reload.
  }
}

// ---------------------------------------------------------------------- auth

let currentUser: AuthUser | null = load('user', seed().signedIn ? E2E_USER : null);
const listeners = new Set<(user: AuthUser | null) => void>();

const notify = () => {
  save('user', currentUser);
  for (const listener of listeners) listener(currentUser);
};

/**
 * There is no worker in this build — `VitePWA` is disabled under `mode === 'e2e'`
 * — so there is nothing that could ever be waiting. This is the honest
 * implementation of that, not a stub standing in for one: a build with no
 * service worker genuinely never has a new build installed behind it.
 */
export const appUpdatePort: AppUpdatePort = {
  onWaiting(fn) {
    // A real port, not a stub: it reports a waiting build when the seed says
    // one is waiting, and reports nothing otherwise. Without it `UpdatePrompt`
    // can never be on screen in an end-to-end run, and a claim about how it
    // shares the bottom of the viewport with `OfflineNotice` has nothing to
    // measure.
    if (!seed().updateWaiting) return () => {};
    // Asynchronously, because the real port learns of a waiting build from the
    // service worker registration and never from the render that subscribed.
    const timer = setTimeout(fn, 0);
    return () => clearTimeout(timer);
  },
  activate: () => Promise.resolve(),
};

export const authPort: AuthPort = {
  current: () => currentUser,
  onChange(fn) {
    listeners.add(fn);
    // Firebase reports the restored session asynchronously, and `AuthProvider`
    // leaves `loading` true until it does. Calling back synchronously here
    // would hide a missing loading state that the real adapter would expose.
    queueMicrotask(() => {
      fn(currentUser);
    });
    return () => {
      listeners.delete(fn);
    };
  },
  signIn: () => {
    currentUser = E2E_USER;
    notify();
    return Promise.resolve();
  },
  signOut: () => {
    currentUser = null;
    notify();
    return Promise.resolve();
  },
  // The real adapter opens a popup here. The fake resolves, for the same reason
  // it never refuses `deleteAccount`: the end-to-end suite has no way to age a
  // session, and a test that cannot reach the happy path covers nothing.
  reauthenticate: () => Promise.resolve(),
  deleteAccount(): Promise<void> {
    currentUser = null;
    notify();
    return Promise.resolve();
  },
};

// --------------------------------------------------------------- user profile

const profileStores = new Map<string, UserProfile>();

function persistedProfile(uid: string): UserProfile | null {
  const existing = profileStores.get(uid);
  if (existing) return existing;
  const persisted = load<UserProfile | null>(`profile.${uid}`, null);
  if (persisted) {
    profileStores.set(uid, persisted);
    return persisted;
  }
  const raw = seed().profile;
  if (typeof raw !== 'object' || raw === null) return null;
  const now = new Date().toISOString();
  const record = raw as Partial<UserProfile>;
  const profile: UserProfile = {
    uid,
    nickname: typeof record.nickname === 'string' ? record.nickname : '',
    language: record.language ?? 'en',
    translationLanguage: record.translationLanguage ?? 'en',
    theme: record.theme ?? 'system',
    createdAt: now,
    updatedAt: now,
  };
  profileStores.set(uid, profile);
  return profile;
}

/** Set once a save has committed, so the refresh that follows it can be failed. */
let settingsSaved = false;

export const userRepository: UserRepository = {
  get(uid): Promise<UserProfile | null> {
    // Fails only the read that follows a committed save, which is the whole
    // point: the transaction succeeded and the profile is durable, and the
    // question is what the interface says about it.
    if (seed().settingsRefresh === 'fail' && settingsSaved) {
      return Promise.reject(
        Object.assign(new Error('Failed to get document because the client is offline.'), {
          code: 'unavailable',
        }),
      );
    }
    return Promise.resolve(persistedProfile(uid));
  },
  save(uid, draft: UserProfileDraft): Promise<void> {
    if (seed().settingsSave === 'fail') return Promise.reject(new Error('settings save failed'));
    // Carries Firestore's own code, because that string is the entire input to
    // the branch under test. The real save is a `runTransaction`, and a
    // transaction is the one write that does not survive being offline:
    // measured against the emulator with the socket cut, it rejects with
    // `unavailable` after six to ten seconds of retries.
    if (seed().settingsSave === 'offline') {
      return Promise.reject(
        Object.assign(new Error('Failed to get document because the client is offline.'), {
          code: 'unavailable',
        }),
      );
    }
    if (seed().settingsSave === 'defer') {
      return new Promise((resolve) => {
        window.__GOITEI_E2E_RELEASE_SETTINGS_SAVE__ = () => {
          persistProfile(uid, draft);
          delete window.__GOITEI_E2E_RELEASE_SETTINGS_SAVE__;
          resolve();
        };
      });
    }
    persistProfile(uid, draft);
    settingsSaved = true;
    return Promise.resolve();
  },
  remove(uid): Promise<void> {
    profileStores.delete(uid);
    save(`profile.${uid}`, null);
    return Promise.resolve();
  },
};

function persistProfile(uid: string, draft: UserProfileDraft): void {
  const existing = persistedProfile(uid);
  const now = new Date().toISOString();
  const profile: UserProfile = {
    ...draft,
    uid,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  profileStores.set(uid, profile);
  save(`profile.${uid}`, profile);
}

// --------------------------------------------------------------- entry store

/** Keyed by uid so the store survives the provider remounting. */
const stores = new Map<string, Map<string, Entry>>();
let sequence = 0;
const nextId = () => `e2e-entry-${++sequence}`;

/** Mirrors the adapter's `orderBy('createdAt','desc'), orderBy(__name__,'desc')`. */
const newestFirst = (a: Entry, b: Entry) =>
  b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

function storeFor(uid: string): Map<string, Entry> {
  const existing = stores.get(uid);
  if (existing) return existing;

  const persisted = load<Entry[] | null>(`entries.${uid}`, null);
  if (persisted) {
    const restored = new Map(persisted.map((entry) => [entry.id, entry]));
    // Ids are handed out from a counter that resets with the module, so it has
    // to be moved past anything already stored or a reload would reissue one.
    for (const entry of persisted) {
      const n = Number(/^e2e-entry-(\d+)$/.exec(entry.id)?.[1]);
      if (Number.isInteger(n) && n > sequence) sequence = n;
    }
    stores.set(uid, restored);
    return restored;
  }

  const store = new Map<string, Entry>();
  for (const [index, raw] of (seed().entries ?? []).entries()) {
    const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : nextId();
    store.set(
      id,
      sanitizeEntry(id, {
        // Seeded rows rarely bother with timestamps, but ordering depends on
        // them, so they are filled in ascending order of appearance.
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        ...record,
        ownerUid: uid,
      }),
    );
  }
  stores.set(uid, store);
  return store;
}

export const entryRepositoryFor = (uid: string): EntryRepository => {
  const store = storeFor(uid);

  const stamp = () => new Date().toISOString();
  const persist = () => {
    save(`entries.${uid}`, [...store.values()]);
  };

  return {
    list({ limit, cursor }: PageQuery): Promise<Page<Entry>> {
      countRead('entries');
      const all = [...store.values()].sort(newestFirst);
      const start = cursor ? all.findIndex((entry) => entry.id === cursor) + 1 : 0;
      const items = all.slice(start, start + limit);
      const more = start + items.length < all.length;
      return Promise.resolve({
        items,
        cursor: more ? (items[items.length - 1]?.id ?? null) : null,
      });
    },

    get(id: string): Promise<Entry | null> {
      return Promise.resolve(store.get(id) ?? null);
    },

    create(draft: EntryDraft): Promise<string> {
      const id = nextId();
      const now = stamp();
      store.set(id, {
        ...draft,
        id,
        ownerUid: uid,
        publishedId: null,
        publishedVersion: 0,
        copiedFrom: null,
        createdAt: now,
        updatedAt: now,
      });
      persist();
      return Promise.resolve(id);
    },

    update(id: string, draft: EntryDraft): Promise<void> {
      const existing = store.get(id);
      // Matching Firestore's updateDoc, which rejects a write to a missing
      // document rather than creating one.
      if (!existing) return Promise.reject(new Error(`no entry ${id}`));
      store.set(id, { ...existing, ...draft, updatedAt: stamp() });
      persist();
      return Promise.resolve();
    },

    remove(id: string): Promise<void> {
      store.delete(id);
      persist();
      return Promise.resolve();
    },
  };
};

// ------------------------------------------------------------ practice store

/**
 * Mirrors the Firestore adapter's split: one map for progress, a list for
 * sessions. Both persist for the same reason the entries do — a spec that
 * finishes a session and then navigates to check the result would otherwise be
 * reading state the substitute threw away.
 */
const progressStores = new Map<string, Map<string, EntryProgress>>();
const sessionStores = new Map<string, PracticeSession[]>();
let sessionSequence = 0;

function progressFor(uid: string): Map<string, EntryProgress> {
  const existing = progressStores.get(uid);
  if (existing) return existing;

  const persisted = load<EntryProgress[] | null>(`progress.${uid}`, null);
  const rows: EntryProgress[] =
    persisted ??
    (seed().weak ?? []).map((entryId) => ({
      entryId,
      status: 'wrong' as const,
      lastMode: 'flashcard' as const,
      lastAt: '2026-06-23T00:00:00.000Z',
      attempts: 1,
      correctCount: 0,
    }));

  const store = new Map(rows.map((row) => [row.entryId, row]));
  progressStores.set(uid, store);
  return store;
}

function sessionsFor(uid: string): PracticeSession[] {
  const existing = sessionStores.get(uid);
  if (existing) return existing;

  const persisted = load<PracticeSession[] | null>(`sessions.${uid}`, null);
  const restored =
    persisted ??
    (seed().sessions ?? []).map((raw, index) => {
      const row = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id : `e2e-session-${index + 1}`;
      return sanitizeSession(id, row);
    });

  for (const session of restored) {
    const n = Number(/^e2e-session-(\d+)$/.exec(session.id)?.[1]);
    if (Number.isInteger(n) && n > sessionSequence) sessionSequence = n;
  }
  sessionStores.set(uid, restored);
  return restored;
}

export const progressRepositoryFor = (uid: string): ProgressRepository => {
  const progress = progressFor(uid);
  const sessions = sessionsFor(uid);

  /** Same ordering as `orderBy('finishedAt','desc'), orderBy(__name__,'desc')`. */
  const newestFirst = (a: PracticeSession, b: PracticeSession) =>
    b.finishedAt.localeCompare(a.finishedAt) || b.id.localeCompare(a.id);

  return {
    listAll(): Promise<EntryProgress[]> {
      countRead('progress');
      return Promise.resolve([...progress.values()]);
    },

    recordSession(session: PracticeSessionDraft, rows: EntryProgress[]): Promise<string> {
      const id = `e2e-session-${++sessionSequence}`;
      sessions.push({ ...session, id, finishedAt: new Date().toISOString() });
      // Merging row by row, not replacing the map — the real adapter writes
      // with `merge: true` and a substitute that clobbered would hide it.
      for (const row of rows) progress.set(row.entryId, row);
      save(`sessions.${uid}`, sessions);
      save(`progress.${uid}`, [...progress.values()]);
      return Promise.resolve(id);
    },

    listSessions({ limit, cursor }: PageQuery): Promise<Page<PracticeSession>> {
      const all = [...sessions].sort(newestFirst);
      const start = cursor ? all.findIndex((session) => session.id === cursor) + 1 : 0;
      const items = all.slice(start, start + limit);
      const more = start + items.length < all.length;
      return Promise.resolve({
        items,
        cursor: more ? (items[items.length - 1]?.id ?? null) : null,
      });
    },

    removeAll(): Promise<void> {
      progress.clear();
      sessions.length = 0;
      save(`progress.${uid}`, []);
      save(`sessions.${uid}`, []);
      return Promise.resolve();
    },
  };
};

// --------------------------------------------------------------- word sets

/**
 * Read-only in practice: nothing in the app creates a set yet, so the only
 * source is the seed. Create, update and remove are still implemented, because
 * a substitute that threw on half its port would be a different port.
 */
const setStores = new Map<string, Map<string, WordSet>>();
let setSequence = 0;

function setsFor(uid: string): Map<string, WordSet> {
  const existing = setStores.get(uid);
  if (existing) return existing;

  const persisted = load<WordSet[] | null>(`wordSets.${uid}`, null);
  const rows =
    persisted ??
    (seed().wordSets ?? []).map((raw, index) => {
      const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
        string,
        unknown
      >;
      const id = typeof record.id === 'string' ? record.id : `e2e-set-${index + 1}`;
      return sanitizeWordSet(id, {
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        ...record,
        ownerUid: uid,
      });
    });

  for (const row of rows) {
    const n = Number(/^e2e-set-(\d+)$/.exec(row.id)?.[1]);
    if (Number.isInteger(n) && n > setSequence) setSequence = n;
  }
  const store = new Map(rows.map((row) => [row.id, row]));
  setStores.set(uid, store);
  return store;
}

export const wordSetRepositoryFor = (uid: string): WordSetRepository => {
  const store = setsFor(uid);
  const stamp = () => new Date().toISOString();
  const persist = () => {
    save(`wordSets.${uid}`, [...store.values()]);
  };
  const waitForWrite = () => {
    const milliseconds = seed().wordSetWriteDelayMs ?? 0;
    return milliseconds > 0
      ? new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
      : Promise.resolve();
  };

  return {
    list({ limit, cursor }: PageQuery): Promise<Page<WordSet>> {
      countRead('wordSets');
      const all = [...store.values()].sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      );
      const start = cursor ? all.findIndex((item) => item.id === cursor) + 1 : 0;
      const items = all.slice(start, start + limit);
      const more = start + items.length < all.length;
      return Promise.resolve({
        items,
        cursor: more ? (items[items.length - 1]?.id ?? null) : null,
      });
    },

    get(id: string): Promise<WordSet | null> {
      return Promise.resolve(store.get(id) ?? null);
    },

    async create(draft: WordSetDraft): Promise<string> {
      await waitForWrite();
      const id = `e2e-set-${++setSequence}`;
      const now = stamp();
      store.set(id, {
        ...draft,
        entryIds: [...new Set(draft.entryIds)],
        id,
        ownerUid: uid,
        publishedId: null,
        publishedVersion: 0,
        copiedFrom: null,
        createdAt: now,
        updatedAt: now,
      });
      persist();
      return id;
    },

    async update(id: string, draft: WordSetDraft): Promise<void> {
      const existing = store.get(id);
      if (!existing) return Promise.reject(new Error(`no word set ${id}`));
      await waitForWrite();
      store.set(id, {
        ...existing,
        ...draft,
        entryIds: [...new Set(draft.entryIds)],
        updatedAt: stamp(),
      });
      persist();
    },

    async remove(id: string): Promise<void> {
      await waitForWrite();
      store.delete(id);
      persist();
    },
  };
};
