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
  updateDoc,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EntryDraft } from '@/domain/entry';
import type { EntryRepository } from '@/domain/ports';
import { createEntryRepository } from '@/infra/firebase/entryRepo';
import { emptyDraft } from '@/lib/draft';

/**
 * The Firestore adapter, run against a real Firestore.
 *
 * This is the layer both defects that reached review actually lived in, and
 * neither was reachable from anywhere else:
 *
 *  - the cursor was built from the *mapped* entry, whose `createdAt` is an ISO
 *    string. `tests/unit/cursor.test.ts` stayed green throughout, because the
 *    bug was never in encode/decode — it was in which value the adapter fed
 *    them, which only shows up once a query runs.
 *  - the rules used `get()` where they needed `getAfter()`, which no amount of
 *    unit testing over pure functions can see.
 *
 * An in-memory fake repository would exercise none of this: it has no query, no
 * index ordering and no cursor. The emulator is the cheap part — it is already
 * running for the rules tests.
 *
 * Rules are deliberately bypassed here (`mockUserToken: 'owner'`); who may read
 * what is `tests/rules/`'s subject.
 *
 * A fresh uid per test is why no cleanup is needed *within* this file. It is
 * not what keeps this file and the rules file apart: those share one emulator,
 * and `clearFirestore()` there wipes the whole database regardless of uid. The
 * only thing separating them is `fileParallelism: false` in vitest.config.ts —
 * so anything that re-enables parallelism has to solve that first.
 */

let app: FirebaseApp;
let db: Firestore;

/** A distinct `users/{uid}/entries` per test, so no cleanup is needed. */
const freshRepo = (): EntryRepository => createEntryRepository(db, `it-${randomUUID()}`);

const draft = (overrides: Partial<EntryDraft> = {}): EntryDraft => ({
  ...emptyDraft(),
  headword: '兆候',
  definition: '何かが起こる前ぶれ。',
  ...overrides,
});

/** Sequential, because ordering by createdAt is what most of this asserts. */
async function seed(repo: EntryRepository, headwords: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const headword of headwords) ids.push(await repo.create(draft({ headword })));
  return ids;
}

beforeAll(() => {
  app = initializeApp({ projectId: 'demo-goitei' }, `entryRepo-${randomUUID()}`);
  db = getFirestore(app);
  // Plain getFirestore, not the app's initializeFirestore: the persistent cache
  // the real client uses is IndexedDB-backed and has nothing to run on here.
  connectFirestoreEmulator(db, '127.0.0.1', 8080, { mockUserToken: 'owner' });
});

afterAll(async () => {
  await deleteApp(app);
});

