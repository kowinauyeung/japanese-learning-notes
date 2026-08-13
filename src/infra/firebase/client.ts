import { initializeApp } from 'firebase/app';
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
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
 * Enforcement is a separate switch in the Firebase console and should stay off
 * until its metrics show real traffic attesting successfully. Shipping the
 * client first is what produces those metrics.
 *
 * The debug token below is for `yarn dev` only. It is compiled out of a
 * production build by the mode check, so it cannot ship: a debug token is a
 * bypass, and a bypass in a released bundle is the absence of App Check with
 * extra steps. Verified against a real build rather than assumed — the string
 * does appear in the bundle, but every occurrence is the SDK reading it, and
 * the assignment is not there.
 *
 * **This needs a Content-Security-Policy change before the policy is enforced.**
 * reCAPTCHA Enterprise loads from `https://www.google.com/recaptcha/` and frames
 * a challenge from the same origin, and the policy in `firebase.json` allows
 * neither today. It is Report-Only, so nothing breaks now — but promoting the
 * policy without adding `https://www.google.com` to `script-src` and
 * `frame-src` would silently disable exactly the protection this adds.
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
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
} else if (import.meta.env.PROD) {
  // Loud, because the failure it describes is silent: the app works perfectly
  // and the protection simply is not there.
  console.warn('App Check is not configured (VITE_RECAPTCHA_SITE_KEY is unset).');
}

/**
 * Persistent cache lets a review session keep working on the train and sync
 * when the connection returns. Single-tab manager is enough for one person on
 * one device at a time and avoids the multi-tab coordination overhead.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
