import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProgressRepository } from '@/domain/ports';
import type { EntryProgress, PracticeSessionDraft } from '@/domain/practice';
import { createProgressRepository } from '@/infra/firebase/progressRepo';

/**
 * The progress adapter, against a real Firestore.
 *
 * Two claims here are unreachable from any cheaper layer, and both are about
 * how the write lands rather than about what was computed:
 *
 *  - `merge: true` on the progress map. A substitute that stored objects in a
 *    Map merges by definition; only a real write can lose the other device's
 *    rows.
 *  - `finishedAt` as a server value, and the cursor built from the raw
 *    `Timestamp`. The same pairing was the pagination defect in the entries
 *    adapter, where `tests/unit/cursor.test.ts` stayed green throughout.
 *
 * Same conventions as `entryRepo.test.ts`: rules bypassed with
 * `mockUserToken`, a fresh uid per test instead of cleanup, and no parallelism
 * with the rules file.
 */

let app: FirebaseApp;
let db: Firestore;

const freshUid = () => `it-progress-${randomUUID()}`;
const freshRepo = (uid = freshUid()): { repo: ProgressRepository; uid: string } => ({
  repo: createProgressRepository(db, uid),
  uid,
});

const session = (overrides: Partial<PracticeSessionDraft> = {}): PracticeSessionDraft => ({
  mode: 'flashcard',
  filterLabel: 'すべての語',
  total: 1,
  correct: 1,
  words: [{ entryId: 'e1', headword: '切り分け', reading: 'きりわけ', correct: true }],
  startedAt: '2026-06-24T09:59:00.000Z',
  ...overrides,
});

const row = (entryId: string, overrides: Partial<EntryProgress> = {}): EntryProgress => ({
  entryId,
  status: 'correct',
  lastMode: 'flashcard',
  lastAt: '2026-06-24T10:00:00.000Z',
  attempts: 1,
  correctCount: 1,
  ...overrides,
});

beforeAll(() => {
  app = initializeApp({ projectId: 'demo-goitei' }, `progressRepo-${randomUUID()}`);
  db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080, { mockUserToken: 'owner' });
});

afterAll(async () => {
  await deleteApp(app);
});

describe('the progress map', () => {
  it('reads back as the empty map for a learner who has never practised', async () => {
    const { repo } = freshRepo();
    await expect(repo.listAll()).resolves.toEqual([]);
  });

  it('round-trips a row through the nested map, keyed by entry id', async () => {
    const { repo } = freshRepo();
    await repo.recordSession(session(), [row('entry-a', { attempts: 3, correctCount: 2 })]);

    const all = await repo.listAll();
    expect(all).toEqual([
      {
        entryId: 'entry-a',
        status: 'correct',
        lastMode: 'flashcard',
        lastAt: '2026-06-24T10:00:00.000Z',
        attempts: 3,
        correctCount: 2,
      },
    ]);
  });

  /**
   * The defect: a write without `merge: true` replaces the whole `entries` map
   * with whatever this session touched, so every word the learner practised in
   * an earlier session — or on another device a minute ago — silently reverts
   * to unpractised. Nothing on screen would show it until 苦手のみ came back
   * with a smaller number than it had.
   */
  it('leaves rows this session did not answer exactly as they were', async () => {
    const uid = freshUid();
    const first = createProgressRepository(db, uid);
    await first.recordSession(session(), [row('kept', { status: 'wrong', attempts: 5 })]);

    // A second repository over the same uid, standing in for a second device
    // that never read the first session's rows.
    const second = createProgressRepository(db, uid);
    await second.recordSession(session(), [row('added')]);

    const all = await second.listAll();
    expect(all.map((item) => item.entryId).sort()).toEqual(['added', 'kept']);
    expect(all.find((item) => item.entryId === 'kept')).toMatchObject({
      status: 'wrong',
      attempts: 5,
    });
  });

  it('overwrites a row the new session did answer', async () => {
    const { repo } = freshRepo();
    await repo.recordSession(session(), [row('e', { status: 'wrong', attempts: 1 })]);
    await repo.recordSession(session(), [row('e', { status: 'correct', attempts: 2 })]);

    expect(await repo.listAll()).toEqual([
      expect.objectContaining({ status: 'correct', attempts: 2 }),
    ]);
  });
});