describe('create and read back', () => {
  it('returns a server-generated id and stores the draft under the owner', async () => {
    const repo = freshRepo();
    const id = await repo.create(draft({ headword: '清高', reading: 'せいこう' }));

    expect(id).toBeTruthy();
    const stored = await repo.get(id);
    expect(stored?.headword).toBe('清高');
    expect(stored?.reading).toBe('せいこう');
    expect(stored?.id).toBe(id);
  });

  /**
   * `EntryDraft` omits these precisely so the form cannot send them. The
   * adapter is what fills them in, and it is the only thing that may.
   */
  it('stamps ownership and publication state that the caller never supplied', async () => {
    const repo = createEntryRepository(db, 'it-owner-fixed');
    const stored = await repo.get(await repo.create(draft()));

    expect(stored?.ownerUid).toBe('it-owner-fixed');
    expect(stored?.publishedId).toBeNull();
    expect(stored?.publishedVersion).toBe(0);
    expect(stored?.copiedFrom).toBeNull();
  });

  it('resolves both timestamps from the server, not the device clock', async () => {
    const repo = freshRepo();
    const stored = await repo.get(await repo.create(draft()));

    // Written as serverTimestamp() and read back as an ISO string by the
    // mapper, which is the only place that knows both representations.
    expect(stored?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(stored?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns null for an id that is not there', async () => {
    expect(await freshRepo().get('no-such-entry')).toBeNull();
  });
});

describe('list — pagination', () => {
  /**
   * The regression test for the infinite loop. `EntriesProvider` pages until
   * the cursor is null; with the cursor built from an ISO string, Firestore
   * ordered it above every timestamp, `startAfter` landed at the top of the
   * collection, and page two was page one for ever.
   *
   * Asserting the ids are all distinct is what catches that — a length check
   * alone would pass on five copies of page one.
   */
  it('walks the whole collection in pages without repeating or dropping a row', async () => {
    const repo = freshRepo();
    const created = await seed(repo, ['一', '二', '三', '四', '五', '六', '七']);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const page = await repo.list({ limit: 2, cursor });
      seen.push(...page.items.map((entry) => entry.id));
      cursor = page.cursor;
      pages += 1;
      // A guard rather than an assertion at the end: without it the original
      // defect makes this test hang instead of fail.
      expect(pages).toBeLessThanOrEqual(10);
    } while (cursor);

    expect(new Set(seen).size).toBe(created.length);
    expect([...seen].sort()).toEqual([...created].sort());
    expect(pages).toBe(4);
  });

  it('reports a null cursor on the last page, and only there', async () => {
    const repo = freshRepo();
    await seed(repo, ['一', '二', '三', '四']);

    const first = await repo.list({ limit: 2, cursor: null });
    expect(first.cursor).not.toBeNull();

    const second = await repo.list({ limit: 2, cursor: first.cursor });
    expect(second.items).toHaveLength(2);
    expect(second.cursor).toBeNull();
  });

  it('returns an empty page with no cursor for an empty notebook', async () => {
    expect(await freshRepo().list({ limit: 10, cursor: null })).toEqual({
      items: [],
      cursor: null,
    });
  });

  it('does not report a cursor when the page exactly empties the collection', async () => {
    const repo = freshRepo();
    await seed(repo, ['一', '二']);
    // Off-by-one bait: the adapter fetches limit + 1 to answer "is there more".
    expect((await repo.list({ limit: 2, cursor: null })).cursor).toBeNull();
  });

  /**
   * **The timestamps are written here rather than inherited from the clock,
   * and that is the fix for a flake this test used to produce.**
   *
   * Seeding through `create` and trusting the order the writes arrived in was
   * wrong, and the measurement says why. The emulator resolves
   * `serverTimestamp()` to the millisecond — across 180 documents every value
   * it returned was a whole number of milliseconds — while two awaited creates
   * are roughly one millisecond apart: over 120 consecutive pairs the median
   * gap was 999,936ns and the minimum was zero. Three documents seeded this way
   * therefore shared a `createdAt` in 3 rounds out of 60.
   *
   * A tie is not a defect and the query already answers it: it falls through to
   * `documentId() desc`, and an auto-id is random, so the tied pair comes back
   * in an order unrelated to when it was written. What was broken was this
   * test, which reported an ordering bug that was not there — and reported it
   * rarely enough to read as noise.
   *
   * Written through the adapter first so the document shape is real, then given
   * distinct timestamps directly. The claim is that the query orders by
   * `createdAt` descending, and that is exactly what is still exercised; the
   * resolution of somebody else's clock never was the claim.
   */
  it('orders newest first, so a word added today is not on the last page', async () => {
    const uid = `it-order-${randomUUID()}`;
    const repo = createEntryRepository(db, uid);
    const ids = await seed(repo, ['一番目', '二番目', '三番目']);

    // A minute apart, which no clock resolution can tie.
    for (const [minute, id] of ids.entries()) {
      await setDoc(
        doc(db, 'users', uid, 'entries', id),
        { createdAt: Timestamp.fromDate(new Date(Date.UTC(2026, 5, 24, 9, minute))) },
        { merge: true },
      );
    }

    const page = await repo.list({ limit: 10, cursor: null });
    expect(page.items.map((entry) => entry.headword)).toEqual(['三番目', '二番目', '一番目']);
  });

  /**
   * The 67 migrated entries are written in one batch and can share a
   * `createdAt` to the microsecond. Ordering on that field alone would give
   * Firestore no defined order between them, and a page boundary landing inside
   * the tie could drop or repeat rows — which is why the query also orders by
   * document id.
   */
  it('pages consistently through documents that share a createdAt', async () => {
    const shared = Timestamp.fromDate(new Date('2026-06-24T09:00:00.000Z'));
    const uid = `it-tie-${randomUUID()}`;
    const tied = createEntryRepository(db, uid);

    // Written through the adapter first so the shape is real, then given an
    // identical createdAt directly. Not because serverTimestamp() cannot
    // collide — measured against this emulator it collides about one seeding in
    // twenty, which is what the ordering test above had to be rewritten for —
    // but because a tie that happens sometimes proves nothing on the runs where
    // it does not.
    const ids = await seed(tied, ['甲', '乙', '丙', '丁', '戊']);
    for (const id of ids) {
      await setDoc(doc(db, 'users', uid, 'entries', id), { createdAt: shared }, { merge: true });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await tied.list({ limit: 2, cursor });
      seen.push(...page.items.map((entry) => entry.id));
      cursor = page.cursor;
      pages += 1;
      // Same guard as above, for the same reason: a paging defect makes this
      // loop forever, and a test that hangs to the timeout reads like flake
      // rather than the regression it is.
      expect(pages).toBeLessThanOrEqual(10);
    } while (cursor);

    expect(new Set(seen).size).toBe(ids.length);
  });
});

describe('dashboard reads', () => {
  it('counts learned dates from Firestore without reading every entry document', async () => {
    const repo = freshRepo();
    await repo.create(draft({ headword: '今週', learnedOn: '2026-06-24' }));
    await repo.create(draft({ headword: '先月', learnedOn: '2026-05-31' }));

    expect(await repo.countLearnedSince('2026-06-01')).toBe(1);
    expect(await repo.countLearnedSince('2026-01-01')).toBe(2);
  });

  it('returns the recent learned words without walking the whole notebook', async () => {
    const repo = freshRepo();
    await repo.create(draft({ headword: '古い', learnedOn: '2026-01-01' }));
    await repo.create(draft({ headword: '新しい', learnedOn: '2026-06-24' }));
    await repo.create(draft({ headword: '中間', learnedOn: '2026-03-15' }));

    const recent = await repo.recentLearned(2);

    expect(recent.map((entry) => entry.headword)).toEqual(['新しい', '中間']);
  });

  it('pages the selected heatmap day instead of filtering a full notebook in memory', async () => {
    const repo = freshRepo();
    await repo.create(draft({ headword: '一', learnedOn: '2026-06-24' }));
    await repo.create(draft({ headword: '二', learnedOn: '2026-06-24' }));
    await repo.create(draft({ headword: '三', learnedOn: '2026-06-24' }));
    await repo.create(draft({ headword: '別日', learnedOn: '2026-06-23' }));

    const first = await repo.listLearnedOn('2026-06-24', { limit: 2, cursor: null });
    const second = await repo.listLearnedOn('2026-06-24', { limit: 2, cursor: first.cursor });

    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect([...first.items, ...second.items].map((entry) => entry.learnedOn)).toEqual([
      '2026-06-24',
      '2026-06-24',
      '2026-06-24',
    ]);
  });

  it('returns null dashboard stats until the post-deploy backfill has written them', async () => {
    expect(await freshRepo().dashboardStats()).toBeNull();
  });

  it('updates the dashboard stats document on writes after backfill has created it', async () => {
    const uid = `it-stats-${randomUUID()}`;
    const repo = createEntryRepository(db, uid);
    const statsRef = doc(db, 'users', uid, 'stats', 'vocabulary');
    await setDoc(statsRef, {
      ownerUid: uid,
      total: 0,
      countsByDay: {},
      jlptCounts: {},
      posCounts: {},
      updatedAt: Timestamp.fromDate(new Date('2026-06-24T09:00:00.000Z')),
    });

    const id = await repo.create(
      draft({ learnedOn: '2026-06-24', jlpt: 'N2', pos: ['名詞', '動詞'] }),
    );
    await repo.update(id, draft({ learnedOn: '2026-06-25', jlpt: 'N1', pos: ['副詞'] }));
    await repo.remove(id);

    const stats = (await getDoc(statsRef)).data();
    expect(stats?.total).toBe(0);
    expect(stats?.countsByDay).toEqual({});
    expect(stats?.jlptCounts).toEqual({});
    expect(stats?.posCounts).toEqual({});
  });
});

describe('update', () => {
  it('applies the edit and moves updatedAt without touching createdAt', async () => {
    const repo = freshRepo();
    const id = await repo.create(draft({ headword: '兆候' }));
    const before = await repo.get(id);

    await repo.update(id, draft({ headword: '前兆', definition: '起こる前のしるし。' }));
    const after = await repo.get(id);

    expect(after?.headword).toBe('前兆');
    expect(after?.definition).toBe('起こる前のしるし。');
    expect(after?.createdAt).toBe(before?.createdAt);
    // Not `not.toBe('')`: the stamp written at creation is already non-empty,
    // so that form stays green even with `updatedAt: serverTimestamp()` deleted
    // from update(). Comparing against the value before the edit is what makes
    // this a test of the thing its name claims.
    expect(after?.updatedAt).not.toBe(before?.updatedAt);
  });

  /**
   * `update` spreads an `EntryDraft`, which has no ownership or publication
   * fields — so an edit cannot blank out what publishing set, even though the
   * write is a partial update over the same document.
   */
  it('leaves ownership and publication state alone', async () => {
    const uid = `it-pub-${randomUUID()}`;
    const repo = createEntryRepository(db, uid);
    const id = await repo.create(draft());

    await updateDoc(doc(db, 'users', uid, 'entries', id), {
      publishedId: 'pub-1',
      publishedVersion: 2,
    });

    await repo.update(id, draft({ headword: '編集後' }));
    const after = await repo.get(id);

    expect(after?.headword).toBe('編集後');
    expect(after?.ownerUid).toBe(uid);
    expect(after?.publishedId).toBe('pub-1');
    expect(after?.publishedVersion).toBe(2);
  });
});

describe('remove', () => {
  it('deletes the entry and drops it from the listing', async () => {
    const repo = freshRepo();
    const [keep, drop] = await seed(repo, ['残す', '消す']);

    await repo.remove(drop!);

    expect(await repo.get(drop!)).toBeNull();
    const page = await repo.list({ limit: 10, cursor: null });
    expect(page.items.map((entry) => entry.id)).toEqual([keep]);
  });
});
