import { readFile, writeFile } from 'node:fs/promises';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import {
  injectPreviewToken,
  parseMintPreviewTokenArgs,
} from './mint-preview-app-check-token.shared';

/**
 * Stamps a real, Admin-minted App Check token into a preview channel's built
 * `index.html`, so the client can attest without reCAPTCHA v3 — see
 * `src/infra/firebase/client.ts` for the reader side and why reCAPTCHA cannot
 * do this itself.
 *
 *   yarn mint-preview-appcheck-token --app-id <id> --project goitei-dev --dist dist/index.html
 *
 * Run from `deploy-dev.yml`'s trusted `deploy` job, after `dist/` is
 * downloaded and after `google-github-actions/auth` — never from `build`,
 * which runs the pull request's own code and holds no credential for exactly
 * this reason.
 *
 * **Needs `roles/firebaseappcheck.admin`** (or an equivalent broader admin
 * role) on the deploying service account. This has not been exercised against
 * a live project as of this script's introduction — if `createToken` fails
 * with a permission error, that is the first thing to check, the same way
 * `roles/firebaseauth.admin` was the missing piece for preview sign-in.
 *
 * Fails the deploy rather than deploying without the token: a preview that
 * looks deployed and cannot attest is a worse outcome than a red check,
 * because nothing about a successful-looking deploy says to look here.
 */

const parsed = parseMintPreviewTokenArgs(process.argv.slice(2));

if (!parsed.ok) {
  for (const error of parsed.errors) console.error(error);
  console.error(parsed.usage);
  process.exit(1);
}

const { appId, projectId, distIndexPath, ttlMillis } = parsed;

if (getApps().length === 0) {
  const key = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  initializeApp({
    credential: key ? cert(key) : applicationDefault(),
    projectId,
  });
}

let minted: { token: string; ttlMillis: number };
try {
  minted = await getAppCheck().createToken(appId, { ttlMillis });
} catch (cause) {
  console.error(`failed to mint an App Check token for ${appId} on ${projectId}.`);
  console.error(
    'Check that the deploying service account holds roles/firebaseappcheck.admin ' +
      '(or an equivalent role) on this project.',
  );
  console.error(cause);
  process.exit(1);
}

const expireTimeMillis = Date.now() + minted.ttlMillis;

const html = await readFile(distIndexPath, 'utf8');
await writeFile(distIndexPath, injectPreviewToken(html, { token: minted.token, expireTimeMillis }));

// Not the token itself: it is about to be public in the deployed bundle
// regardless, but there is no reason to also leave a full copy sitting in a
// CI log that outlives the channel.
console.log(
  `minted a preview App Check token for ${appId} on ${projectId}, ` +
    `expiring ${new Date(expireTimeMillis).toISOString()}.`,
);
