import {
  deleteDoc,
  collection,
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
  writeBatch,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { Page, PageQuery, ProgressRepository } from '@/domain/ports';
import type { EntryProgress, PracticeSession, PracticeSessionDraft } from '@/domain/practice';
import { sanitizeProgressMap, sanitizeSession } from '@/lib/sanitize';
import { decodeCursor, encodeCursor } from './cursor';
import { withIsoTimestamps } from './mappers';

/**
 * Practice state, in two shapes because the two halves are read differently.
 *
 * `users/{uid}/progress/entries` — **one document**, a map keyed by entry id.
 * Every screen that cares about 苦手な語 wants all of it at once and none of
 * them want to query it, so a collection would buy nothing and cost one read
 * per word on load and one write per word on save. See `ProgressRepository`
 * for the full argument and the 1 MiB ceiling it accepts.
 *
 * `users/{uid}/practiceSessions/{id}` — a document per session, because 履歴 is
 * an append-only log that is paged, and a session is written exactly once.
 *
 * Both take the `Firestore` instance as a parameter for the same reason
 * `createEntryRepository` does: importing `./client` runs module side effects
 * that need a browser build.
 */
export function createProgressRepository(db: Firestore, uid: string): ProgressRepository {
  const progressDoc = () => doc(db, 'users', uid, 'progress', 'entries');
  const sessionsPath = () => collection(db, 'users', uid, 'practiceSessions');

  return {
    async listAll(): Promise<EntryProgress[]> {
      const snapshot = await getDoc(progressDoc());
      // A learner who has never practised has no document, which is not an
      // error state — it is the empty map.
      return snapshot.exists() ? sanitizeProgressMap(snapshot.get('entries')) : [];
    },

    /**
     * Two documents, whatever the session length: the log entry and the
     * progress map.
     *
     * A batch rather than two awaits so a crash between them cannot leave
     * progress recorded against a session that is not in 履歴, or the reverse.
     *
     * `merge: true` writes the named entry-id fields and leaves the rest of the
     * map alone. That is what makes a session finished on a phone survive one
     * finished on a laptop: without it, this write is the whole map as this
     * device last read it, and the other device's words revert.
     */
    async recordSession(session: PracticeSessionDraft, progress: EntryProgress[]): Promise<string> {
      // The id is needed before the batch commits, so the reference is minted
      // locally rather than by addDoc. Firestore generates ids client-side.
      const sessionRef = doc(sessionsPath());
      const batch = writeBatch(db);

      batch.set(sessionRef, {
        ...session,
        ownerUid: uid,
        finishedAt: serverTimestamp(),
      });

      // Written as a nested map keyed by entry id. Object.fromEntries over the
      // rows rather than dotted field paths, because an entry id is an auto-id
      // and a dotted path would split one containing a period.
      batch.set(
        progressDoc(),
        {
          ownerUid: uid,
          entries: Object.fromEntries(progress.map(({ entryId, ...row }) => [entryId, row])),
        },
        { merge: true },
      );

      await batch.commit();
      return sessionRef.id;
    },

    /**
     * Newest first, ordered by the server-set `finishedAt` — see
     * `PracticeSessionDraft` for why the device's own clock is not orderable.
     *
     * Same shape as the entries listing, including the extra row fetched to
     * answer "is there more" and the cursor built from the raw `Timestamp`
     * rather than the mapped ISO string.
     */
    async listSessions({ limit, cursor }: PageQuery): Promise<Page<PracticeSession>> {
      const constraints = [
        orderBy('finishedAt', 'desc'),
        orderBy(documentId(), 'desc'),
        limitTo(limit + 1),
      ];
      const decoded = cursor ? decodeCursor(cursor) : null;
      const snapshot = await getDocs(
        decoded
          ? query(sessionsPath(), ...constraints, startAfter(decoded[0], decoded[1]))
          : query(sessionsPath(), ...constraints),
      );

      const page = snapshot.docs.slice(0, limit);
      const last = page[page.length - 1];
      const lastFinishedAt: unknown = last?.get('finishedAt');

      return {
        items: page.map((d) =>
          sanitizeSession(d.id, withIsoTimestamps(d.data(), ['startedAt', 'finishedAt'])),
        ),
        cursor:
          snapshot.docs.length > limit && last && lastFinishedAt instanceof Timestamp
            ? encodeCursor(lastFinishedAt, last.id)
            : null,
      };
    },

    /**
     * The progress map and every session, in batches.
     *
     * Read then delete, in pages, rather than one query: a batch is capped at
     * 500 writes, and a learner with a year of daily practice is past that. The
     * loop re-queries each time because the previous batch has removed what it
     * matched, so the first page is always the next unprocessed one.
     *
     * Not atomic, and it cannot be from a client. What that means for the
     * caller is that a failure leaves the account partly emptied, which is why
     * `deleteEverything` reports what it managed rather than claiming success.
     */
    async removeAll(): Promise<void> {
      for (;;) {
        const snapshot = await getDocs(query(sessionsPath(), limitTo(400)));
        if (snapshot.empty) break;
        const batch = writeBatch(db);
        for (const document of snapshot.docs) batch.delete(document.ref);
        await batch.commit();
        if (snapshot.size < 400) break;
      }
      await deleteDoc(progressDoc());
    },
  };
}
