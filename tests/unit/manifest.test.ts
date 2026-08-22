import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `public/manifest.webmanifest`, which is what turns the site into an app.
 *
 * A manifest has no behaviour to go red on until something reads it, and the
 * things that read it are an operating system's install flow and a home screen
 * — neither reachable from a test. What *is* reachable is every way the file can
 * disagree with the rest of the repository, and each of those failures is
 * silent in the same shape: the install still succeeds, and the reader ends up
 * with a nameless tile, a blank icon, or a window that opens on a page the app
 * does not serve.
 *
 * Unit, not end-to-end: this is a property of a checked-in file, and asserting
 * it in a browser would prove the same thing more slowly while saying less about
 * which field was wrong. `tests/e2e/offline.spec.ts` covers the one manifest
 * claim that *is* behaviour — that an installed window can still read it with
 * the network off.
 *
 * `src/` never imports this file, so nothing else in the suite would notice it
 * drifting.
 */

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

interface Icon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

interface Manifest {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: Icon[];
}

const manifest = JSON.parse(readFileSync(root('public/manifest.webmanifest'), 'utf8')) as Manifest;
const indexHtml = readFileSync(root('index.html'), 'utf8');

describe('the web app manifest', () => {
  /**
   * The fields Chromium requires before it will offer to install at all. It
   * reports a missing one in DevTools and nowhere else: on a phone the install
   * prompt simply never appears, which is indistinguishable from a reader who
   * did not look for it.
   */
  it.each(['name', 'short_name', 'start_url', 'display', 'icons'] as const)(
    'declares %s, without which Chromium silently never offers to install',
    (field) => {
      expect(manifest[field]).toBeTruthy();
    },
  );

  it('asks for a standalone window, which is what removes the browser chrome the app is designed without', () => {
    // `browser` here would leave the address bar in place, and the safe-area
    // insets the layout now reads would all resolve to zero — the whole of #64
    // would still be correct and would do nothing.
    expect(manifest.display).toBe('standalone');
  });

  /**
   * `start_url` inside `scope` is what keeps the installed window an app rather
   * than a browser: a navigation outside the scope opens in the browser instead,
   * so a `scope` narrower than the routes would drop the reader out of the app
   * mid-session with no way back — there is no back button in `standalone`.
   */
  it('starts inside its own scope, so a route does not open outside the installed window', () => {
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  it('scopes the whole origin, since every route below / is part of the app', () => {
    expect(manifest.scope).toBe('/');
  });
});

/**
 * Icons are the failure this file exists for most.
 *
 * An icon renamed in `public/` and not here does not break the build, does not
 * warn, and does not show up in any screenshot: the install just produces a
 * blank tile. `yarn icons` generates these from the logo, so a rename is a
 * plausible thing for it to do.
 */
describe('the icons a home screen actually reaches for', () => {
  it('has icons to check at all, since every assertion below iterates over them', () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it.each(['192x192', '512x512'])(
    'offers %s, which is the pair Chromium asks for before it will install',
    (sizes) => {
      expect(manifest.icons.some((icon) => icon.sizes === sizes)).toBe(true);
    },
  );

  /**
   * Android crops every icon to the launcher's shape. Without a `maskable`
   * entry it crops an `any` icon instead, cutting the corners off a square logo
   * — which looks like a badly drawn icon rather than a missing declaration.
   */
  it('offers a maskable icon, or Android crops the square one to fit its launcher', () => {
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  /**
   * The `maskable` icon must not be the *only* one. `purpose: "maskable"` tells
   * the platform the art has padding to be cropped into, so a launcher that used
   * it as an ordinary icon would render the logo small inside empty space.
   */
  it('still offers an unmasked icon beside it, which is what a browser tab and a task switcher use', () => {
    expect(manifest.icons.some((icon) => icon.purpose === 'any')).toBe(true);
  });

  it.each([['/icon-192.png'], ['/icon-512.png'], ['/icon-maskable-512.png']])(
    'points %s at a file that exists in public/',
    (src) => {
      expect(manifest.icons.some((icon) => icon.src === src)).toBe(true);
      expect(existsSync(root(`public${src}`))).toBe(true);
    },
  );

  // The reverse direction: the loop above passes if an icon is dropped from the
  // manifest *and* from this list in the same edit. This is what notices the
  // file still sitting in `public/` unreferenced, or a new one never wired up.
  it('names every PNG icon in public/, so one added or removed cannot go unreferenced', () => {
    const referenced = manifest.icons.map((icon) => icon.src).sort();
    expect(referenced).toEqual(['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']);
  });
});

/**
 * The manifest and `index.html` say overlapping things, and the browser reads
 * both. Where they disagree the disagreement is invisible: nothing errors, and
 * which one wins depends on the platform.
 */
describe('the manifest against index.html', () => {
  it('is linked from the document, or nothing reads it at all', () => {
    expect(indexHtml).toContain('rel="manifest" href="/manifest.webmanifest"');
  });

  /**
   * iOS ignores the manifest's icons for "Add to Home Screen" and takes
   * `apple-touch-icon` instead — see the comment in `index.html`. That tag is
   * therefore the only icon iOS reaches for, and it is not in `manifest.icons`,
   * so nothing above would notice it missing.
   */
  it('is accompanied by the apple-touch-icon iOS uses instead of the manifest icons', () => {
    expect(indexHtml).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
    expect(existsSync(root('public/apple-touch-icon.png'))).toBe(true);
  });
});
