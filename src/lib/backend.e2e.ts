import type { Entry, EntryDraft } from '@/domain/entry';
import type {
  AuthPort,
  AuthUser,
  EntryRepository,
  Page,
  PageQuery,
  ProgressRepository,
} from '@/domain/ports';
import type { EntryProgress, PracticeSession, PracticeSessionDraft } from '@/domain/practice';
import { sanitizeEntry } from './sanitize';

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
}

declare global {
  interface Window {
    __GOITEI_E2E__?: Seed;
  }
}

const seed = (): Seed => (typeof window === 'undefined' ? {} : (window.__GOITEI_E2E__ ?? {}));

const E2E_USER: AuthUser = {
  uid: 'e2e-user',
  email: 'e2e@example.test',
  displayName: 'テスト太郎',
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
};

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
  const restored = load<PracticeSession[]>(`sessions.${uid}`, []);
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
  };
};
