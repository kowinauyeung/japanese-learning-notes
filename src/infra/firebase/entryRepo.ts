import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  limit as limitTo,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  startAt,
  setDoc,
  Timestamp,
  updateDoc,
  waitForPendingWrites,
  where,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { Entry, EntryDraft } from '@/domain/entry';
import type { EntryDashboardStats, EntryRepository, Page, PageQuery } from '@/domain/ports';
import { sanitizeEntry } from '@/lib/sanitize';
import { decodeCursor, encodeCursor } from './cursor';
import { LocalWriteTracker, waitForLocalWrite } from './localWrite';
import { withIsoTimestamps } from './mappers';

/**
 * Entries live at `users/{uid}/entries/{entryId}`.
 *
 * Nesting them under the owner is what makes the security rule a single line
 * (`request.auth.uid == uid`) with no field-level conditions. It also means a
 * query is inherently scoped: Firestore rules *reject* a query they cannot
 * satisfy rather than filtering it, so a listing that forgot to scope itself
 * would fail loudly instead of leaking.
 *
 * The `Firestore` instance is a parameter rather than the singleton from
 * `./client`, which is what lets these queries run against the emulator in a
 * test. Importing the singleton would also run its module side effects — it
 * reads `import.meta.env` and opens an IndexedDB-backed cache — neither of
 * which exists outside a browser build. `src/lib/entries.tsx` is the only
 * caller and supplies the real one.
 */
