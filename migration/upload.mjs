// Push the parsed entries into Firestore.
//
//   node migration/upload.mjs            -> goitei-dev
//   node migration/upload.mjs prod --confirm
//
// Re-runnable: document ids are derived from the note filenames, so a second
// run overwrites the same documents instead of duplicating them.
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
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// ------------------------------------------------------------------ target

const env = process.argv[2] ?? 'dev';
if (!['dev', 'prod'].includes(env)) {
  console.error(`環境は dev か prod: "${env}" は不正`);
  process.exit(1);
}
// Production is the copy that matters; make overwriting it deliberate.
if (env === 'prod' && !process.argv.includes('--confirm')) {
  console.error('本番へ書き込むには --confirm を付けてください');
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

console.log(`環境  : ${env} (${projectId})`);
console.log(`認証  : ${how}`);
console.log(`件数  : ${entries.length}`);

// Firestore caps a batch at 500 writes; chunking keeps this correct as the
// collection grows past that.
const CHUNK = 400;
let written = 0;
for (let i = 0; i < entries.length; i += CHUNK) {
  const batch = db.batch();
  for (const entry of entries.slice(i, i + CHUNK)) {
    const { id, createdAt, updatedAt, ...rest } = entry;
    batch.set(db.collection('entries').doc(id), {
      ...rest,
      createdAt: Timestamp.fromDate(new Date(createdAt)),
      updatedAt: Timestamp.fromDate(new Date(updatedAt)),
    });
  }
  await batch.commit();
  written += Math.min(CHUNK, entries.length - i);
  console.log(`  ${written}/${entries.length}`);
}

const snapshot = await db.collection('entries').count().get();
console.log(`完了。entries コレクションの総数: ${snapshot.data().count}`);
