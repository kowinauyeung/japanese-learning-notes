import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, Timestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UserProfileDraft } from '@/domain/user';
import { createUserRepository } from '@/infra/firebase/userRepo';

let app: FirebaseApp;
let db: Firestore;

const draft = (overrides: Partial<UserProfileDraft> = {}): UserProfileDraft => ({
  nickname: 'Kowin',
  language: 'en',
  translationLanguage: 'zh-Hant',
  theme: 'system',
  ...overrides,
});

beforeAll(() => {
  app = initializeApp({ projectId: 'demo-goitei' }, `userRepo-${randomUUID()}`);
  db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080, { mockUserToken: 'owner' });
});

afterAll(async () => deleteApp(app));

describe('user profile persistence', () => {
  it('creates a profile with server timestamps and reads the domain shape back', async () => {
    const uid = `it-${randomUUID()}`;
    const repo = createUserRepository(db);
    await repo.save(uid, draft());

    expect(await repo.get(uid)).toMatchObject({ uid, nickname: 'Kowin', theme: 'system' });
    const raw = await getDoc(doc(db, 'users', uid));
    expect(raw.get('createdAt')).toBeInstanceOf(Timestamp);
    expect(raw.get('updatedAt')).toBeInstanceOf(Timestamp);
  });

  it('preserves createdAt while updating every setting', async () => {
    const uid = `it-${randomUUID()}`;
    const repo = createUserRepository(db);
    await repo.save(uid, draft());
    const before = (await getDoc(doc(db, 'users', uid))).get('createdAt') as Timestamp;
    await repo.save(uid, draft({ nickname: 'New', language: 'ja', theme: 'dark' }));
    const after = await getDoc(doc(db, 'users', uid));

    expect(after.get('createdAt')).toEqual(before);
    expect(await repo.get(uid)).toMatchObject({ nickname: 'New', language: 'ja', theme: 'dark' });
  });

  it('removes the parent profile explicitly because Firestore does not cascade', async () => {
    const uid = `it-${randomUUID()}`;
    const repo = createUserRepository(db);
    await repo.save(uid, draft());
    await repo.remove(uid);
    expect(await repo.get(uid)).toBeNull();
  });
});

/**
 * The one thing no other layer can see: that the adapter and the rules are
 * talking about the same document.
 *
 * `notDeleted()` in `firestore.rules` refuses a write when
 * `deletedAccounts/{uid}` exists, and `markDeleted` is what puts it there. The
 * rules tests seed that path by hand and the unit tests hold a mock of the
 * port, so an adapter writing `deleted_accounts/{uid}`, or a field under the
 * uid instead of a document at it, leaves every one of them green while the
 * gate never closes on anything. The path below is written out rather than
 * imported for that reason — sharing a constant with the adapter would make
 * both wrong together.
 *
 * `deletedAt` is checked as a resolved `Timestamp` because `serverTimestamp()`
 * is a sentinel until the write lands, and the rule requires a timestamp.
 */
describe('marking an account deleted', () => {
  it('writes the document the rules gate reads, at the path they both name', async () => {
    const uid = `it-${randomUUID()}`;
    await createUserRepository(db).markDeleted(uid);

    const raw = await getDoc(doc(db, 'deletedAccounts', uid));
    expect(raw.exists()).toBe(true);
    expect(raw.get('deletedAt')).toBeInstanceOf(Timestamp);
  });

  it('accepts being called twice, because deletion is retried and is not atomic', async () => {
    const uid = `it-${randomUUID()}`;
    const repo = createUserRepository(db);
    await repo.markDeleted(uid);
    await repo.markDeleted(uid);

    const raw = await getDoc(doc(db, 'deletedAccounts', uid));
    expect(raw.get('deletedAt')).toBeInstanceOf(Timestamp);
  });
});