export function createEntryRepository(db: Firestore, uid: string): EntryRepository {
  const entriesPath = () => collection(db, 'users', uid, 'entries');
  const statsPath = () => doc(db, 'users', uid, 'stats', 'vocabulary');
  const writes = new LocalWriteTracker();

  const toEntry = (id: string, data: Record<string, unknown>): Entry =>
    sanitizeEntry(id, withIsoTimestamps(data));

  const statsFrom = (data: Record<string, unknown>): EntryDashboardStats => ({
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : uid,
    total: numberRecord({ total: data.total }).total ?? 0,
    countsByDay: numberRecord(data.countsByDay),
    jlptCounts: numberRecord(data.jlptCounts),
    posCounts: numberRecord(data.posCounts),
  });

  const writeStatsDelta = async (before: Entry | null, after: Entry | null) => {
    const delta = statsDelta(before, after);
    if (Object.keys(delta).length === 0) return;
    try {
      const ref = statsPath();
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) return;
      await waitForLocalWrite(ref, () => updateDoc(ref, delta), {
        onLateRejection: (error) => {
          if (!isExpectedStatsRejection(error)) console.error(error);
        },
      });
    } catch (cause) {
      if (!isExpectedStatsRejection(cause)) console.error(cause);
    }
  };

  return {
    async list({ limit, cursor }: PageQuery): Promise<Page<Entry>> {
      // Ordering by a field then by __name__ in the same direction is served by
      // Firestore's automatic single-field index, so this needs no composite.
      const constraints = [
        orderBy('createdAt', 'desc'),
        orderBy(documentId(), 'desc'),
        limitTo(limit + 1),
      ];
      const decoded = cursor ? decodeCursor(cursor) : null;
      const snapshot = await getDocs(
        decoded
          ? query(entriesPath(), ...constraints, startAfter(decoded[0], decoded[1]))
          : query(entriesPath(), ...constraints),
      );

      // One row over the page size is fetched purely to answer "is there more",
      // then discarded — cheaper than a second count query.
      const page = snapshot.docs.slice(0, limit);
      const last = page[page.length - 1];
      // `get()` is typed `any`; narrowing it to unknown keeps the instanceof
      // check below as the only thing deciding what this value is.
      const lastCreatedAt: unknown = last?.get('createdAt');

      // The cursor is built from the raw Timestamp rather than the mapped
      // entry, whose createdAt is an ISO string by then. See ./cursor.
      //
      // A null cursor when there clearly is more can only happen for a document
      // whose serverTimestamp has not resolved — an offline write read back
      // from the local cache. Stopping is the lesser evil: the alternative is
      // paging on a value the server does not have yet, and the next refresh
      // once online resolves it.
      return {
        items: page.map((d) => toEntry(d.id, d.data())),
        cursor:
          snapshot.docs.length > limit && last && lastCreatedAt instanceof Timestamp
            ? encodeCursor(lastCreatedAt, last.id)
            : null,
      };
    },

    async dashboardStats(): Promise<EntryDashboardStats | null> {
      const snapshot = await getDoc(statsPath());
      return snapshot.exists() ? statsFrom(snapshot.data()) : null;
    },

    async countLearnedSince(date: string): Promise<number> {
      const snapshot = await getCountFromServer(
        query(entriesPath(), where('learnedOn', '>=', date)),
      );
      return snapshot.data().count;
    },

    async recentLearned(limit: number): Promise<Entry[]> {
      const snapshot = await getDocs(
        query(
          entriesPath(),
          orderBy('learnedOn', 'desc'),
          orderBy(documentId(), 'desc'),
          limitTo(limit),
        ),
      );
      return snapshot.docs.map((d) => toEntry(d.id, d.data()));
    },

    async listLearnedOn(day, { limit, cursor }: PageQuery): Promise<Page<Entry>> {
      const constraints = [
        where('learnedOn', '==', day),
        orderBy(documentId(), 'desc'),
        limitTo(limit + 1),
      ];
      const snapshot = await getDocs(
        cursor
          ? query(entriesPath(), ...constraints, startAfter(cursor))
          : query(entriesPath(), ...constraints),
      );
      const page = snapshot.docs.slice(0, limit);
      return {
        items: page.map((d) => toEntry(d.id, d.data())),
        cursor: snapshot.docs.length > limit ? (page[page.length - 1]?.id ?? null) : null,
      };
    },

    async wordOfDay(seed: string): Promise<Entry | null> {
      const afterSeed = await getDocs(
        query(entriesPath(), orderBy(documentId()), startAt(seed), limitTo(1)),
      );
      const picked = afterSeed.docs[0];
      if (picked) return toEntry(picked.id, picked.data());

      const first = await getDocs(query(entriesPath(), orderBy(documentId()), limitTo(1)));
      const wrapped = first.docs[0];
      return wrapped ? toEntry(wrapped.id, wrapped.data()) : null;
    },

    async get(id: string): Promise<Entry | null> {
      const snapshot = await getDoc(doc(db, 'users', uid, 'entries', id));
      return snapshot.exists() ? toEntry(snapshot.id, snapshot.data()) : null;
    },

    /**
     * Ownership, publication state and both timestamps are set here rather than
     * accepted from the caller — `EntryDraft` omits them for that reason. Both
     * stamps come from the server, never the device clock.
     */
    async create(draft: EntryDraft): Promise<string> {
      const ref = doc(entriesPath());
      await writes.write(ref, () =>
        setDoc(ref, {
          ...draft,
          ownerUid: uid,
          publishedId: null,
          publishedVersion: 0,
          copiedFrom: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
      void writeStatsDelta(
        null,
        toEntry(ref.id, { ...draft, createdAt: new Date(), updatedAt: new Date(), ownerUid: uid }),
      );
      return ref.id;
    },

    /**
     * `createdAt`, `ownerUid` and the publication fields are never included, so
     * the creation time and published state survive every later edit.
     */
    async update(id: string, draft: EntryDraft): Promise<void> {
      const ref = doc(db, 'users', uid, 'entries', id);
      const before = await getDoc(ref)
        .then((snapshot) => (snapshot.exists() ? toEntry(snapshot.id, snapshot.data()) : null))
        .catch(() => null);
      await writes.write(ref, () =>
        updateDoc(ref, {
          ...draft,
          updatedAt: serverTimestamp(),
        }),
      );
      if (before) void writeStatsDelta(before, { ...before, ...draft });
    },

    async remove(id: string): Promise<void> {
      const ref = doc(db, 'users', uid, 'entries', id);
      const before = await getDoc(ref)
        .then((snapshot) => (snapshot.exists() ? toEntry(snapshot.id, snapshot.data()) : null))
        .catch(() => null);
      await writes.write(ref, () => deleteDoc(ref));
      if (before) void writeStatsDelta(before, null);
    },

    async removeDashboardStats(): Promise<void> {
      const ref = statsPath();
      await writes.write(ref, () => deleteDoc(ref));
    },

    async settlePendingWrites(): Promise<void> {
      await writes.settle(() => waitForPendingWrites(db));
    },
  };
}

function numberRecord(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value > 0)
      .map(([key, value]) => [key, value as number]),
  );
}

function statsDelta(before: Entry | null, after: Entry | null): Record<string, unknown> {
  const amounts: Record<string, number> = {};
  if (!before && after) addAmount(amounts, 'total', 1);
  if (before && !after) addAmount(amounts, 'total', -1);
  if (before) addEntryDelta(amounts, before, -1);
  if (after) addEntryDelta(amounts, after, 1);

  const delta = Object.fromEntries(
    Object.entries(amounts)
      .filter(([, amount]) => amount !== 0)
      .map(([path, amount]) => [path, increment(amount)]),
  );
  if (Object.keys(delta).length === 0) return {};
  return { ...delta, updatedAt: serverTimestamp() };
}

function addEntryDelta(amounts: Record<string, number>, entry: Entry, by: 1 | -1) {
  addAmount(amounts, `countsByDay.${entry.learnedOn}`, by);
  addAmount(amounts, `jlptCounts.${entry.jlpt}`, by);
  for (const part of entry.pos) addAmount(amounts, `posCounts.${part}`, by);
}

function addAmount(amounts: Record<string, number>, path: string, by: number) {
  amounts[path] = (amounts[path] ?? 0) + by;
}

function isUnavailable(cause: unknown): boolean {
  return (
    typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'unavailable'
  );
}

function isExpectedStatsRejection(cause: unknown): boolean {
  return (
    isUnavailable(cause) ||
    (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'not-found')
  );
}
