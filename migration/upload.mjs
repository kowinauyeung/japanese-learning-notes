// Push the parsed entries into Firestore.
//
//   node migration/upload.mjs --owner you@example.com              -> goitei-dev
//   node migration/upload.mjs prod --owner you@example.com --confirm
//
// Entries live at users/{uid}/entries/{autoId}. The uid is resolved from
// --owner through the Admin SDK, so the script never guesses whose notebook it
// is writing into.
//
// Re-runnable, but not the way it used to be. Document ids used to be the note
// filenames, so `set()` on a known id converged. Ids are auto-generated now —
// slugs are unique per user at best and would collide the moment anything is
// shared — so the old slug rides along as `migrationKey` and this script reads
// the collection once to map key -> document before deciding update or create.
// Without that a second run would create 67 duplicates.
//
// Credentials, in order of preference:
//   1. .gcloud/application_default_credentials.json  (`yarn auth:login`)
//   2. $GOOGLE_APPLICATION_CREDENTIALS
//   3. migration/service-account-<env>.json
//
// ADC is preferred because it leaves no long-lived private key on disk: the
// credential expires, is tied to a Google account, and can be revoked
// centrally. A service-account key file is the opposite on all three counts,
// and it bypasses Firestore security rules entirely.
//
// The ADC is deliberately kept *inside the repo* via CLOUDSDK_CONFIG rather
// than in ~/.config/gcloud. On a shared or work machine the machine-wide ADC
// may belong to a different identity, and overwriting it would disrupt whatever
// else uses gcloud there. The machine-wide credential is therefore never picked
// up implicitly — pass --use-global-adc if you really want it.

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const flag = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

// ------------------------------------------------------------------ target

const env = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'dev';
if (!['dev', 'prod'].includes(env)) {
  console.error(`環境は dev か prod: "${env}" は不正`);
  process.exit(1);
}
// Production is the copy that matters; make overwriting it deliberate.
if (env === 'prod' && !process.argv.includes('--confirm')) {
  console.error('本番へ書き込むには --confirm を付けてください');
  process.exit(1);
}

const ownerEmail = flag('--owner');
if (!ownerEmail) {
  console.error(
    '所有者を指定してください: --owner you@example.com\n' +
      'エントリは users/{uid}/entries に書き込まれるため、uid の解決が必須です。',
  );
  process.exit(1);
}

// .firebaserc is the single source of truth for alias -> project id.
const { projects } = JSON.parse(readFileSync(join(ROOT, '.firebaserc'), 'utf8'));
const projectId = projects[env];
if (!projectId) {
  console.error(`.firebaserc に "${env}" のプロジェクトがありません`);
  process.exit(1);
}

// ------------------------------------------------------------- credentials

function resolveCredential() {
  const localAdc = join(ROOT, '.gcloud', 'application_default_credentials.json');
  if (existsSync(localAdc)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = localAdc;
    return { credential: applicationDefault(), how: 'ADC (.gcloud/, repo-local)' };
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return {
      credential: applicationDefault(),
      how: `GOOGLE_APPLICATION_CREDENTIALS=${process.env.GOOGLE_APPLICATION_CREDENTIALS}`,
    };
  }

  const keyPath = join(HERE, `service-account-${env}.json`);
  if (existsSync(keyPath)) {
    const key = JSON.parse(readFileSync(keyPath, 'utf8'));
    return { credential: cert(key), how: `service-account-${env}.json` };
  }

  // Opt-in only: this credential may belong to someone else entirely.
  const globalAdc = join(homedir(), '.config', 'gcloud', 'application_default_credentials.json');
  if (process.argv.includes('--use-global-adc') && existsSync(globalAdc)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = globalAdc;
    return { credential: applicationDefault(), how: `ADC (machine-wide: ${globalAdc})` };
  }

  console.error(
    '認証情報が見つかりません。次を実行してください:\n' +
      '  yarn auth:login        (推奨 — 鍵ファイル不要、gcloud 設定はこの repo 内に隔離)\n' +
      `  もしくは Firebase Console の鍵を ${keyPath} に保存`,
  );
  process.exit(1);
}

// --------------------------------------------------------------------- data

const entriesPath = join(HERE, 'output.json');
if (!existsSync(entriesPath)) {
  console.error('migration/output.json がありません。先に `yarn migrate:parse` を実行してください');
  process.exit(1);
}
const entries = JSON.parse(readFileSync(entriesPath, 'utf8'));

// -------------------------------------------------------------------- write

const { credential, how } = resolveCredential();
initializeApp({ credential, projectId });
const db = getFirestore();

let owner;
try {
  owner = await getAuth().getUserByEmail(ownerEmail);
} catch {
  console.error(
    `${ownerEmail} のアカウントが ${projectId} に見つかりません。\n` +
      '一度アプリにログインしてからもう一度実行してください。',
  );
  process.exit(1);
}

