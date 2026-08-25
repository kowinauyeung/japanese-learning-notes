import {
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
  setDoc,
  Timestamp,
  updateDoc,
  waitForPendingWrites,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { Page, PageQuery, WordSetRepository } from '@/domain/ports';
import type { WordSet, WordSetDraft } from '@/domain/wordSet';
import { sanitizeWordSet } from '@/lib/sanitize';
import { decodeCursor, encodeCursor } from './cursor';
import { LocalWriteTracker } from './localWrite';
import { withIsoTimestamps } from './mappers';

/**
 * 単語集 at `users/{uid}/wordSets/{setId}`, listed and written the same way
 * entries are — see `entryRepo.ts` for why the `Firestore` instance is a
 * parameter and why the cursor is built from the raw `Timestamp`.
 *
 * Membership lives here, on `entryIds`, and not on the entry. The order of
 * that array *is* the study order, which an entry-side array cannot express;
 * deleting a set is then one write rather than N.
 */
export function createWordSetRepository(db: Firestore, uid: string): WordSetRepository {
  const setsPath = () => collection(db, 'users', uid, 'wordSets');
  const setRef = (id: string) => doc(db, 'users', uid, 'wordSets', id);
  const writes = new LocalWriteTracker();

  const toWordSet = (id: string, data: Record<string, unknown>): WordSet =>
    sanitizeWordSet(id, withIsoTimestamps(data));

  return {
    async list({ limit, cursor }: PageQuery): Promise<Page<WordSet>> {
      const constraints = [
        orderBy('createdAt', 'desc'),
        orderBy(documentId(), 'desc'),
        limitTo(limit + 1),
      ];
      const decoded = cursor ? decodeCursor(cursor) : null;
      const snapshot = await getDocs(
        decoded
          ? query(setsPath(), ...constraints, startAfter(decoded[0], decoded[1]))
          : query(setsPath(), ...constraints),
      );

      const page = snapshot.docs.slice(0, limit);
      const last = page[page.length - 1];
      const lastCreatedAt: unknown = last?.get('createdAt');

      return {
        items: page.map((d) => toWordSet(d.id, d.data())),
        cursor:
          snapshot.docs.length > limit && last && lastCreatedAt instanceof Timestamp
            ? encodeCursor(lastCreatedAt, last.id)
            : null,
      };
    },

    async get(id: string): Promise<WordSet | null> {
      const snapshot = await getDoc(setRef(id));
      return snapshot.exists() ? toWordSet(snapshot.id, snapshot.data()) : null;
    },

    /** Duplicates are deduped on the way in as well as on the way out. */
    async create(draft: WordSetDraft): Promise<string> {
      const ref = doc(setsPath());
      await writes.write(ref, () =>
        setDoc(ref, {
          ...draft,
          entryIds: [...new Set(draft.entryIds)],
          ownerUid: uid,
          publishedId: null,
          publishedVersion: 0,
          copiedFrom: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
      return ref.id;
    },

    async update(id: string, draft: WordSetDraft): Promise<void> {
      const ref = setRef(id);
      await writes.write(ref, () =>
        updateDoc(ref, {
          ...draft,
          entryIds: [...new Set(draft.entryIds)],
          updatedAt: serverTimestamp(),
        }),
      );
    },

    /**
     * Deletes the set, never its entries. A 単語集 is an organisational view
     * over words that exist on their own, so removing one must not take the
     * notes with it.
     */
    async remove(id: string): Promise<void> {
      const ref = setRef(id);
      await writes.write(ref, () => deleteDoc(ref));
    },

    async settlePendingWrites(): Promise<void> {
      await writes.settle(() => waitForPendingWrites(db));
    },
  };
}
