import { describe, expect, it } from 'vitest';
import { pwaOptions } from '../../pwa-config';

/**
 * The worker's settings, at the layer that can see them without a build.
 *
 * Every failure guarded here is silent. Nothing throws, nothing goes red on its
 * own, and the build succeeds either way — which is the whole reason these are
 * assertions rather than a comment asking the next person to be careful.
 *
 * What this deliberately does **not** cover is whether the app actually loads
 * with the network off. That needs a production-mode build in a real browser,
 * and the Playwright harness builds `--mode e2e`, where the worker does not
 * exist by design. #65 owns that and names the layer it needs. The offline
 * behaviour was verified by hand for this change instead: 37/37 precached, `/`
 * and `/vocabulary` both rendering offline, the manifest still served.
 */

const workboxOf = (mode: string) => {
  const workbox = pwaOptions(mode).workbox;
  if (!workbox) throw new Error(`no workbox config for mode ${mode}`);
  return workbox;
};

describe('the service worker is absent from the end-to-end build', () => {
  /**
   * The one that matters most, and the one that fails quietest. A worker in the
   * `e2e` build precaches a bundle and then serves it to the next Playwright
   * run, so the suite passes against a build that is not the one under test.
   * Every other test in this repository would still be green while proving
   * nothing.
   */
  it('is disabled under e2e, so Playwright cannot be served a previous build', () => {
    expect(pwaOptions('e2e').disable).toBe(true);
  });

  it.each(['production', 'development'])(
    'is enabled under %s, since disabling it everywhere would silently drop the feature',
    (mode) => {
      expect(pwaOptions(mode).disable).toBe(false);
    },
  );
});

describe('the update handover', () => {
  /**
   * `autoUpdate` would swap the precached assets under a running session, so
   * the next lazily imported route arrives from a bundle the loaded code was
   * not compiled against. `prompt` is what makes the reader the one who
   * chooses, and `src/components/UpdatePrompt.tsx` only has anything to do
   * while this holds.
   */
  it('waits to be asked rather than updating underneath a running session', () => {
    expect(pwaOptions('production').registerType).toBe('prompt');
    expect(workboxOf('production').skipWaiting).toBe(false);
    expect(workboxOf('production').clientsClaim).toBe(false);
  });

  /**
   * Two registrations means two updaters, and the second one's `onNeedRefresh`
   * fires into nothing. The prompt would then never appear, while everything
   * about the worker still looked correct.
   */
  it('leaves registration to the adapter, so the prompt is wired to the live updater', () => {
    expect(pwaOptions('production').injectRegister).toBe(false);
  });
});

describe('what an offline navigation can reach', () => {
  /**
   * Every route in `src/router.tsx` is a lazy import. A pattern list that
   * stopped matching `.js` would precache the shell and none of the screens —
   * the exact state #67 describes, and one that looks fine until the network
   * goes away.
   */
  it('precaches the route chunks, which are the app rather than an optimisation', () => {
    const patterns = workboxOf('production').globPatterns ?? [];
    expect(patterns.some((pattern) => pattern.includes('js'))).toBe(true);
    expect(patterns.some((pattern) => pattern.includes('webmanifest'))).toBe(true);
  });

  it('answers a deep navigation with the index document, matching the hosting rewrite', () => {
    expect(workboxOf('production').navigateFallback).toBe('/index.html');
  });

  /**
   * `signInWithPopup` opens `/__/auth/handler`. If the auth domain is ever
   * pointed at the hosting domain, that becomes same-origin and in scope — and
   * a navigation fallback would answer it with `index.html`, breaking sign-in
   * with nothing naming the cause.
   *
   * Asserted as behaviour over paths rather than by comparing the pattern to
   * itself, which would pass for any regular expression at all.
   */
  it.each(['/__/auth/handler', '/__/auth/iframe', '/__/firebase/init.json'])(
    'keeps %s away from the navigation fallback, since Firebase serves sign-in from there',
    (path) => {
      const denied = workboxOf('production').navigateFallbackDenylist ?? [];
      expect(denied.some((pattern) => pattern.test(path))).toBe(true);
    },
  );

  it.each(['/', '/vocabulary', '/practice/dictation', '/wordsets/abc'])(
    'still lets %s fall back, which is what makes it reachable offline',
    (path) => {
      const denied = workboxOf('production').navigateFallbackDenylist ?? [];
      expect(denied.some((pattern) => pattern.test(path))).toBe(false);
    },
  );
});
