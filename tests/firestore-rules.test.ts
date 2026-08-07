import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * Security rules are the only thing protecting this data: the app is pure
 * client-side and its Firebase config ships inside the bundle, so anyone can
 * drive Firestore directly with the SDK. Nothing in front of the site changes
 * that. These are therefore the only tests here that cover a security property
 * rather than a behaviour.
 *
 * Run through `yarn test`, which starts the emulator around them.
 */

const PROJECT_ID = 'demo-goitei';

/** On the allowlist. */
const ALICE = 'uid-alice';
/** On the allowlist, and not Alice — the "some other legitimate user" case. */
const BOB = 'uid-bob';
/** Authenticated, verified, and deliberately absent from allowedUsers. */
const MALLORY = 'uid-mallory';

let testEnv: RulesTestEnvironment;

const as = (uid: string) => testEnv.authenticatedContext(uid, { email_verified: true }).firestore();

const snapshotEntry = (ownerUid: string) => ({
  ownerUid,
  ownerNickname: 'nick',
  sourceId: 'src',
  publishedAt: '2026-08-07T00:00:00.000Z',
  version: 1,
  searchText: 'x',
  headword: 'x',
});

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    // allowedUsers is written by admin tooling only; no rule matches it, so
    // seeding has to bypass rules exactly as `upload.mjs` does.
    await db.doc(`allowedUsers/${ALICE}`).set({ email: 'alice@example.com' });
    await db.doc(`allowedUsers/${BOB}`).set({ email: 'bob@example.com' });

    await db.doc(`users/${ALICE}/entries/e1`).set({ ownerUid: ALICE, headword: '清高' });
    await db.doc(`publicEntries/pe-alice`).set(snapshotEntry(ALICE));
    await db.doc(`publicSets/set-alice`).set({ ...snapshotEntry(ALICE), entryCount: 1 });
    await db.doc(`publicSets/set-alice/entries/x1`).set(snapshotEntry(ALICE));
    await db.doc(`publicSets/set-bob`).set({ ...snapshotEntry(BOB), entryCount: 0 });
  });
});

describe('private data under users/{uid}', () => {
  it('lets the owner read and write their own notebook', async () => {
    const db = as(ALICE);
    await assertSucceeds(db.doc(`users/${ALICE}/entries/e1`).get());
    await assertSucceeds(db.doc(`users/${ALICE}/entries/e2`).set({ ownerUid: ALICE }));
    await assertSucceeds(db.collection(`users/${ALICE}/entries`).get());
  });

  it("denies another allowlisted user everything in someone else's notebook", async () => {
    const db = as(BOB);
    await assertFails(db.doc(`users/${ALICE}/entries/e1`).get());
    await assertFails(db.collection(`users/${ALICE}/entries`).get());
    await assertFails(db.doc(`users/${ALICE}/entries/e1`).update({ headword: 'x' }));
    await assertFails(db.doc(`users/${ALICE}/entries/e1`).delete());
    await assertFails(db.doc(`users/${ALICE}/entries/e9`).set({ ownerUid: BOB }));
  });

  it('denies the subcollections too, not just the top document', async () => {
    const db = as(BOB);
    await assertFails(db.doc(`users/${ALICE}/wordSets/s1`).get());
    await assertFails(db.doc(`users/${ALICE}/entryProgress/e1`).set({ attempts: 1 }));
    await assertFails(db.doc(`users/${ALICE}/practiceSessions/p1`).set({ total: 1 }));
  });

  it('denies an unauthenticated client', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.doc(`users/${ALICE}/entries/e1`).get());
    await assertFails(db.doc(`publicEntries/pe-alice`).get());
  });
});

