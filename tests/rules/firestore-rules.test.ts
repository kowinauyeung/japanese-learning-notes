import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import type { PracticeSessionDraft } from '@/domain/practice';
import { emptyDraft } from '@/lib/draft';
import { makeWordSet } from '../fixtures/wordSet';

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
   *
   * The published-copy version of this went with the publishing rules. The
   * property survives it: revocation has to take away update and delete on what
   * the account already wrote, not only create. Gating `create` alone would
   * leave a revoked account editing its own notebook indefinitely, which is the
   * gap the first review round found.
   */
  it('takes away update and delete on what a revoked account already wrote', async () => {
    const db = asStranger(ALICE);

    await assertFails(db.doc(`users/${ALICE}/entries/e1`).update({ headword: 'edited' }));
    await assertFails(db.doc(`users/${ALICE}/entries/e1`).delete());
    // ...and reading it, which it could do a moment ago.
    await assertFails(db.doc(`users/${ALICE}/entries/e1`).get());
  });
});

/**
 * Publishing is designed and unbuilt, and the paths it would use are shut.
 *
 * `PublicationRepository` is a port with no adapter and no interface in front
 * of it, so nothing in the application has ever written here — while the rules
 * permitted create, update and delete with **no shape or size validation at
 * all**. The only collections an allowed account could write anything it liked
 * to were the two that nothing writes.
 *
 * These tests are what stops that reopening by accident. When publishing is
 * built they are replaced by the properties listed in `firestore.rules` where
 * the old block was — reads open to any allowed account, a snapshot entry
 * readable only while its parent set exists, ownerUid never reassigned, the
 * parent set checked with `getAfter`, delete exempt from that check, every
 * mutation gated on `isAllowed()`, shape validation, and deletion and export
 * covering published copies.
 *
 * The twelve tests that covered those properties are in pull request #30. This
 * docblock points at the rules and the rules point at that pull request, so
 * neither is a step in a circle.
 */
