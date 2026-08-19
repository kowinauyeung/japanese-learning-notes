/**
 * The profile picture the identity provider supplied, if it can be trusted.
 *
 * `photoUrl` is not a value this app wrote. It arrives on the sign-in token
 * from whichever provider authenticated the user, and it goes straight into an
 * `<img src>` — so it is checked the same way `safeRedirect` checks `from`:
 * string in, string out, no React around it.
 *
 * Only an absolute `https:` URL is honoured. `javascript:` is still reachable
 * from an image in enough engines to matter, `data:` is a payload rather than a
 * hosted avatar, and `//host/a.png` reads as a host to the browser and as a
 * path to anyone skimming it. Every provider serves avatars over https, so
 * nothing legitimate is refused by narrowing to it.
 *
 * The deployed Content-Security-Policy narrows it further — `img-src` names
 * `https://lh3.googleusercontent.com` and nothing else — so a photo from
 * another host is blocked by the browser rather than by this function, and the
 * caller's fallback is what renders. Two layers, deliberately: the policy is
 * still Report-Only.
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
  return url.protocol === 'https:' ? raw : null;
}
