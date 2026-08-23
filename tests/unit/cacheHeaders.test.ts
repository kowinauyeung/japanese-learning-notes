import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * What `Cache-Control` a request actually resolves to, given the rules in
 * `firebase.json`.
 *
 * This reads as a test of a config file, and it is not: the two Hosting
 * semantics it depends on both make a wrong config look right, and neither is
 * visible in a diff.
 *
 * 1. **Every matching entry applies, and a repeated key is decided by the last
 *    match** — not the first, and not the most specific. So `/assets/**` gets
 *    its long lifetime only because it is listed *after* the `**` rule that
 *    sets `no-cache`. Move it above and every hashed asset silently goes back
 *    to revalidating on each load: nothing fails, nothing logs, the app is just
 *    slower forever.
 * 2. **A rule matches the request path, not the rewritten one.** `**` →
 *    `/index.html` means `/` and `/browse` are served the index document, but a
 *    rule whose `source` is `/index.html` reaches neither. Writing the
 *    `no-cache` default against `**` is what covers a real navigation — and
 *    what will cover `/sw.js` before it exists.
 *
 * Both were measured against the Firebase Hosting emulator, using an unrelated
 * header as a probe, rather than read off the documentation. `resolve` below is
 * a model of that measured behaviour; the assertions pin the committed config
 * against it.
 */

interface Header {
  key: string;
  value: string;
}

const config = JSON.parse(
  readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'),
) as { hosting?: { headers?: { source: string; headers: Header[] }[] } };

const rules = config.hosting?.headers ?? [];

/**
 * The shapes a `source` can take here: everything, one exact path, or a prefix.
 * The exact-path case is modelled even though the config uses none, because a
 * rule written that way is the mistake this file exists to catch — it looks
 * like it covers the document and covers only its literal name.
 */
const matches = (source: string, path: string): boolean =>
  source === '**' ||
  source === path ||
  (source.endsWith('/**') && path.startsWith(source.slice(0, -2)));

/** Last match wins, which is the half of the semantics that bites. */
const resolve = (path: string, key: string): string | undefined =>
  rules
    .filter((rule) => matches(rule.source, path))
    .flatMap((rule) => rule.headers)
    .filter((header) => header.key === key)
    .at(-1)?.value;

describe('Cache-Control that a request resolves to', () => {
  // Passing by iterating over nothing is the exact shape of the bug below.
  it('has rules to resolve against at all', () => {
    expect(rules.length).toBeGreaterThan(0);
  });

  it.each(['/', '/browse', '/practice', '/index.html', '/manifest.webmanifest', '/sw.js'])(
    'revalidates %s, whose name does not change when the build does',
    (path) => {
      expect(resolve(path, 'Cache-Control')).toBe('no-cache');
    },
  );

  it.each(['/assets/index-CXo-DkYT.js', '/assets/index-BRZ7eUL-.css'])(
    'lets the browser keep %s forever, since Vite puts the content hash in the name',
    (path) => {
      expect(resolve(path, 'Cache-Control')).toBe('public, max-age=31536000, immutable');
    },
  );

  // The narrower entries must not cost an asset its security headers. They do
  // not, because matching entries merge rather than shadow — but that is the
  // other half of semantic 1, and this is what would notice it changing.
  it.each([
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Cross-Origin-Opener-Policy',
    'Content-Security-Policy-Report-Only',
  ])('still sends %s on a hashed asset, not only on the document', (key) => {
    expect(resolve('/assets/index-CXo-DkYT.js', key)).toBeDefined();
  });
});
