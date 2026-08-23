import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { lookupErrorCode, lookupFailureLines, parseAllowUserArgs } from './allow-user.shared';

/**
 * Grant or revoke access, by custom claim.
 *
 *   yarn allow you@example.com          # grant on goitei-dev
 *   yarn allow you@example.com --revoke
 *   yarn allow you@example.com prod
 *   yarn allow you@example.com --project your-project-id
 *
 * The security rules read `request.auth.token.allowed`, so this is the only
 * thing that opens the door. It replaced an `allowedUsers` document that rules
 * checked with `exists()` on every request — one billed read per request, to
 * answer a question whose answer changes twice in an account's lifetime.
 *
 * **A ban lands within the hour, not on the keystroke.** A claim lives inside
 * the ID token the client already holds, and Firestore rules have no revocation
 * check, so clearing the claim changes nothing until that token expires — up to
 * an hour. Revoking the refresh tokens does not shorten that: it stops the next
 * refresh from succeeding, which ends the session, but the token already in
 * hand keeps its claims until it runs out.
 *
 * It is done anyway, because ending the session is worth doing on its own. What
 * it is not is immediate, and an operator responding to abuse has to know that
 * — deleting the offending data is the part that takes effect now.
 */

const parsed = parseAllowUserArgs(process.argv.slice(2));

if (!parsed.ok) {
  for (const error of parsed.errors) console.error(error);
  console.error(parsed.usage);
  process.exit(1);
}

const { email, revoke, projectId } = parsed;

if (getApps().length === 0) {
  const key = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  initializeApp({
    credential: key ? cert(key) : applicationDefault(),
    projectId,
  });
}

const auth = getAuth();

let user: UserRecord;

try {
  user = await auth.getUserByEmail(email);
} catch (cause) {
  // Deliberately not created here: the uid has to be the one Google issued, so
  // the account must have signed in once before it can be allowed.
  for (const line of lookupFailureLines(email, projectId, cause, process.env)) {
    console.error(line);
  }
  if (lookupErrorCode(cause) !== 'auth/user-not-found') {
    console.error(cause);
  }
  process.exit(1);
}

const claims = { ...user.customClaims, allowed: revoke ? undefined : true };
await auth.setCustomUserClaims(user.uid, claims);

if (revoke) {
  // Ends the session at the next refresh. It does not invalidate the token the
  // client is holding right now — see the note above.
  await auth.revokeRefreshTokens(user.uid);
}

console.log(
  `${revoke ? 'revoked' : 'allowed'}: ${email} (${user.uid}) on ${projectId}` +
    (revoke
      ? ' — refresh tokens revoked. The ID token already issued stays valid until it expires, so access ends within the hour rather than immediately.'
      : ''),
);
