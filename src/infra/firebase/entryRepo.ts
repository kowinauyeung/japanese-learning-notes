import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { Entry, EntryDraft } from '@/domain/entry';
import type { EntryRepository, Page, PageQuery } from '@/domain/ports';
import { sanitizeEntry } from '@/lib/sanitize';
import { decodeCursor, encodeCursor } from './cursor';
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

  const toEntry = (id: string, data: Record<string, unknown>): Entry =>
    sanitizeEntry(id, withIsoTimestamps(data));

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
      const ref = await addDoc(entriesPath(), {
        ...draft,
        ownerUid: uid,
        publishedId: null,
        publishedVersion: 0,
        copiedFrom: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },

    /**
     * `createdAt`, `ownerUid` and the publication fields are never included, so
     * the creation time and published state survive every later edit.
     */
    async update(id: string, draft: EntryDraft): Promise<void> {
      await updateDoc(doc(db, 'users', uid, 'entries', id), {
        ...draft,
        updatedAt: serverTimestamp(),
      });
    },

    async remove(id: string): Promise<void> {
      await deleteDoc(doc(db, 'users', uid, 'entries', id));
    },
  };
}
