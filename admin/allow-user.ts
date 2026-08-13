import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { applicationDefault } from 'firebase-admin/app';

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
 * **Revoking is two operations, and doing only the first is the mistake.** A
 * claim lives inside the ID token the client already holds, so clearing it
 * changes nothing until that token expires — up to an hour of continued access
 * after a ban. `revokeRefreshTokens` forces the client to re-authenticate, and
 * the new token is the one without the claim. Both run here, in that order.
 */

const [email, ...rest] = process.argv.slice(2);
const revoke = rest.includes('--revoke');
const env = rest.includes('prod') ? 'prod' : 'dev';

if (!email) {
  console.error('usage: allow-user.ts <email> [prod] [--revoke]');
  process.exit(1);
}

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
  // Without this the client keeps its existing token, claim and all, until it
  // expires. This is what makes a ban take effect now rather than within an hour.
  await auth.revokeRefreshTokens(user.uid);
}

console.log(
  `${revoke ? 'revoked' : 'allowed'}: ${email} (${user.uid}) on ${projectId}` +
    (revoke ? ' — refresh tokens revoked, the client must sign in again' : ''),
);