describe('publishing, which is not built', () => {
  /**
   * The seeded documents exist — `beforeEach` writes them with rules disabled,
   * as a partly-built feature or an earlier deploy would have left them. Being
   * unreadable is therefore a fact about the rules and not about the fixture.
   */
  it('refuses to read a published copy, to its owner as much as to anyone else', async () => {
    for (const db of [as(ALICE), as(BOB)]) {
      await assertFails(db.doc(`publicEntries/pe-alice`).get());
      await assertFails(db.doc(`publicSets/set-alice`).get());
      await assertFails(db.doc(`publicSets/set-alice/entries/x1`).get());
    }
  });

  it('refuses to create one, which is the write nothing in the app makes', async () => {
    const db = as(ALICE);
    await assertFails(db.doc(`publicEntries/pe-new`).set(snapshotEntry(ALICE)));
    await assertFails(db.doc(`publicSets/set-new`).set({ ...snapshotEntry(ALICE), entryCount: 0 }));
    await assertFails(db.doc(`publicSets/set-alice/entries/x2`).set(snapshotEntry(ALICE)));
  });

  /**
   * Owning the document is not an exception. Ownership was the whole basis of
   * the rules this replaces, so a check that let the owner through would leave
   * the surface exactly as wide as it was.
   */
  it('refuses to update or delete one, including by its own owner', async () => {
    const db = as(ALICE);
    await assertFails(db.doc(`publicEntries/pe-alice`).update({ version: 2 }));
    await assertFails(db.doc(`publicEntries/pe-alice`).delete());
    await assertFails(db.doc(`publicSets/set-alice`).update({ entryCount: 99 }));
    await assertFails(db.doc(`publicSets/set-alice`).delete());
    await assertFails(db.doc(`publicSets/set-alice/entries/x1`).update({ searchText: 'e' }));
    await assertFails(db.doc(`publicSets/set-alice/entries/x1`).delete());
  });

  /**
   * The batch a first publish would have used. It is the one shape that could
   * plausibly slip past a rule written only against single writes, which is why
   * it is named here rather than folded into the create case above.
   */
  it('refuses the one-batch first publish the old getAfter check existed for', async () => {
    const db = as(ALICE);
    const batch = db.batch();
    batch.set(db.doc(`publicSets/set-first`), { ...snapshotEntry(ALICE), entryCount: 1 });
    batch.set(db.doc(`publicSets/set-first/entries/x1`), snapshotEntry(ALICE));
    await assertFails(batch.commit());
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
      db
        .doc(`users/${ALICE}/entries/dated`)
        .set(entry(ALICE, { createdAt: new Date('2026-01-01') })),
    );
    await assertFails(
      db.doc(`users/${ALICE}/entries/dated`).update({ createdAt: new Date('2020-01-01') }),
    );
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

  /**
   * The hole every size cap above left open.
   *
   * `keys().size()` counts fields and never looks at their names, so a document
   * naming one field the rules check and one they have never heard of passed
   * everything: the count was small, the strings named were short, and the
   * large one was invisible. A megabyte under a key nobody validates is the
   * same bill as a megabyte under `definition`, and only one of them was
   * bounded.
   */
  it('refuses a field the schema has no name for, however small', async () => {
    const db = as(ALICE);
    await assertFails(db.doc(`users/${ALICE}/entries/x`).set(entry(ALICE, { junk: 'x' })));
    await assertFails(db.doc(`users/${ALICE}/wordSets/x`).set(wordSet(ALICE, { junk: 'x' })));
    await assertFails(
      db.doc(`users/${ALICE}/practiceSessions/x`).set(session(ALICE, { junk: 'x' })),
    );
    await assertFails(
      db.doc(`users/${ALICE}/progress/entries`).set({ ownerUid: ALICE, entries: {}, junk: 'x' }),
    );
  });

  /**
   * Being on the allowlist is permission to send a field, not a limit on it.
   *
   * `hasOnly` closed the unknown-name half of the hole and left the other half
   * exactly where it was: fifteen of the twenty-eight permitted names had no
   * type or size check, so `{ ownerUid, headword: 'x', migrationKey: <a
   * megabyte> }` passed for the same reason `junk` used to — nothing looked at
   * the field that was large.
   *
   * `createdAt` is the sharpest of them. `keepsCreatedAt` pins it to the stored
   * value on update and says nothing about the create that stored it, so before
   * the `is timestamp` check a new entry could carry a string of any length on
   * the one key the rules treat as bookkeeping.
   */
  it('refuses an oversized value in a field the allowlist permits', async () => {
    const db = as(ALICE);
    const path = `users/${ALICE}/entries/x`;
    await assertFails(db.doc(path).set(entry(ALICE, { migrationKey: long(201) })));
    await assertFails(db.doc(path).set(entry(ALICE, { learnedOn: long(11) })));
    await assertFails(db.doc(path).set(entry(ALICE, { jlpt: long(11) })));
    await assertFails(db.doc(path).set(entry(ALICE, { freq: 99 })));
    // A string where the adapter writes a server timestamp.
    await assertFails(db.doc(path).set(entry(ALICE, { createdAt: long(5000) })));
  });

  /**
   * One document per account, and `entries` is all of it. `hasOnly` stops a
   * stray key name and does not look inside the one key that matters, so the
   * only ceiling here was Firestore's 1 MiB.
   */
  it('refuses a progress map holding more words than a notebook has', async () => {
    const db = as(ALICE);
    const entries = Object.fromEntries(
      Array.from({ length: 5001 }, (_, i) => [`e${i}`, { status: 'wrong' }]),
    );
    await assertFails(db.doc(`users/${ALICE}/progress/entries`).set({ ownerUid: ALICE, entries }));
  });

  /**
   * **`migrationKey` is not in the domain `Entry` and is on every migrated
   * document.** `migration/upload.mjs` writes it as provenance, and an update
   * sends the merged document — so an allowlist built from the TypeScript type
   * would refuse every edit to all 67 migrated words. It would pass here, pass
   * in review, and fail only in production, where the migration has been run.
   *
   * This is the test that says the list came from what is stored.
   */
  it('accepts migrationKey, which the migration writes and the domain type does not name', async () => {
    const db = as(ALICE);
    await assertSucceeds(
      db.doc(`users/${ALICE}/entries/migrated`).set(entry(ALICE, { migrationKey: 'ある-1' })),
    );
    // The update path is the one that actually breaks: it re-sends the stored
    // key alongside the edit, whether or not the edit mentions it.
    await assertSucceeds(db.doc(`users/${ALICE}/entries/migrated`).update({ headword: '別の語' }));
  });

  /**
   * Nothing in the application writes `users/{uid}` itself — there is no
   * profile and no adapter addresses the path — so the create it used to permit
   * described a feature that does not exist while accepting any twenty fields
   * of any names. Deleting stays, because account deletion needs it.
   */
  it('refuses to create the user document, which nothing writes', async () => {
    const db = as(ALICE);
    await assertFails(db.doc(`users/${ALICE}`).set({ displayName: 'x' }));
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
        // Dates, not ISO strings: `serverTimestamp()` lands as a Timestamp, and
        // this test exists to send what the adapter sends. It said so and did
        // not — the two stamps were the one part of the payload written by hand
        // in a shape the adapter never produces.
        createdAt: new Date('2026-08-13T00:00:00.000Z'),
        updatedAt: new Date('2026-08-13T00:00:00.000Z'),
      }),
    );
  });

  it('accepts the document wordSetRepo.create sends', async () => {
    const db = as(ALICE);
    // The stored document is `WordSet` minus its id — the adapter fills
    // ownership, publication state and both stamps itself.
    const { id: _id, createdAt, updatedAt, ...storedSet } = makeWordSet({ ownerUid: ALICE });
    await assertSucceeds(
      // Through the factory rather than a literal, which is what makes this a
      // drift guard: `makeWordSet` is typed `WordSet`, so a field added to the
      // domain arrives here on its own and turns this red until it is
      // allowlisted. A hand-written literal cannot do that, and the mistake it
      // would miss is refused in production and nowhere else.
      db.doc(`users/${ALICE}/wordSets/real`).set({
        ...storedSet,
        createdAt: new Date(createdAt),
        updatedAt: new Date(updatedAt),
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
    // Annotated rather than inferred, for the same reason the word set goes
    // through its factory: a field added to `PracticeSessionDraft` makes this
    // literal a type error, so the drift is caught at `yarn typecheck` instead
    // of in production.
    const draft: PracticeSessionDraft = {
      mode: 'flashcard',
      filterLabel: 'すべて',
      total: 10,
      correct: 8,
      missed: ['e1', 'e2'],
      startedAt: '2026-08-13T00:00:00.000Z',
    };
    await assertSucceeds(
      db.doc(`users/${ALICE}/practiceSessions/real`).set({
        ...draft,
        ownerUid: ALICE,
        finishedAt: new Date('2026-08-13T00:01:00.000Z'),
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