const collection = db.collection('users').doc(owner.uid).collection('entries');

console.log(`環境  : ${env} (${projectId})`);
console.log(`認証  : ${how}`);
console.log(`所有者: ${ownerEmail} (${owner.uid})`);
console.log(`件数  : ${entries.length}`);

// **This checks. It used to grant, and the difference went unreported.**
//
// Until the claim gate landed, the rules read `allowedUsers/{uid}` and this
// script wrote it, so an owner could not end up locked out of a notebook it had
// just uploaded. Nothing has read that collection since. The write went on
// succeeding and the line below went on saying 「確認しました」 — a confirmation
// of something that had stopped being true, printed by the tool an operator
// trusts most at the one moment they most need it to be right.
//
// The failure that produces is not subtle and not recoverable by retrying: the
// script reports access confirmed, the operator opens the app, and every screen
// says it could not load. Checking the claim instead costs nothing —
// `getUserByEmail` above already returned it — and it fails *before* 67
// documents are written rather than after.
//
// It cannot see the other half. A claim reaches a client only in a freshly
// minted ID token, so an account granted access while signed in still cannot
// read anything until it signs in again. Nothing server-side can observe that,
// which is why the message says it rather than checking it.
if (owner.customClaims?.allowed !== true) {
  console.error(`許可    : ${ownerEmail} に allowed クレームがありません。`);
  console.error(`          yarn allow ${ownerEmail}${env === 'prod' ? ' prod' : ''}`);
  console.error('          を実行し、サインアウトしてからサインインし直してください。');
  process.exit(1);
}
console.log(`許可    : allowed クレームを確認しました`);
console.log('          （付与直後の場合は、一度サインアウトして入り直す必要があります）');

// One read of the collection buys idempotency: without the key -> id map a
// second run cannot tell an already-uploaded note from a new one.
const existing = new Map();
for (const doc of (await collection.get()).docs) {
  const key = doc.get('migrationKey');
  if (key) existing.set(key, doc.ref);
}
console.log(`既存    : ${existing.size} 件が migrationKey 付きで見つかりました`);

// Firestore caps a batch at 500 writes; chunking keeps this correct as the
// collection grows past that.
const CHUNK = 400;
let created = 0;
let updated = 0;

for (let i = 0; i < entries.length; i += CHUNK) {
  const batch = db.batch();
  for (const entry of entries.slice(i, i + CHUNK)) {
    // `wordSets` is dropped: set membership moved onto the set itself, where it
    // can carry study order. It was empty on every one of these entries anyway.
    const { id, createdAt, updatedAt, wordSets, ...rest } = entry;
    void wordSets;

    const ref = existing.get(id) ?? collection.doc();
    existing.has(id) ? updated++ : created++;

    batch.set(ref, {
      ...rest,
      ownerUid: owner.uid,
      // Provenance back to output.json, and the key this script re-runs on.
      // Migration-only: it is absent from the domain `Entry` and must never be
      // carried into a published snapshot.
      migrationKey: id,
      publishedId: null,
      publishedVersion: 0,
      copiedFrom: null,
      createdAt: Timestamp.fromDate(new Date(createdAt)),
      updatedAt: Timestamp.fromDate(new Date(updatedAt)),
    });
  }
  await batch.commit();
  console.log(`  ${Math.min(i + CHUNK, entries.length)}/${entries.length}`);
}

const total = await collection.count().get();
console.log(`完了。新規 ${created} 件 / 更新 ${updated} 件`);
console.log(`users/${owner.uid}/entries の総数: ${total.data().count}`);

// Deleting the pre-ownership top-level collection runs last, and only once the
// new copy is present and counted.
//
// It used to run first, which meant a write that failed part-way through left
// neither copy intact. Ordering it after the verification costs nothing — the
// old collection is already unreachable, since no rule matches that path any
// more — and turns a destructive step into one that can only run on a
// known-good result.
//
// Note this is genuinely destructive: it also removes the entries created
// through the app that are absent from output.json. On dev that is intended
// (the data is disposable test material). Do not pass this flag anywhere the
// difference matters without exporting first.
if (process.argv.includes('--wipe-legacy')) {
  if (total.data().count < entries.length) {
    console.error(
      `新 collection が ${total.data().count} 件しかありません（期待 ${entries.length} 件）。` +
        '\n旧 collection は削除しません。upload を確認してからやり直してください。',
    );
    process.exit(1);
  }
  const legacy = await db.collection('entries').get();
  console.log(`旧 entries コレクション: ${legacy.size} 件を削除します`);
  for (let i = 0; i < legacy.docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of legacy.docs.slice(i, i + 400)) batch.delete(doc.ref);
    await batch.commit();
  }
  console.log('  削除完了');
}
