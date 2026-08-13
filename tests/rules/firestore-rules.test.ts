import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { emptyDraft } from '@/lib/draft';

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

/**
 * Signed in *and* allowed. The gate is a custom claim now rather than a
 * document read, so a test that forgets it is denied for the right reason.
 */
const as = (uid: string) =>
  testEnv.authenticatedContext(uid, { email_verified: true, allowed: true }).firestore();

/** Signed in, verified, and not on the list. */
const asStranger = (uid: string) =>
  testEnv.authenticatedContext(uid, { email_verified: true }).firestore();

/** A whole entry, the shape `sanitizeDraft` produces. Overrides go last. */
const entry = (ownerUid: string, over: Record<string, unknown> = {}) => ({
  ownerUid,
  headword: '清高',
  reading: 'せいこう',
  definition: '清らかで気高いこと。',
  definitionSub: '',
  source: '',
  citationForm: '',
  pitchAccent: 0,
  pos: ['名詞'],
  tags: [],
  senses: [],
  examples: [],
  related: [],
  ...over,
});

const wordSet = (ownerUid: string, over: Record<string, unknown> = {}) => ({
  ownerUid,
  name: '仕事',
  description: '',
  entryIds: [],
  topics: [],
  ...over,
});

const session = (ownerUid: string, over: Record<string, unknown> = {}) => ({
  ownerUid,
  filterLabel: 'すべて',
  total: 10,
  correct: 8,
  missed: ['e1'],
  ...over,
});

/** `n` characters, for the length caps. */
const long = (n: number) => 'あ'.repeat(n);

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

    await db.doc(`users/${ALICE}/entries/e1`).set(entry(ALICE));
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
    await assertSucceeds(db.doc(`users/${ALICE}/entries/e2`).set(entry(ALICE)));
    await assertSucceeds(db.collection(`users/${ALICE}/entries`).get());
  });

  it("denies another allowlisted user everything in someone else's notebook", async () => {
    const db = as(BOB);
    await assertFails(db.doc(`users/${ALICE}/entries/e1`).get());
    await assertFails(db.collection(`users/${ALICE}/entries`).get());
    await assertFails(db.doc(`users/${ALICE}/entries/e1`).update({ headword: 'x' }));
    await assertFails(db.doc(`users/${ALICE}/entries/e1`).delete());
    await assertFails(db.doc(`users/${ALICE}/entries/e9`).set(entry(BOB)));
  });

  it('denies the subcollections too, not just the top document', async () => {
    const db = as(BOB);
    await assertFails(db.doc(`users/${ALICE}/wordSets/s1`).get());
    // The practice paths the app actually writes: one document holding every
    // word's progress, and one document per finished session.
    await assertFails(db.doc(`users/${ALICE}/progress/entries`).get());
    await assertFails(db.doc(`users/${ALICE}/progress/entries`).set({ entries: {} }));
    await assertFails(db.doc(`users/${ALICE}/practiceSessions/p1`).set(session(BOB)));
  });

  it('denies an unauthenticated client', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.doc(`users/${ALICE}/entries/e1`).get());
    await assertFails(db.doc(`publicEntries/pe-alice`).get());
  });
});

