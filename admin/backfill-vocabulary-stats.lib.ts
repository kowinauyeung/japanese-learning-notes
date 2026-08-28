import { FieldValue } from 'firebase-admin/firestore';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import type { EntryDashboardStats } from '../src/domain/ports';
import { dashboardStatsFor, sameDashboardStats } from './backfill-vocabulary-stats.shared';

export async function rebuildVocabularyStats(
  db: Firestore,
  uid: string,
  { onSourceRead }: { onSourceRead?: () => Promise<void> } = {},
): Promise<'active' | 'deleted'> {
  const user = db.collection('users').doc(uid);
  const entries = user.collection('entries');
  const stats = user.collection('stats').doc('vocabulary');
  const tombstone = db.doc(`deletedAccounts/${uid}`);

  const status = await db.runTransaction(async (transaction) => {
    const [deletedAccount, existingStats] = await Promise.all([
      transaction.get(tombstone),
      transaction.get(stats),
    ]);
    if (deletedAccount.exists) {
      if (existingStats.exists) transaction.delete(stats);
      return 'deleted' as const;
    }
    if (!existingStats.exists) transaction.create(stats, emptyDashboardStats(uid));
    return 'active' as const;
  });
  if (status === 'deleted') return status;

  return db.runTransaction(async (transaction) => {
    const [deletedAccount, source, currentStats] = await Promise.all([
      transaction.get(tombstone),
      transaction.get(entries),
      transaction.get(stats),
    ]);
    if (deletedAccount.exists) {
      if (currentStats.exists) transaction.delete(stats);
      return 'deleted' as const;
    }
    if (!currentStats.exists) throw new Error(`stats document disappeared for ${uid}`);

    const calculated = dashboardStatsFor(
      source.docs.map((entry) => statsEntry(entry.id, entry.data())),
    );
    await onSourceRead?.();
    transaction.set(stats, {
      ownerUid: uid,
      ...calculated,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return 'active' as const;
  });
}

export async function verifyVocabularyStats(db: Firestore, uid: string): Promise<void> {
  const user = db.collection('users').doc(uid);
  const [source, stored] = await Promise.all([
    user.collection('entries').get(),
    user.collection('stats').doc('vocabulary').get(),
  ]);
  if (!stored.exists) throw new Error(`missing stats document after backfill for ${uid}`);

  const expected = dashboardStatsFor(
    source.docs.map((entry) => statsEntry(entry.id, entry.data())),
  );
  const actual = statsDocument(uid, stored.data());
  if (!sameDashboardStats(actual, expected)) {
    throw new Error(`stats/source mismatch after backfill for ${uid}`);
  }
}

function emptyDashboardStats(uid: string) {
  return {
    ownerUid: uid,
    total: 0,
    countsByDay: {},
    jlptCounts: {},
    posCounts: {},
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function statsEntry(id: string, data: DocumentData) {
  if (typeof data.learnedOn !== 'string' || typeof data.jlpt !== 'string') {
    throw new Error(`entry ${id} has no valid learnedOn or jlpt value`);
  }
  if (!Array.isArray(data.pos) || !data.pos.every((part) => typeof part === 'string')) {
    throw new Error(`entry ${id} has no valid pos array`);
  }
  return { learnedOn: data.learnedOn, jlpt: data.jlpt, pos: data.pos };
}

function statsDocument(uid: string, data: DocumentData | undefined): EntryDashboardStats {
  if (!data) throw new Error(`stats document has no data for ${uid}`);
  return {
    ownerUid: uid,
    total: numberValue(data.total, 'total', uid),
    countsByDay: numberRecord(data.countsByDay, 'countsByDay', uid),
    jlptCounts: numberRecord(data.jlptCounts, 'jlptCounts', uid),
    posCounts: numberRecord(data.posCounts, 'posCounts', uid),
  };
}

function numberRecord(value: unknown, field: string, uid: string): Record<string, number> {
  if (!value || typeof value !== 'object') throw new Error(`invalid ${field} for ${uid}`);
  const record: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) record[key] = numberValue(count, field, uid);
  return record;
}

function numberValue(value: unknown, field: string, uid: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`invalid ${field} for ${uid}`);
  }
  return value;
}
