/**
 * Hosts an avatar may be fetched from.
 *
 * Exactly the hosts `img-src` names in `firebase.json`, and
 * `tests/unit/csp.test.ts` fails if the two drift apart. Sign-in is Google-only
 * today, so this is one entry; adding a provider means adding its host in both
 * places, in the same change.
 *
 * Not widened to `*.googleusercontent.com`, even though older accounts are
 * served from `lh4`–`lh6`: the policy pins `lh3`, and a URL this function
 * accepts but the policy rejects would render as a broken image the moment the
 * policy is enforced. An account whose photo lives elsewhere gets the initial —
 * which is what it got before any of this existed.
 */
export const AVATAR_HOSTS = ['lh3.googleusercontent.com'] as const;

/**
 * The profile picture the identity provider supplied, if it can be trusted.
 *
 * `photoUrl` is not a value this app wrote. It arrives on the sign-in token
 * from whichever provider authenticated the user, and it goes straight into an
 * `<img src>` — so it is checked the same way `safeRedirect` checks `from`:
 * string in, string out, no React around it.
 *
 * Two conditions, and the host one is doing the real work. `https:` alone would
 * still let any host on the internet receive a request — the visitor's IP, and
 * a hit that says they opened this app — the moment a provider handed us a URL
 * pointing at it. The Content-Security-Policy is **not** the backstop for that
 * today: it is deployed as `Content-Security-Policy-Report-Only`, so `img-src`
 * reports the violation and the browser makes the request anyway.
 */
export function providerPhotoUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let url: URL;
  try {
    // Rejects the protocol-relative form as a side effect: with no base to
    // resolve against, `//evil.com/a.png` is not a URL at all.
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;

  // `host` rather than `hostname`, so a port has to match too, and an exact
  // comparison rather than a suffix one: `lh3.googleusercontent.com.evil.test`
  // ends with the allowed name without being it.
  return (AVATAR_HOSTS as readonly string[]).includes(url.host) ? raw : null;
}