describe('the allowedUsers gate', () => {
  it('denies a signed-in user who is not on the allowlist', async () => {
    const db = asStranger(MALLORY);
    await assertFails(db.doc(`users/${MALLORY}/entries/e1`).set(entry(MALLORY)));
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
  /**
   * Revocation is the claim going away, not a document being deleted.
   *
   * That is a real change in what "revoked" means: the claim lives in the ID
   * token, and Firestore rules have no revocation check, so clearing it takes
   * effect only when that token expires — up to an hour. Revoking the refresh
   * tokens ends the session at the next refresh but does not invalidate the
   * token already in hand.
   *
   * **This test is the state after the token has turned over**, which is the
   * one this harness can express: `@firebase/rules-unit-testing` mints tokens
   * directly, so the window itself is not reachable from here.
   */
  it('revokes update and delete on already-published copies, not just create', async () => {
    const db = asStranger(ALICE);

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

  /**
   * A first publish writes the set and its first entries in one batch. Checking
   * the parent with get() would evaluate the children against committed state,
   * where the set does not exist yet, and deny every first publish — the parent
   * check that fixed cross-user injection would have quietly broken publishing
   * itself. getAfter() evaluates the batch's end state instead.
   */
  it('allows a first publish creating the set and its first entry in one batch', async () => {
    const db = as(ALICE);
    const batch = db.batch();
    batch.set(db.doc(`publicSets/set-first`), { ...snapshotEntry(ALICE), entryCount: 1 });
    batch.set(db.doc(`publicSets/set-first/entries/x1`), snapshotEntry(ALICE));
    await assertSucceeds(batch.commit());
  });

  it('refuses a batch that creates the set under another owner', async () => {
    const db = as(ALICE);
    const batch = db.batch();
    batch.set(db.doc(`publicSets/set-spoof`), { ...snapshotEntry(BOB), entryCount: 1 });
    batch.set(db.doc(`publicSets/set-spoof/entries/x1`), snapshotEntry(ALICE));
    await assertFails(batch.commit());
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

/**
 * Shape and size, which exist for one threat and it is not shape.
 *
 * A legitimately signed-in account can write as many documents as it likes, as
 * large as it likes, and on a metered project that is the operator's bill.
 * These are the bounds rules can actually see — **not a schema**: requiring
 * every field to exist turns every schema change into a rules deploy, and a
 * rules deploy that lags a client release denies writes from a version already
 * shipped.
 */
describe('bounds on what an owner may write', () => {
  it('accepts an ordinary entry, word set and session', async () => {
    const db = as(ALICE);
    await assertSucceeds(db.doc(`users/${ALICE}/entries/ok`).set(entry(ALICE)));
    await assertSucceeds(db.doc(`users/${ALICE}/wordSets/ok`).set(wordSet(ALICE)));
    await assertSucceeds(db.doc(`users/${ALICE}/practiceSessions/ok`).set(session(ALICE)));
  });

  it('refuses an entry whose text is far past anything a person types', async () => {
    const db = as(ALICE);
    await assertFails(
      db.doc(`users/${ALICE}/entries/big`).set(entry(ALICE, { headword: long(201) })),
    );
    await assertFails(
      db.doc(`users/${ALICE}/entries/big`).set(entry(ALICE, { definition: long(20001) })),
    );
  });

  it('refuses an entry carrying an unbounded number of rows', async () => {
    const db = as(ALICE);
    const many = Array.from({ length: 101 }, () => ({ label: 'x' }));
    await assertFails(db.doc(`users/${ALICE}/entries/big`).set(entry(ALICE, { senses: many })));
  });

  /** The one list a word set is made of, and the one that grows without limit. */
  it('refuses a word set holding more ids than a notebook has words', async () => {
    const db = as(ALICE);
    const ids = Array.from({ length: 2001 }, (_, i) => `e${i}`);
    await assertFails(db.doc(`users/${ALICE}/wordSets/big`).set(wordSet(ALICE, { entryIds: ids })));
  });

  it('refuses a session claiming more correct answers than questions', async () => {
    const db = as(ALICE);
    await assertFails(
      db.doc(`users/${ALICE}/practiceSessions/x`).set(session(ALICE, { total: 3, correct: 9 })),
    );
  });

  /**
   * ownerUid is what a published snapshot copies, so a row claiming somebody
   * else's uid inside one's own notebook is the seed of a snapshot attributed
   * to a person who never wrote it.
   */
  it("refuses a row in your own notebook that claims somebody else's uid", async () => {
    const db = as(ALICE);
    await assertFails(db.doc(`users/${ALICE}/entries/x`).set(entry(BOB)));
    await assertFails(db.doc(`users/${ALICE}/wordSets/x`).set(wordSet(BOB)));
  });

  it('refuses to rewrite createdAt on an existing row', async () => {
    const db = as(ALICE);
    await assertSucceeds(
      db.doc(`users/${ALICE}/entries/dated`).set(entry(ALICE, { createdAt: '2026-01-01' })),
    );
    await assertFails(db.doc(`users/${ALICE}/entries/dated`).update({ createdAt: '2020-01-01' }));
    await assertSucceeds(db.doc(`users/${ALICE}/entries/dated`).update({ headword: '別の語' }));
  });

  /**
   * The recursive wildcard is gone, so an unlisted path is denied rather than
   * allowed. That is the intended direction and the thing most likely to
   * surprise: adding a collection to the app now means adding it here.
   */
  it('denies a collection nobody listed, even to its owner', async () => {
    const db = as(ALICE);
    await assertFails(db.doc(`users/${ALICE}/somethingNew/x`).set({ ownerUid: ALICE }));
  });
});

/**
 * The shapes the app actually writes, against the rules that will judge them.
 *
 * This exists because nothing else checks it. `tests/integration` connects with
 * `mockUserToken: 'owner'`, which is the emulator's owner credential and
 * **bypasses rules entirely** — so a green adapter suite says nothing about
 * whether the documents it produces are writable in production. The bounds
 * added here are the first rules that can reject a well-formed write, which
 * makes this the first time that gap matters.
 *
 * Built from the production factories rather than by hand: a hand-written copy
 * of the shape is exactly what stops failing when the schema moves.
 */
describe('what the adapters write is what the rules accept', () => {
  it('accepts the document entryRepo.create sends', async () => {
    const db = as(ALICE);
    await assertSucceeds(
      db.doc(`users/${ALICE}/entries/real`).set({
        ...emptyDraft(),
        headword: '清高',
        definition: '清らかで気高いこと。',
        ownerUid: ALICE,
        publishedId: null,
        publishedVersion: 0,
        copiedFrom: null,
        createdAt: '2026-08-13T00:00:00.000Z',
        updatedAt: '2026-08-13T00:00:00.000Z',
      }),
    );
  });

  it('accepts the document wordSetRepo.create sends', async () => {
    const db = as(ALICE);
    await assertSucceeds(
      db.doc(`users/${ALICE}/wordSets/real`).set({
        // The literal WordSets.tsx sends; there is no factory for it.
        name: '仕事',
        description: '',
        entryIds: [],
        level: '',
        topics: [],
        ownerUid: ALICE,
        publishedId: null,
        publishedVersion: 0,
        copiedFrom: null,
        createdAt: '2026-08-13T00:00:00.000Z',
        updatedAt: '2026-08-13T00:00:00.000Z',
      }),
    );
  });

  /**
   * The update path, which none of the creates above reaches.
   *
   * `keepsCreatedAt` compares the incoming `createdAt` against the stored one,
   * and on a create it takes the `resource == null` branch and never makes the
   * comparison — so a suite of creates stays green whatever that comparison
   * does. `entryRepo.update` is the call that meets it: `updateDoc` with the
   * whole draft and a fresh `updatedAt`, and deliberately without `createdAt`
   * or `ownerUid`, both of which therefore reach `request.resource.data` only
   * through the merge.
   *
   * `createdAt` is stored as a `Date` rather than an ISO string because that is
   * what `serverTimestamp()` leaves behind, and the comparison is against
   * whatever type is really in the document.
   */
  it('accepts the whole-draft update entryRepo.update sends over a stored entry', async () => {
    const db = as(ALICE);
    const ref = db.doc(`users/${ALICE}/entries/editable`);
    await assertSucceeds(
      ref.set({
        ...emptyDraft(),
        headword: '清高',
        ownerUid: ALICE,
        publishedId: null,
        publishedVersion: 0,
        copiedFrom: null,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    );
    await assertSucceeds(
      ref.update({
        ...emptyDraft(),
        headword: '清廉',
        definition: '心が清らかで欲がないこと。',
        updatedAt: new Date('2026-08-13T00:00:00.000Z'),
      }),
    );
  });

  it('accepts the whole-draft update wordSetRepo.update sends over a stored set', async () => {
    const db = as(ALICE);
    const ref = db.doc(`users/${ALICE}/wordSets/editable`);
    await assertSucceeds(
      ref.set({
        name: '仕事',
        description: '',
        entryIds: [],
        level: '',
        topics: [],
        ownerUid: ALICE,
        publishedId: null,
        publishedVersion: 0,
        copiedFrom: null,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    );
    await assertSucceeds(
      ref.update({
        name: '仕事（改）',
        description: '',
        entryIds: ['e1'],
        level: 'N2',
        topics: [],
        updatedAt: new Date('2026-08-13T00:00:00.000Z'),
      }),
    );
  });

  /**
   * Why the adapter omits `createdAt` rather than re-sending what it read.
   *
   * The stored value is a Timestamp and a client that round-trips it through
   * the domain type sends back an ISO string. That is not the same value, so
   * `keepsCreatedAt` refuses it — an edit that looks like it changes nothing.
   */
  it('refuses an update that re-sends a stored Timestamp createdAt as a string', async () => {
    const db = as(ALICE);
    const ref = db.doc(`users/${ALICE}/entries/round-tripped`);
    await assertSucceeds(
      ref.set({
        ...emptyDraft(),
        headword: '清高',
        ownerUid: ALICE,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    );
    await assertFails(ref.update({ headword: '清廉', createdAt: '2026-08-01T00:00:00.000Z' }));
  });

  /** `recordSession` writes both documents in one batch; both have to pass. */
  it('accepts both documents recordSession sends', async () => {
    const db = as(ALICE);
    await assertSucceeds(
      db.doc(`users/${ALICE}/practiceSessions/real`).set({
        mode: 'flashcard',
        filterLabel: 'すべて',
        total: 10,
        correct: 8,
        missed: ['e1', 'e2'],
        startedAt: '2026-08-13T00:00:00.000Z',
        ownerUid: ALICE,
        finishedAt: '2026-08-13T00:01:00.000Z',
      }),
    );
    await assertSucceeds(
      db
        .doc(`users/${ALICE}/progress/entries`)
        .set(
          { ownerUid: ALICE, entries: { e1: { status: 'wrong', attempts: 1 } } },
          { merge: true },
        ),
    );
  });
});

/**
 * The four things the review measured, kept measured.
 *
 * Each was true of an earlier version of this file and each contradicted a
 * paragraph in it — which is the pattern worth guarding, not the four cases
 * individually: a rules file whose comments describe a property it does not
 * have is worse than one with no comments, because the next person stops
 * checking.
 */
describe('what the comments in the rules claim', () => {
  /** "Deliberately not a full schema" — which was false while every named field was required. */
  it('accepts an entry missing every optional field', async () => {
    const db = as(ALICE);
    await assertSucceeds(
      db.doc(`users/${ALICE}/entries/minimal`).set({ ownerUid: ALICE, headword: '清高' }),
    );
  });

  it('still refuses one with no headword at all', async () => {
    const db = as(ALICE);
    await assertFails(db.doc(`users/${ALICE}/entries/nameless`).set({ ownerUid: ALICE }));
    await assertFails(
      db.doc(`users/${ALICE}/entries/blank`).set({ ownerUid: ALICE, headword: '' }),
    );
  });

  it('accepts a word set and a session missing their optional fields', async () => {
    const db = as(ALICE);
    await assertSucceeds(
      db.doc(`users/${ALICE}/wordSets/minimal`).set({ ownerUid: ALICE, name: '仕事' }),
    );
    await assertSucceeds(
      db.doc(`users/${ALICE}/practiceSessions/minimal`).set({ ownerUid: ALICE }),
    );
  });

  /**
   * `write` covers delete, and on a delete `request.resource` is null — the
   * same trap `keepsCreatedAt` guards. The parent document was the one place
   * that kept the combined form, so deleting it failed with a message about
   * null rather than about permission. Account deletion is the next caller.
   */
  it('lets the owner delete their own user document', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`users/${ALICE}`).set({ nickname: 'alice' });
    });
    await assertSucceeds(as(ALICE).doc(`users/${ALICE}`).delete());
  });

  /**
   * `progress` was a wildcard with no bound of any kind — the one path in the
   * file that was the threat the file names rather than a defence against it.
   */
  it('refuses a progress document other than the one the adapter writes', async () => {
    const db = as(ALICE);
    await assertSucceeds(
      db.doc(`users/${ALICE}/progress/entries`).set({ ownerUid: ALICE, entries: {} }),
    );
    await assertFails(db.doc(`users/${ALICE}/progress/junk`).set({ ownerUid: ALICE, entries: {} }));
  });

  it('refuses a progress document claiming another owner', async () => {
    const db = as(ALICE);
    await assertFails(
      db.doc(`users/${ALICE}/progress/entries`).set({ ownerUid: BOB, entries: {} }),
    );
  });
});
