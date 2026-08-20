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
import type { WordSetRepository } from '@/domain/ports';
import type { WordSetDraft } from '@/domain/wordSet';
import { createWordSetRepository } from '@/infra/firebase/wordSetRepo';

/**
 * The 単語集 adapter, against a real Firestore.
 *
 * Thin by design — it is the entries adapter's shape with a different
 * collection — so this covers only what is specific to it: that `entryIds`
 * survives a round trip in order, that a duplicate cannot get in, and that
 * deleting a set does not touch the words in it. Everything about cursors is
 * already proved on `entryRepo`, whose query this copies verbatim.
 *
 * Same conventions as the other integration files: rules bypassed with
 * `mockUserToken`, a fresh uid per test instead of cleanup.
 */

let app: FirebaseApp;
let db: Firestore;

const freshUid = () => `it-sets-${randomUUID()}`;

const draft = (overrides: Partial<WordSetDraft> = {}): WordSetDraft => ({
  name: '仕事の語',
  description: '',
  entryIds: [],
  level: '',
  topics: [],
  ...overrides,
});

beforeAll(() => {
  app = initializeApp({ projectId: 'demo-goitei' }, `wordSetRepo-${randomUUID()}`);
  db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080, { mockUserToken: 'owner' });
});

afterAll(async () => {
  await deleteApp(app);
});

const freshRepo = (uid = freshUid()): { repo: WordSetRepository; uid: string } => ({
  repo: createWordSetRepository(db, uid),
  uid,
});

describe('membership', () => {
  /**
   * The order of `entryIds` *is* the study order — it is why membership lives
   * on the set rather than on the entry — so an adapter that let Firestore or
   * the sanitiser reorder it would silently discard the one thing this shape
   * was chosen for.
   */
  it('round-trips entryIds in the order they were given', async () => {
    const { repo } = freshRepo();
    const id = await repo.create(draft({ entryIds: ['c', 'a', 'b'] }));

    expect((await repo.get(id))?.entryIds).toEqual(['c', 'a', 'b']);
  });

  /** A duplicate would deal the same card twice inside one session. */
  it('drops a repeated id on the way in', async () => {
    const { repo } = freshRepo();
    const id = await repo.create(draft({ entryIds: ['a', 'b', 'a'] }));

    expect((await repo.get(id))?.entryIds).toEqual(['a', 'b']);
  });

  it('stamps ownership and publication state the caller never supplied', async () => {
    const { repo, uid } = freshRepo();
    const id = await repo.create(draft());

    const stored = await repo.get(id);
    expect(stored?.ownerUid).toBe(uid);
    expect(stored?.publishedId).toBeNull();
    expect(stored?.publishedVersion).toBe(0);
  });

  it('replaces the member list on update, keeping createdAt', async () => {
    const { repo } = freshRepo();
    const id = await repo.create(draft({ entryIds: ['a'] }));
    const before = await repo.get(id);

    await repo.update(id, draft({ name: '改名', entryIds: ['b', 'c'] }));

    const after = await repo.get(id);
    expect(after?.entryIds).toEqual(['b', 'c']);
    expect(after?.name).toBe('改名');
    expect(after?.createdAt).toBe(before?.createdAt);
  });
});

describe('deleting a set', () => {
  /**
   * A 単語集 is a view over words that exist on their own. Firestore has no
   * cascade, so nothing here *could* remove the entries — this asserts that
   * the adapter does not go looking for them either.
   */
  it('removes the set and leaves the entries it named alone', async () => {
    const { repo, uid } = freshRepo();
    const id = await repo.create(draft({ entryIds: ['kept-entry'] }));

    await repo.remove(id);

    expect(await repo.get(id)).toBeNull();
    // The id is only ever a reference; nothing under entries/ was written by
    // this repository, so the check is that the set document is what went.
    const gone = await getDoc(doc(db, 'users', uid, 'wordSets', id));
    expect(gone.exists()).toBe(false);
  });
});

describe('listing', () => {
  /**
   * The timestamps are written rather than taken from the clock, for the reason
   * recorded at length on `entryRepo`'s copy of this test: the emulator
   * resolves `serverTimestamp()` to the millisecond and two awaited creates are
   * about a millisecond apart, so three of them tie often enough to fail this
   * assertion by chance — the query then orders the tied pair by document id,
   * which is random.
   */
  it('orders newest first, so a set made today is not on the last page', async () => {
    const { repo, uid } = freshRepo();
    const ids: string[] = [];
    for (const name of ['一', '二', '三']) ids.push(await repo.create(draft({ name })));

    // A minute apart, which no clock resolution can tie.
    for (const [minute, id] of ids.entries()) {
      await setDoc(
        doc(db, 'users', uid, 'wordSets', id),
        { createdAt: Timestamp.fromDate(new Date(Date.UTC(2026, 5, 24, 9, minute))) },
        { merge: true },
      );
    }

    const page = await repo.list({ limit: 10, cursor: null });
    expect(page.items.map((item) => item.name)).toEqual(['三', '二', '一']);
    expect(page.cursor).toBeNull();
  });

  it('walks every set exactly once across page boundaries', async () => {
    const { repo } = freshRepo();
    const names = ['a', 'b', 'c', 'd', 'e'];
    for (const name of names) await repo.create(draft({ name }));

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<WordSetRepository['list']>> = await repo.list({
        limit: 2,
        cursor,
      });
      seen.push(...page.items.map((item) => item.name));
      cursor = page.cursor;
      pages += 1;
      // Without this the cursor defect hangs the test instead of failing it.
      expect(pages).toBeLessThanOrEqual(10);
    } while (cursor);

    expect(new Set(seen).size).toBe(names.length);
  });
});
