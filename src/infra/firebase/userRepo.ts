import {
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { UserRepository } from '@/domain/ports';
import type { UserProfile } from '@/domain/user';
import { sanitizeUserProfile } from '@/lib/sanitize';
import { withIsoTimestamps } from './mappers';

/** The profile occupies the parent `users/{uid}` document. */
export function createUserRepository(db: Firestore): UserRepository {
  const refFor = (uid: string) => doc(db, 'users', uid);
  const toProfile = (uid: string, data: Record<string, unknown>): UserProfile =>
    sanitizeUserProfile(uid, withIsoTimestamps(data));

  return {
    async get(uid): Promise<UserProfile | null> {
      const snapshot = await getDoc(refFor(uid));
      return snapshot.exists() ? toProfile(uid, snapshot.data()) : null;
    },

    async save(uid, draft): Promise<void> {
      const ref = refFor(uid);
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(ref);
        if (current.exists()) {
          transaction.update(ref, { ...draft, updatedAt: serverTimestamp() });
          return;
        }
        transaction.set(ref, {
          ...draft,
          uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    },

    async remove(uid): Promise<void> {
      await deleteDoc(refFor(uid));
    },

    /**
     * A document in a collection of its own, not a field on the profile: the
     * profile is deleted by the same flow, and a marker that goes away with the
     * thing it outlives is not a marker.
     *
     * `setDoc` rather than a create, and the rules allow the overwrite for the
     * same reason — a retried deletion writes this twice, and nothing reads
     * what is inside it.
     */
    async markDeleted(uid): Promise<void> {
      await setDoc(doc(db, 'deletedAccounts', uid), { deletedAt: serverTimestamp() });
    },
  };
}
