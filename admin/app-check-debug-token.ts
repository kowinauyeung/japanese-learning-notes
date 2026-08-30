import { readFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { applicationDefault } from 'firebase-admin/app';
import { describeCredentialSource } from './allow-user.shared';
import {
  debugTokensEndpoint,
  parseAppCheckDebugTokenArgs,
  readAppIdFromEnvFile,
  registrationFailureLines,
} from './app-check-debug-token.shared';

/**
 * Register an App Check debug token, so a browser running `yarn dev` can
 * attest.
 *
 *   yarn appcheck:debug-token <uuid>                       # goitei-dev
 *   yarn appcheck:debug-token <uuid> <uuid> --name "Chrome"
 *   yarn appcheck:debug-token <uuid> prod
 *
 * **What it is for.** App Check enforcement covers `identitytoolkit` as well as
 * Firestore on these projects, so an unattested client cannot even sign in —
 * `signInWithPopup` is refused and `Login.tsx` reports the same
 * 「ログインできませんでした」 it reports for every other cause. On a deployed
 * origin reCAPTCHA v3 answers for the client; on `localhost` it cannot, because
 * a v3 site key is bound to registered domains, so `src/infra/firebase/client.ts`
 * switches to a debug token in `DEV` and the SDK generates one per browser and
 * prints it to the console. Until that UUID is registered here, the browser is
 * exactly as unattested as a scripted client, which is the whole point of the
 * mechanism.
 *
 * A debug token is a bypass. It is stored per browser profile in IndexedDB, so
 * clearing site data or moving to another profile produces a new one and the
 * failure returns; every registration is one more way to attest as this app,
 * indefinitely, so remove the ones that belong to machines and browsers you no
 * longer use — the Firebase console, App Check → Apps → Manage debug tokens,
 * is where they are listed and deleted.
 *
 * **Needs `roles/firebaseappcheck.admin`** on whatever credential ADC resolves
 * to — `yarn auth:login` is what puts one in `.gcloud/`.
 *
 * The Admin SDK has no debug-token API, so this calls the App Check REST
 * endpoint directly with an ADC access token. `X-Goog-User-Project` is what
 * makes a user credential's call billable to the target project; without it the
 * API refuses a plain ADC login.
 */

const parsed = parseAppCheckDebugTokenArgs(process.argv.slice(2), hostname());

if (!parsed.ok) {
  for (const error of parsed.errors) console.error(error);
  console.error(parsed.usage);
  process.exit(1);
}

const { projectId, envFile, tokens } = parsed;

let appId = parsed.appId;

if (!appId && envFile) {
  let contents: string;
  try {
    contents = await readFile(new URL(`../${envFile}`, import.meta.url), 'utf8');
  } catch {
    console.error(`cannot read ${envFile}, so there is no app id to register against.`);
    console.error('Pass --app-id <id> instead, or copy .env.example and fill it in.');
    process.exit(1);
  }
  appId = readAppIdFromEnvFile(contents);
  if (!appId) {
    console.error(`${envFile} has no VITE_FIREBASE_APP_ID. Pass --app-id <id> instead.`);
    process.exit(1);
  }
}

if (!appId) {
  console.error('missing --app-id');
  process.exit(1);
}

// `applicationDefault()` unconditionally, for the reason
// `mint-preview-app-check-token.ts` already records: `GOOGLE_APPLICATION_CREDENTIALS`
// may point at a Workload Identity Federation config rather than a
// service-account key JSON, and `cert()` accepts only the latter and throws on
// the former. `applicationDefault()` reads either, and a key file set that way
// is one of the things it reads, so branching on the variable buys nothing and
// costs the credential type this repository's own CI issues.
const credential = applicationDefault();

let accessToken: string;
try {
  accessToken = (await credential.getAccessToken()).access_token;
} catch (cause) {
  console.error(`could not obtain a Google access token for ${projectId}.`);
  console.error(`credential configuration: ${describeCredentialSource(process.env)}`);
  console.error(cause);
  process.exit(1);
}

for (const { token, displayName } of tokens) {
  const response = await fetch(debugTokensEndpoint(projectId, appId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Goog-User-Project': projectId,
    },
    body: JSON.stringify({ displayName, token }),
  });

  if (!response.ok) {
    for (const line of registrationFailureLines(
      response.status,
      await response.text(),
      projectId,
    )) {
      console.error(line);
    }
    console.error(`credential configuration: ${describeCredentialSource(process.env)}`);
    process.exit(1);
  }

  // Not the token itself: it is a credential, and a shell history or CI log is
  // not where a bypass for this project should come to rest.
  console.log(`registered "${displayName}" on ${projectId} (${appId}).`);
}

console.log(
  'Reload the browser that printed the token. A debug token is picked up on the ' +
    'next App Check request, but a page holding a refused token keeps it until then.',
);
