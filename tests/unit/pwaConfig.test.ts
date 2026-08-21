import { describe, expect, it } from 'vitest';
import { pwaOptions } from '../../pwa-config';

/**
 * The worker's settings, at the layer that can see them without a build.
 *
 * Every failure guarded here is silent. Nothing throws, nothing goes red on its
 * own, and the build succeeds either way — which is the whole reason these are
 * assertions rather than a comment asking the next person to be careful. Each
 * one carries its consequence immediately above it, because a reason written
 * above `it(...)` cannot say which of several assertions it belongs to.
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
  it('is disabled under e2e, so Playwright cannot be served a previous build', () => {
    // The one that matters most, and the one that fails quietest. A worker here
    // precaches a bundle and serves it to the next Playwright run, so the suite
    // passes against a build that is not the one under test — every other test
    // in this repository still green while proving nothing.
    expect(pwaOptions('e2e').disable).toBe(true);
  });

  it.each(['production', 'development'])(
    'is enabled under %s, since disabling it everywhere would silently drop the feature',
    (mode) => {
      // `development` is not padding beside `production`. `disable` governs the
      // build while `devOptions.enabled` governs `yarn dev`, and that is off —
      // so nothing runs a worker while editing either way. What this holds up
      // is the by-hand dev deploy the README documents, `yarn vite build --mode
      // development`, which would otherwise ship `goitei-dev` an app with no
      // worker at all, unnoticed until someone went offline expecting one.
      expect(pwaOptions(mode).disable).toBe(false);
    },
  );
});

describe('the update handover', () => {
  it('waits to be asked rather than updating underneath a running session', () => {
    // `autoUpdate` reloads the reader without asking, mid-sentence in a
    // dictation answer if that is where they are.
    expect(pwaOptions('production').registerType).toBe('prompt');
    // Skipping the wait replaces the precached assets while the page is still
    // running on the old ones, so the next lazily imported route arrives from
    // a bundle the loaded code was never compiled against.
    expect(workboxOf('production').skipWaiting).toBe(false);
    // Claiming does the same to any *other* open tab, which is worse: nobody
    // there pressed anything.
    expect(workboxOf('production').clientsClaim).toBe(false);
  });

  it('leaves registration to the adapter, so the prompt is wired to the live updater', () => {
    // An injected registration is a second updater, and the second one's
    // `onNeedRefresh` fires into nothing. The prompt then never appears while
    // everything about the worker still looks correct — a stale build with no
    // way left to report itself.
    expect(pwaOptions('production').injectRegister).toBe(false);
  });
});

describe('what an offline navigation can reach', () => {
  it('precaches the route chunks, which are the app rather than an optimisation', () => {
    const patterns = workboxOf('production').globPatterns ?? [];
    // Every route in `src/router.tsx` is a lazy import, so dropping `js` here
    // precaches the shell and none of the screens: the app opens offline and
    // reaches nothing, which is the exact state #67 describes.
    expect(patterns.some((pattern) => pattern.includes('js'))).toBe(true);
    // Without the manifest an installed window cannot read its own identity
    // offline, which is the case this whole change exists for.
    expect(patterns.some((pattern) => pattern.includes('webmanifest'))).toBe(true);
  });

  it('answers a deep navigation with the index document, matching the hosting rewrite', () => {
    // Without it, an offline visit to `/vocabulary` asks the cache for a
    // document that was never a file, and the reader gets the browser's
    // offline error instead of the app they installed.
    expect(workboxOf('production').navigateFallback).toBe('/index.html');
  });

  it.each(['/__/auth/handler', '/__/auth/iframe', '/__/firebase/init.json'])(
    'keeps %s away from the navigation fallback, since Firebase serves sign-in from there',
    (path) => {
      const denied = workboxOf('production').navigateFallbackDenylist ?? [];
      // `signInWithPopup` opens `/__/auth/handler`. Should the auth domain ever
      // point at the hosting domain, that path becomes same-origin and in
      // scope — and a fallback would answer it with `index.html`, breaking
      // sign-in with no error naming the cause.
      //
      // Asserted over paths rather than by comparing the pattern to itself,
      // which would pass for any regular expression at all.
      expect(denied.some((pattern) => pattern.test(path))).toBe(true);
    },
  );

  it.each(['/', '/vocabulary', '/practice/dictation', '/wordsets/abc'])(
    'still lets %s fall back, which is what makes it reachable offline',
    (path) => {
      const denied = workboxOf('production').navigateFallbackDenylist ?? [];
      // The other half of the denylist, and the half a too-broad pattern
      // breaks: deny these and every route stops resolving offline, which is
      // the feature rather than a corner of it.
      expect(denied.some((pattern) => pattern.test(path))).toBe(false);
    },
  );
});
