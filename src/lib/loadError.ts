/**
 * What to show when a read fails.
 *
 * Every provider used to catch everything and report the same sentence — "単語を
 * 読み込めませんでした" and its three siblings — so a signed-in account with no
 * access rendered exactly as a dropped connection. That is the one failure the
 * generic wording is worst for: it is not transient, retrying never clears it,
 * and the thing that does clear it (sign out, sign back in) is not something a
 * reader would guess from "could not load".
 *
 * It is also the failure this application produces most easily. The gate is a
 * custom claim, which reaches a client only in a freshly minted ID token, so an
 * account granted access while signed in stays denied for up to an hour and
 * every screen says the words could not be loaded. Deploying rules that require
 * the claim to a project where nobody has it yet does the same to everyone at
 * once.
 *
 * Deliberately duck-typed rather than an `instanceof FirebaseError`: `src/lib`
 * is above the infrastructure seam and importing the SDK here would put a
 * Firebase type in every caller's signature, for a check that is one string
 * comparison. The codes are Firestore's own and are part of its API.
 */

/**
 * `permission-denied` is the rules refusing the request; `unauthenticated` is
 * the token being absent or expired. Both mean the same thing to a reader —
 * this account cannot see this right now — and both are fixed by the same
 * action, so they share a message.
 */
const DENIED_CODES = new Set(['permission-denied', 'unauthenticated']);

export const ACCESS_DENIED_MESSAGE =
  'アクセスが許可されていません。一度サインアウトして、サインインし直してください。';

export function isAccessDenied(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null) return false;
  const code: unknown = (cause as { code?: unknown }).code;
  return typeof code === 'string' && DENIED_CODES.has(code);
}

/**
 * `fallback` stays subject-specific — 単語, 単語集, 練習の記録, 練習履歴 — because
 * a transient failure really is about the thing being read. Denial is not: it is
 * a fact about the account, identical on every screen, and saying it four
 * different ways would suggest four different problems.
 */
export function loadErrorMessage(cause: unknown, fallback: string): string {
  return isAccessDenied(cause) ? ACCESS_DENIED_MESSAGE : fallback;
}
