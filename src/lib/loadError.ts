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
 * the token being absent or expired. They share a message because a reader
 * cannot tell them apart and neither can this module.
 */
const DENIED_CODES = new Set(['permission-denied', 'unauthenticated']);

/**
 * Two sentences, and the second one is why there is a third.
 *
 * `permission-denied` is not one situation. It is at least three, and only one
 * of them is cleared by signing in again:
 *
 *  1. **A token minted before the grant.** Re-authenticating fixes it, which is
 *     what the first instruction is for.
 *  2. **No claim on the account at all** — nobody has run `yarn allow`, or rules
 *     requiring the claim were deployed to a project where nobody carries it.
 *     Signing out and back in mints another token with no claim, so the reader
 *     follows the instruction, lands on the same screen, and is out of moves.
 *  3. **App Check rejecting the request.** `src/infra/firebase/client.ts`
 *     initialises it whenever a site key is present, and an unregistered domain
 *     or a dead reCAPTCHA key surfaces here as `permission-denied` like the
 *     other two. Re-authenticating does nothing at all.
 *
 * Three messages would be worse, not better: the reader has no way to tell which
 * one they are in, and the note below on subject-specific wording applies just
 * as much to splitting one cause four ways. What the message must not do is
 * dead-end — so it names サポート, which is where 2 and 3 are actually resolved.
 *
 * That exit has to be reachable from where this renders, and it is: `/support`
 * is a top-level route outside the auth gate, and `Account.tsx` links it from
 * inside the app, which a signed-in-but-denied account can still open — the gate
 * that failed is Firestore's, not Firebase Auth's.
 */
export const ACCESS_DENIED_MESSAGE =
  'アクセスが許可されていません。一度サインアウトして、サインインし直してください。' +
  '解決しない場合は、サポートページからお問い合わせください。';

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
