import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  disableNetwork,
  doc,
  enableNetwork,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  waitForPendingWrites,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createEntryRepository } from '@/infra/firebase/entryRepo';
import { LOCAL_WRITE_FALLBACK_MS } from '@/infra/firebase/localWrite';
import { createProgressRepository } from '@/infra/firebase/progressRepo';
import { createWordSetRepository } from '@/infra/firebase/wordSetRepo';
import { emptyDraft } from '@/lib/draft';

/**
 * The unit tests can prove the adapter reacts to pending-write metadata, but
 * they cannot prove Firestore really emits that metadata while its write
 * promise stays unresolved. These cases run against the emulator and cut the
 * SDK network with `disableNetwork`, so a wrong ref or a missing metadata event
 * fails through a short `Promise.race` instead of by hanging CI.
 */

let app: FirebaseApp;
let db: Firestore;

type Outcome<T> = { status: 'timeout' } | { status: 'value'; value: T };

const uid = () => `it-local-write-${randomUUID()}`;
const fallbackBudget = LOCAL_WRITE_FALLBACK_MS + 750;

const entryDraft = () => ({
  ...emptyDraft(),
  headword: '鈍行',
  definition: '各駅に止まる列車。',
});

const wordSetDraft = () => ({
  name: '移動の語',
  description: '',
  entryIds: ['entry-a'],
  level: '' as const,
  topics: [],
});

const sessionDraft = () => ({
  mode: 'flashcard' as const,
  filterLabel: 'すべての語',
  total: 1,
  correct: 1,
  missed: [],
  startedAt: '2026-08-25T10:00:00.000Z',
});

const progressRow = () => ({
  entryId: 'entry-a',
  status: 'correct' as const,
  lastMode: 'flashcard' as const,
  lastAt: '2026-08-25T10:01:00.000Z',
  attempts: 1,
  correctCount: 1,
});

const storedEntry = (ownerUid: string) => ({
  ...entryDraft(),
  ownerUid,
  publishedId: null,
  publishedVersion: 0,
  copiedFrom: null,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

async function within<T>(promise: Promise<T>, ms: number): Promise<Outcome<T>> {
  return Promise.race([
    promise.then((value) => ({ status: 'value' as const, value })),
    new Promise<{ status: 'timeout' }>((resolve) =>
      setTimeout(() => resolve({ status: 'timeout' }), ms),
    ),
  ]);
}

function pendingSnapshot(ref: ReturnType<typeof doc>): Promise<void> {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    unsubscribe = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!snapshot.metadata.hasPendingWrites) return;
        unsubscribe();
        resolve();
      },
      reject,
    );
  });
}

beforeAll(() => {
  app = initializeApp({ projectId: 'demo-goitei' }, `localWrite-${randomUUID()}`);
  db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080, { mockUserToken: 'owner' });
});

afterEach(async () => {
  await enableNetwork(db).catch(() => {});
  await waitForPendingWrites(db).catch(() => {});
});

afterAll(async () => {
  await deleteApp(app);
});

describe('local Firestore writes while offline', () => {
  it('Firestore SDK setDoc keeps the write promise pending after the local cache accepts it', async () => {
    const owner = uid();
    const ref = doc(db, 'users', owner, 'entries', 'raw-sdk-write');
    const locallyPending = pendingSnapshot(ref);

    await disableNetwork(db);
    const write = setDoc(ref, storedEntry(owner));

    await expect(locallyPending).resolves.toBeUndefined();
    await expect(within(write, 100)).resolves.toEqual({ status: 'timeout' });

    await enableNetwork(db);
    await expect(write).resolves.toBeUndefined();
  });

  it('EntryRepository create, update and remove resolve from real pending-write metadata', async () => {
    const owner = uid();
    const repo = createEntryRepository(db, owner);
    const existing = await repo.create(entryDraft());

    await disableNetwork(db);
    const created = await within(repo.create(entryDraft()), fallbackBudget);
    expect(created.status).toBe('value');
    if (created.status !== 'value') throw new Error('entry create did not resolve locally');
    expect(created.value).toMatch(/\S/);
    const stored = await repo.get(created.value);
    expect(stored).toMatchObject(entryDraft());

    await expect(
      within(
        repo.update(existing, { ...entryDraft(), definition: 'ゆっくり進む列車。' }),
        fallbackBudget,
      ),
    ).resolves.toEqual({ status: 'value', value: undefined });
    await expect(within(repo.remove(existing), fallbackBudget)).resolves.toEqual({
      status: 'value',
      value: undefined,
    });
  });

  it('WordSetRepository writes and ProgressRepository batch writes resolve from real pending-write metadata', async () => {
    const owner = uid();
    const wordSets = createWordSetRepository(db, owner);
    const progress = createProgressRepository(db, owner);
    const existingSet = await wordSets.create(wordSetDraft());

    await disableNetwork(db);
    const created = await within(wordSets.create(wordSetDraft()), fallbackBudget);
    expect(created.status).toBe('value');
    if (created.status !== 'value') throw new Error('word set create did not resolve locally');
    expect(created.value).toMatch(/\S/);
    const stored = await wordSets.get(created.value);
    expect(stored).toMatchObject(wordSetDraft());

    await expect(
      within(wordSets.update(existingSet, { ...wordSetDraft(), name: '通勤の語' }), fallbackBudget),
    ).resolves.toEqual({ status: 'value', value: undefined });
    await expect(within(wordSets.remove(existingSet), fallbackBudget)).resolves.toEqual({
      status: 'value',
      value: undefined,
    });
    await expect(
      within(progress.recordSession(sessionDraft(), [progressRow()]), fallbackBudget),
    ).resolves.toMatchObject({ status: 'value' });
  });
});
