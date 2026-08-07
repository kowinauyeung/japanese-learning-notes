import { initializeApp } from 'firebase/app';
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
 * Persistent cache lets a review session keep working on the train and sync
 * when the connection returns. Single-tab manager is enough for one person on
 * one device at a time and avoids the multi-tab coordination overhead.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
