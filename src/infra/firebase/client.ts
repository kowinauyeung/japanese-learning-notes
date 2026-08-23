import { initializeApp } from 'firebase/app';
import { ReCaptchaV3Provider, initializeAppCheck } from 'firebase/app-check';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

/**
 * Which project this build talks to comes entirely from the env file Vite
 * picks: .env.development for `yarn dev`, .env.production for `yarn build`.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missing.length) {
  throw new Error(
    `Firebase config incomplete (${missing.join(', ')}). Copy .env.example to ` +
      '.env.development and fill it in.',
  );
}

export const app = initializeApp(config);

/**
 * App Check — the only thing standing between the published config above and
 * anybody's script.
 *
 * Every value in `config` is readable from the deployed bundle, by design:
 * Firestore rules and not obscurity are what protect the data. What rules
 * cannot do is tell a request from this app apart from a request from a loop on
 * somebody's laptop, and both are billed. App Check attests the *origin* of the
 * call, which is the question rules were never asked.
 *
 * **Off unless a site key is configured**, and that is deliberate rather than
 * lazy: a build with App Check enforced and no key attaches no token and every
 * request is refused, which turns a missing environment variable into an outage
 * with no error pointing at it. Absent key means absent App Check, and the
 * console reports the state either way.
 *
 * **Enforcement is a separate switch in the Firebase console, and production
 * was enforced from its first deploy.** The usual advice — ship the client,
 * watch the metrics, enforce once real traffic is attesting successfully — was
 * not available here, and not by oversight: the production project had never
 * served a request, so the metrics it asks you to read were empty. Waiting
 * would have meant waiting for traffic that only arrives once the operator
 * signs in, which is the same event enforcement is being judged on.
 *
 * The cost of that order is worth stating, because whoever hits it will not
 * recognise it. A client whose App Check token is refused is denied at
 * Firestore, so the failure arrives as `permission-denied` on every read — and
 * `loadError.ts` renders that as 「アクセスが許可されていません」, which points
 * at the claim gate. The gate will be innocent.
 *
 * Telling them apart, and the rollback:
 *
 * 1. Open the browser console. An App Check failure logs a warning prefixed
 *    `@firebase/app-check`; a missing claim logs nothing.
 * 2. If it is App Check, turn enforcement off in the console. It takes effect
 *    within minutes and needs no deploy.
 * 3. The App Check metrics page then has what it never had: real requests,
 *    split into verified and unverified, with a reason against each.
 *
 * Enforce again from that page, not from this comment.
 *
 * **v3, not Enterprise**, and that is a plan constraint rather than a
 * preference: reCAPTCHA Enterprise is a Cloud product and its API cannot be
 * enabled on a project without billing, so on Spark it is not an option at all.
 * v3 is free, needs no card, and App Check treats the two identically —
 * swapping providers later is this one import and the line below it.
 *
 * The debug token below is for `yarn dev` only. It is compiled out of a
 * production build by the mode check, so it cannot ship: a debug token is a
 * bypass, and a bypass in a released bundle is the absence of App Check with
 * extra steps. Verified against a real build rather than assumed — the string
 * does appear in the bundle, but every occurrence is the SDK reading it, and
 * the assignment is not there.
 *
 * **This needs a Content-Security-Policy change before one is enforced.**
 * v3 pulls its script from `https://www.gstatic.com/recaptcha/` *and*
 * `https://www.google.com/recaptcha/`, and frames from `https://www.google.com`.
 * Wherever a policy exists in this repository gstatic is already allowed and
 * `www.google.com` is not, in either directive.
 *
 * Deliberately not a statement about what `firebase.json` holds today: the
 * headers block arrives on a different branch, so anything asserted here would
 * be true or false depending on which merged first. `tests/unit/csp.test.ts`
 * asserts the conditional instead — *if* an enforcing `Content-Security-Policy`
 * is present, `script-src` and `frame-src` must allow `https://www.google.com`.
 * Green with no headers, green under Report-Only, red at the moment the policy
 * is promoted without the hosts, which is the only moment it matters.
 */
const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

if (siteKey) {
  if (import.meta.env.DEV) {
    // Registered per browser in the console; without it a local build fails
    // attestation against a key bound to the deployed domain.
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
} else if (import.meta.env.PROD) {
  // Loud, because the failure it describes is silent: the app works perfectly
  // and the protection simply is not there.
  console.warn('App Check is not configured (VITE_RECAPTCHA_SITE_KEY is unset).');
}

/**
 * Persistent cache lets a review session keep working on the train and sync
 * when the connection returns.
 *
 * **Multiple tabs, and #78 is why it changed.** The single-tab manager was
 * chosen when "one person on one device" meant one tab. It takes exclusive
 * access to the persistence layer — the SDK's own words are that a second
 * client must enable "multi-tab synchronization ... in all tabs" to share it —
 * and an installed app makes a second client ordinary rather than exotic: the
 * installed window and a browser tab on the same origin are two of them.
 *
 * Measured rather than reasoned about, with two tabs against the emulator and
 * the network then disabled in each, three runs, identical every time:
 *
 * | manager  | tab 1 offline read | tab 2 offline read |
 * | -------- | ------------------ | ------------------ |
 * | single   | succeeds           | **fails**          |
 * | multiple | succeeds           | succeeds           |
 *
 * So whichever window opened second is the one with no offline data — the
 * state this whole effort exists to prevent, arriving through the feature meant
 * to deliver it.
 *
 * Worth recording because it cost time: the second tab does **not** announce
 * this. No error is thrown at startup and nothing is logged there; it looks
 * identical to the first tab until the network goes away. (`Error using user
 * provided cache. Falling back to memory cache` does exist, but it is what a
 * platform with no IndexedDB reports — Node, which is why no test under
 * `tests/integration` can reach any of this.)
 *
 * The cost being accepted: the multi-tab manager elects a primary through a
 * lease and coordinates across clients, so there is more storage traffic and a
 * handover whenever the primary closes. That is real, and it is smaller than a
 * window with no offline data at all.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
