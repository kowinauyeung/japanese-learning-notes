import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * Grant or revoke access, by custom claim.
 *
 *   yarn allow you@example.com          # grant on goitei-dev
 *   yarn allow you@example.com --revoke
 *   yarn allow you@example.com prod
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

const [email, ...rest] = process.argv.slice(2);

// Rejected rather than ignored, because the mistake this catches is silent and
// natural: `--revoke` is spelled with dashes, so `--prod` is how one reaches
// for the other — and `rest.includes('prod')` is false for it, so the run would
// grant access on **dev** and say so only in its last line.
const unknown = rest.filter((arg) => arg !== 'prod' && arg !== '--revoke');

if (!email || unknown.length > 0) {
  if (unknown.length > 0) console.error(`unknown argument: ${unknown.join(' ')}`);
  console.error('usage: allow-user.ts <email> [prod] [--revoke]');
  process.exit(1);
}

const revoke = rest.includes('--revoke');
const env = rest.includes('prod') ? 'prod' : 'dev';

const projectId = env === 'prod' ? 'goitei' : 'goitei-dev';

if (getApps().length === 0) {
  const key = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  initializeApp({
    credential: key ? cert(key) : applicationDefault(),
    projectId,
  });
}

const auth = getAuth();

const user = await auth.getUserByEmail(email).catch(() => null);
if (!user) {
  // Deliberately not created here: the uid has to be the one Google issued, so
  // the account must have signed in once before it can be allowed.
  console.error(`${email} has never signed in to ${projectId}; ask them to try once first.`);
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
