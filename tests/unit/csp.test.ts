import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AVATAR_HOSTS } from '@/lib/avatar';

/**
 * Promoting the Content-Security-Policy must not switch App Check off.
 *
 * reCAPTCHA v3 loads `https://www.google.com/recaptcha/…` and frames a
 * challenge from the same origin. A policy that omits the host does not fail
 * loudly: attestation stops, the app keeps working, and the App Check metrics
 * that are supposed to say whether enforcement is safe to turn on go quiet for
 * a reason nothing surfaces.
 *
 * Written as a conditional rather than as a fixed expectation because the
 * headers block and the App Check client arrive on different branches: this is
 * green while `firebase.json` has no headers, green while the policy is
 * Report-Only, and red only when someone drops `-Report-Only` — which is the
 * one edit that turns a missing host into a live outage of the protection.
 */

const RECAPTCHA_HOST = 'https://www.google.com';

const firebaseJson = readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../src/infra/firebase/client.ts', import.meta.url), 'utf8');

interface Header {
  key: string;
  value: string;
}

const config = JSON.parse(firebaseJson) as {
  hosting?: { headers?: { headers: Header[] }[] };
};

const enforcedPolicies = (config.hosting?.headers ?? [])
  .flatMap((rule) => rule.headers)
  // Exact match: `Content-Security-Policy-Report-Only` is the state this test
  // deliberately permits, and it starts with the same string.
  .filter((header) => header.key === 'Content-Security-Policy')
  .map((header) => header.value);

const directive = (policy: string, name: string): string =>
  policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `)) ?? '';

describe('Content-Security-Policy against App Check', () => {
  it('never enforces a policy that would stop reCAPTCHA loading, which fails silently', () => {
    for (const policy of enforcedPolicies) {
      expect(directive(policy, 'script-src')).toContain(RECAPTCHA_HOST);
      expect(directive(policy, 'frame-src')).toContain(RECAPTCHA_HOST);
    }
  });

  // The guard above passes vacuously with no enforcing policy, which is
  // intended. It would also pass vacuously if App Check were removed and the
  // requirement quietly became wrong — this is what stops that reading.
  it('still has the App Check provider the guard above exists to protect', () => {
    expect(client).toContain('new ReCaptchaV3Provider(');
  });
});

describe('font loading against the self-only policy', () => {
  it('does not load Google Fonts, which the policy forbids and the worker cannot precache', () => {
    expect(indexHtml).not.toContain('fonts.googleapis.com');
    expect(indexHtml).not.toContain('fonts.gstatic.com');
  });
});

/**
 * The allowlist in `src/lib/avatar.ts` and the `img-src` directive are the same
 * decision written twice, and only one of them is enforced by anything. Today
 * that is the allowlist: the policy is deployed Report-Only, so a host it omits
 * is still fetched by the browser. If the policy is ever promoted, the roles
 * swap and a host the code allows but the policy omits becomes a broken image.
 *
 * Either way the failure is silent, so the two are pinned together here rather
 * than by a comment asking the next person to remember.
 */
describe('the avatar host allowlist against img-src', () => {
  const policies = (config.hosting?.headers ?? [])
    .flatMap((rule) => rule.headers)
    .filter((header) => header.key.startsWith('Content-Security-Policy'))
    .map((header) => header.value);

  // Without this the loop below passes by iterating over nothing, which is the
  // exact shape of the bug it is meant to catch.
  it('has a policy to check at all', () => {
    expect(policies.length).toBeGreaterThan(0);
  });

  it.each(AVATAR_HOSTS)('names %s, which providerPhotoUrl fetches from', (host) => {
    for (const policy of policies) {
      expect(directive(policy, 'img-src')).toContain(`https://${host}`);
    }
  });
});
