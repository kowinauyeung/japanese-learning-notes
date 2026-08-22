import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { icons as generated } from '../../scripts/icon-specs';
import { manifestScreenshots as generatedScreenshots } from '../../scripts/manifest-screenshot-specs';

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

function pngSize(path: string): { width: number; height: number } {
  const png = readFileSync(path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

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
  screenshots?: Screenshot[];
}

interface Screenshot {
  src: string;
  sizes: string;
  type: string;
  label: string;
  form_factor?: string;
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

  /**
   * The reverse direction, and it has to come from somewhere other than the
   * manifest to be one.
   *
   * The loop above walks the manifest and asks whether each file exists, so by
   * construction it cannot see an icon that exists and is named nowhere — `yarn
   * icons` emitting a new size, or a file left behind by a rename. An earlier
   * version compared the manifest against a list written here instead, which has
   * exactly the same blind spot with more ceremony: both halves get edited
   * together.
   *
   * The comparison is against the *generator's* list and not against every PNG
   * in `public/`, which an earlier version did do. That version would go red the
   * day #80 adds a manifest screenshot, or anyone adds an Open Graph card —
   * images that are not icons, on a manifest that is entirely valid.
   */
  it('references every icon the generator marks as a manifest icon, and no other', () => {
    const expected = generated
      .filter((icon) => icon.inManifest)
      .map((icon) => icon.file)
      .sort();
    const referenced = manifest.icons.map((icon) => icon.src.replace(/^\//, '')).sort();
    // Red in both directions: an icon `yarn icons` produces but the manifest
    // never names installs as a missing tile, and an icon the manifest names
    // but the generator does not produce is a 404 the install flow reports
    // nowhere.
    expect(referenced).toEqual(expected);
  });

  it('has actually been generated, so a spec added without running `yarn icons` cannot pass', () => {
    for (const icon of generated) {
      // The list above is a promise about `public/`. Nothing else checks it was
      // kept, and a manifest pointing at a file that was never rasterised is the
      // blank-tile install again, one step earlier.
      expect(existsSync(root(`public/${icon.file}`)), icon.file).toBe(true);
    }
  });
});

/**
 * Chromium's richer install dialog.
 *
 * The app installs without these and therefore nothing functional fails when
 * they are missing; what goes missing is the dialog that shows a reader what
 * they are installing. That makes drift here silent in exactly the way the
 * icon drift above is silent: install still works, but it works with the wrong
 * product surface.
 */
describe('the install screenshots Chromium reads from the manifest', () => {
  it('declares at least two screenshots, because Chromium picks one wide and one non-wide prompt surface', () => {
    expect(manifest.screenshots?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('offers one wide screenshot for desktop and one non-wide screenshot for mobile', () => {
    expect(manifest.screenshots?.some((shot) => shot.form_factor === 'wide')).toBe(true);
    expect(manifest.screenshots?.some((shot) => shot.form_factor !== 'wide')).toBe(true);
  });

  it('references every committed install screenshot the generator names, and no other', () => {
    const expected = generatedScreenshots.map((shot) => `/${shot.file}`).sort();
    const referenced = (manifest.screenshots ?? []).map((shot) => shot.src).sort();
    expect(referenced).toEqual(expected);
  });

  it('points each screenshot entry at a file that exists in public/', () => {
    for (const shot of manifest.screenshots ?? []) {
      expect(existsSync(root(`public${shot.src}`)), shot.src).toBe(true);
    }
  });

  it('matches the committed PNG pixel dimensions, not only the manifest metadata string', () => {
    for (const expected of generatedScreenshots) {
      expect(pngSize(root(`public/${expected.file}`))).toEqual({
        width: expected.width,
        height: expected.height,
      });
    }
  });

  it('matches the generator spec for sizes, type, label, and form factor', () => {
    const screenshotsBySrc = new Map((manifest.screenshots ?? []).map((shot) => [shot.src, shot]));
    for (const expected of generatedScreenshots) {
      const shot = screenshotsBySrc.get(`/${expected.file}`);
      expect(shot).toEqual({
        src: `/${expected.file}`,
        sizes: `${expected.width}x${expected.height}`,
        type: expected.type,
        label: expected.label,
        ...(expected.formFactor ? { form_factor: expected.formFactor } : {}),
      });
    }
  });
});

/**
 * The manifest and `index.html` say overlapping things, and the browser reads
 * both. Where they disagree the disagreement is invisible: nothing errors, and
 * which one wins depends on the platform.
 */
describe('the manifest against index.html', () => {
  it('is linked from the document, or nothing reads it at all', () => {
    // Without the tag the file is just a JSON document nobody fetches: no
    // install prompt, no home-screen name, no `standalone` window — and the app
    // in a browser tab looks exactly the same, which is why nothing catches it.
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
