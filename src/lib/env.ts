/**
 * Build-time environment facts the UI displays.
 *
 * Read straight from the Vite env rather than re-exported from the Firebase
 * client, so a route showing "which backend am I pointed at" does not have to
 * import an adapter to find out. The value is inlined into the bundle and is
 * not a secret — the whole config is readable from the deployed JS, which is
 * why Firestore rules and not obscurity are what protect the data.
 */
export const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
