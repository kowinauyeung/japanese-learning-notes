import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import {
  ensureAdcQuotaProject,
  lookupErrorCode,
  lookupFailureLines,
  parseAllowUserArgs,
} from './allow-user.shared';

/**
 * Grant or revoke access, by custom claim.
 *
 *   yarn allow you@example.com          # grant on goitei-dev
 *   yarn allow you@example.com --revoke
 *   yarn allow you@example.com prod
 *   yarn allow you@example.com --project your-project-id
 *
 * **The deployed rules do not read this claim, so granting it opens nothing
 * today.** Signups are open: `firestore.rules` gates on `signedIn()`. The claim
 * is what the *closed* gate reads, and this command is step one of closing it —
 * grant every account that must keep working, have them sign out and back in,
 * and only then deploy rules that restore `isAllowed()`. Deploying first locks
 * out the operator along with everybody else, which is why this survived the
 * gate rather than being deleted with it. See "Operator runbook" in README.md.
 *
 * The claim replaced an `allowedUsers` document that rules checked with
 * `exists()` on every request — one billed read per request, to answer a
 * question whose answer changes twice in an account's lifetime. That collection
 * is read by nothing now and this command has never written it.
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
  if (!key) ensureAdcQuotaProject(process.env, projectId);
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

// Said on every run, because the alternative is a command that reports success
// and changes nothing an operator can observe. Signups are open: whoever ran
// this to restore somebody's access has not restored it, and whoever ran it as
// step one of closing signups still has two steps left.
//
// The two paths differ and the note must not flatten them. Granting really does
// nothing until `isAllowed()` is back. Revoking ends the session at the next
// refresh — `revokeRefreshTokens` above is not a no-op — but the account can
// sign straight back in, so what it is not is a ban.
console.log(
  revoke
    ? 'note: the deployed rules gate on signedIn(), not on this claim, so this ' +
        'ends the session without removing access — the account can sign in ' +
        'again. Suspension is not something this project has; see "Responding ' +
        'to abuse" in README.md.'
    : 'note: the deployed rules gate on signedIn(), not on this claim, so ' +
        'nothing about access changed. It matters only when restoring ' +
        'isAllowed() — see "Operator runbook" in README.md.',
);