describe('recording a session', () => {
  it('returns the new session id and files it under the owner', async () => {
    const { repo, uid } = freshRepo();
    const id = await repo.recordSession(
      session({ filterLabel: '#仕事', total: 4, correct: 3 }),
      [],
    );

    expect(id).toBeTruthy();
    const stored = await getDoc(doc(db, 'users', uid, 'practiceSessions', id));
    expect(stored.exists()).toBe(true);
    expect(stored.get('ownerUid')).toBe(uid);
    expect(stored.get('filterLabel')).toBe('#仕事');
  });

  /**
   * `PracticeSessionDraft` omits `finishedAt` so the caller cannot supply one.
   * A device an hour fast would otherwise file its sessions above every other
   * row and repeat or skip them at each page boundary.
   */
  it('stores finishedAt as a Timestamp, which a device-written string is not', async () => {
    const { repo, uid } = freshRepo();
    const id = await repo.recordSession(session(), []);

    // Read raw, before the mapper turns it into a string. Comparing the mapped
    // value against `Date.now()` proves nothing: a clock an hour fast produces
    // a plausible-looking instant and passes, and the cursor still breaks.
    const stored = await getDoc(doc(db, 'users', uid, 'practiceSessions', id));
    expect(stored.get('finishedAt')).toBeInstanceOf(Timestamp);
    expect(stored.get('startedAt')).toBe('2026-06-24T09:59:00.000Z');
  });

  /** The two documents are one batch, so a listing can never see half of it. */
  it('writes the session and the progress map together', async () => {
    const { repo } = freshRepo();
    await repo.recordSession(session(), [row('e')]);

    expect((await repo.listSessions({ limit: 5, cursor: null })).items).toHaveLength(1);
    expect(await repo.listAll()).toHaveLength(1);
  });
});

describe('paging through 履歴', () => {
  /**
   * `finishedAt` is written here rather than left to the clock, for the reason
   * recorded at length on `entryRepo`'s ordering test: the emulator resolves
   * `serverTimestamp()` to the millisecond and three sequential writes land
   * inside one often enough to tie. `listSessions` then falls through to its
   * second key, `documentId() desc`, where an auto-id is random — so this
   * assertion failed on roughly one run in six with nothing wrong in the query.
   */
  it('orders newest first, so the last practice run is the first row of 履歴', async () => {
    const { repo, uid } = freshRepo();
    const ids: string[] = [];
    for (const label of ['一', '二', '三']) {
      ids.push(await repo.recordSession(session({ filterLabel: label }), []));
    }

    // A minute apart, which no clock resolution can tie.
    for (const [minute, id] of ids.entries()) {
      await setDoc(
        doc(db, 'users', uid, 'practiceSessions', id),
        { finishedAt: Timestamp.fromDate(new Date(Date.UTC(2026, 5, 24, 9, minute))) },
        { merge: true },
      );
    }

    const page = await repo.listSessions({ limit: 5, cursor: null });
    expect(page.items.map((item) => item.filterLabel)).toEqual(['三', '二', '一']);
    expect(page.cursor).toBeNull();
  });

  /**
   * Walked one page at a time, asserting every row is seen exactly once. The
   * page guard is not decoration: under the cursor defect this adapter's shape
   * inherits, the loop never terminates and the test times out instead of
   * failing — which reads as flake rather than as the regression it is.
   */
  it('walks every session exactly once across page boundaries', async () => {
    const { repo } = freshRepo();
    const labels = ['a', 'b', 'c', 'd', 'e'];
    for (const label of labels) await repo.recordSession(session({ filterLabel: label }), []);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<ProgressRepository['listSessions']>> = await repo.listSessions(
        { limit: 2, cursor },
      );
      seen.push(...page.items.map((item) => item.filterLabel));
      cursor = page.cursor;
      pages += 1;
      expect(pages).toBeLessThanOrEqual(10);
    } while (cursor);

    expect(seen).toHaveLength(labels.length);
    expect(new Set(seen).size).toBe(labels.length);
  });
});
