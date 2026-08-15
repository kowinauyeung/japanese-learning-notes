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