describe('the allowedUsers gate', () => {
  it('denies a signed-in user who is not on the allowlist', async () => {
    const db = as(MALLORY);
    await assertFails(db.doc(`users/${MALLORY}/entries/e1`).set({ ownerUid: MALLORY }));
    await assertFails(db.doc(`users/${MALLORY}/entries/e1`).get());
    await assertFails(db.doc(`publicEntries/pe-alice`).get());
    await assertFails(db.doc(`publicSets/set-alice`).get());
  });

  it('denies an unverified email even when the uid is on the allowlist', async () => {
    const db = testEnv.authenticatedContext(ALICE, { email_verified: false }).firestore();
    await assertFails(db.doc(`users/${ALICE}/entries/e1`).get());
  });

  it('keeps allowedUsers itself unreachable from any client', async () => {
    const db = as(ALICE);
    await assertFails(db.doc(`allowedUsers/${ALICE}`).get());
    await assertFails(db.doc(`allowedUsers/${MALLORY}`).set({ email: 'm@example.com' }));
  });

  /**
   * The gap the first review round found: update and delete were gated on
   * ownership alone, so revoking an account left it able to keep editing what
   * it had already put in front of other people — the one thing revocation is
   * for.
   */
  it('revokes update and delete on already-published copies, not just create', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`allowedUsers/${ALICE}`).delete();
    });
    const db = as(ALICE);

    await assertFails(db.doc(`publicEntries/pe-alice`).update({ searchText: 'edited' }));
    await assertFails(db.doc(`publicEntries/pe-alice`).delete());
    await assertFails(db.doc(`publicSets/set-alice`).update({ entryCount: 99 }));
    await assertFails(db.doc(`publicSets/set-alice`).delete());
    await assertFails(db.doc(`publicSets/set-alice/entries/x1`).update({ searchText: 'e' }));
    await assertFails(db.doc(`publicSets/set-alice/entries/x1`).delete());
    // ...and reading and creating stay denied, as they already were.
    await assertFails(db.doc(`publicEntries/pe-alice`).get());
    await assertFails(db.doc(`publicEntries/pe-new`).set(snapshotEntry(ALICE)));
  });
});

describe('published copies', () => {
  it("lets an allowlisted user read anyone's published content", async () => {
    await assertSucceeds(as(BOB).doc(`publicEntries/pe-alice`).get());
    await assertSucceeds(as(BOB).doc(`publicSets/set-alice`).get());
    await assertSucceeds(as(BOB).doc(`publicSets/set-alice/entries/x1`).get());
  });

  it('lets the owner publish, republish and unpublish', async () => {
    const db = as(ALICE);
    await assertSucceeds(db.doc(`publicEntries/pe-2`).set(snapshotEntry(ALICE)));
    await assertSucceeds(db.doc(`publicEntries/pe-alice`).update({ version: 2 }));
    await assertSucceeds(db.doc(`publicEntries/pe-alice`).delete());
  });

  it('refuses to publish under someone else as owner', async () => {
    await assertFails(as(ALICE).doc(`publicEntries/pe-3`).set(snapshotEntry(BOB)));
  });

  it('refuses to reassign ownerUid on an existing copy', async () => {
    await assertFails(as(ALICE).doc(`publicEntries/pe-alice`).update({ ownerUid: BOB }));
  });

  it("refuses to touch another user's published copy", async () => {
    const db = as(BOB);
    await assertFails(db.doc(`publicEntries/pe-alice`).update({ searchText: 'x' }));
    await assertFails(db.doc(`publicEntries/pe-alice`).delete());
  });
});

describe('snapshot entries under a published set', () => {
  /**
   * The second gap the review found. Checking only the child's own ownerUid
   * answers "who wrote this row" but not "may this row be in this set", so an
   * allowlisted account could inject an entry into somebody else's published
   * set, where it would be served and adopted as part of it.
   */
  it("refuses a create under another user's set", async () => {
    await assertFails(
      as(ALICE).doc(`publicSets/set-bob/entries/injected`).set(snapshotEntry(ALICE)),
    );
  });

  it('refuses a create under a set that does not exist', async () => {
    await assertFails(as(ALICE).doc(`publicSets/set-ghost/entries/x`).set(snapshotEntry(ALICE)));
  });

  it('allows a create under the writer own set', async () => {
    await assertSucceeds(
      as(ALICE).doc(`publicSets/set-alice/entries/x2`).set(snapshotEntry(ALICE)),
    );
  });

  /**
   * Firestore does not cascade deletes, so removing publicSets/{id} leaves this
   * subcollection addressable by anyone who noted the id. Requiring the parent
   * on read means a half-finished unpublish fails closed.
   */
  it('stops serving snapshot entries once the parent set is gone', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`publicSets/set-alice`).delete();
    });
    await assertFails(as(BOB).doc(`publicSets/set-alice/entries/x1`).get());
    await assertFails(as(ALICE).doc(`publicSets/set-alice/entries/x1`).get());
  });

  /** Deliberately exempt from the parent check, so orphans stay cleanable. */
  it('still lets the owner delete an orphaned snapshot entry', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`publicSets/set-alice`).delete();
    });
    await assertSucceeds(as(ALICE).doc(`publicSets/set-alice/entries/x1`).delete());
  });
});

describe('collections that no longer exist', () => {
  it.each(['entries/e1', 'entryProgress/e1', 'practiceSessions/p1', 'wordSets/s1'])(
    'denies the pre-ownership top-level %s',
    async (path) => {
      const db = as(ALICE);
      await assertFails(db.doc(path).get());
      await assertFails(db.doc(path).set({ ownerUid: ALICE }));
    },
  );
});
