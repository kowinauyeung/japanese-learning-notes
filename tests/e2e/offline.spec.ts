import { expect, test, type Page } from '@playwright/test';
import { seed, WORDS } from './fixtures';

/**
 * The app with the network off.
 *
 * **The only claim in this repository that needs a browser, a real build and a
 * real service worker at once.** Everything else about the worker is a value —
 * `globPatterns`, `navigateFallback`, `skipWaiting` — and `tests/unit/pwaConfig.test.ts`
 * reads those back without booting anything, which is faster and says why each
 * one is what it is. What no amount of reading configuration back can settle is
 * whether the reader who opens the installed app on a train still gets their
 * notebook, and that is the whole of what runs here.
 *
 * The defect it exists for: every route in `src/router.tsx` is a
 * `lazy: () => import(...)`, so each screen is a separate chunk fetched on
 * arrival. A precache that covers the shell but not the chunks produces an app
 * that opens offline and then cannot reach a single page — the router's error
 * boundary renders `ErrorScreen` on a dynamic import that never resolves. That
 * failure is in what the network did not serve, so it is invisible to every
 * layer below this one.
 *
 * **Runs in its own project, against its own build.** `--mode e2e` ships no
 * worker on purpose (see `pwa-config.ts`), so the ordinary end-to-end build has
 * nothing to test here; `--mode e2e-pwa` is the same in-memory build with the
 * worker left in, served on its own port. `playwright.config.ts` wires both.
 *
 * Chromium only, and not because WebKit does not matter. Playwright's WebKit
 * does not run service workers, so a second project there would report a
 * precache that is empty rather than a rendering the two engines disagree
 * about — which is the only thing the WebKit project exists to catch.
 */

/**
 * Resolves once the worker has installed and filled its cache.
 *
 * Measured, not assumed, and each part is load-bearing:
 *
 *   - `navigator.serviceWorker.ready` resolves with the worker in state
 *     `activating`, not `activated`, and the precache is already populated at
 *     that point — 40 entries against this build.
 *   - `navigator.serviceWorker.controller` is **still null**, because
 *     `clientsClaim` is off (see `pwa-config.ts`, where it is off deliberately).
 *     The page that installed the worker is never controlled by it; the *next*
 *     navigation creates a client the active worker does control. So waiting for
 *     a controller here would wait forever.
 *   - **`ready` is raced against a deadline rather than awaited.** With nothing
 *     registering a worker it never settles at all, and every test then runs to
 *     its 30-second timeout — which reads as a flaky machine rather than as the
 *     regression it is. That is not hypothetical: it is what the first version of
 *     this file did when the alias was pointed back at `backend.e2e.ts`, five
 *     tests each hanging for 30.1 seconds and none of them saying why.
 */
const READY_DEADLINE_MS = 15_000;

async function waitForPrecache(page: Page): Promise<number> {
  const entries = await page.evaluate(async (deadline) => {
    const ready = await Promise.race([
      navigator.serviceWorker.ready.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), deadline)),
    ]);
    if (!ready) return null;
    let count = 0;
    for (const name of await caches.keys()) {
      count += (await (await caches.open(name)).keys()).length;
    }
    return count;
  }, READY_DEADLINE_MS);

  expect(
    entries,
    'No service worker became ready. Either this port is serving the `e2e` build, ' +
      'which ships none by design, or `backend.e2e-pwa.ts` has stopped naming the ' +
      'live `swUpdatePort` — the only `registerSW` call in the app.',
  ).not.toBeNull();
  return entries ?? 0;
}

/**
 * 兆候 and not 切り分け, and the difference is not cosmetic. Furigana is markup:
 * the card's accessible name interleaves each `<rt>` with the base text, so a
 * headword with okurigana reads as 切きり分わけ and `/切り分け/` matches nothing.
 * 兆候 carries one annotation over an unbroken kanji run, which leaves the
 * headword itself contiguous in the name — the same reason `vocabulary.spec.ts`
 * reaches for it.
 */
const HEADWORD = /兆候/;

test.describe('with the network off', () => {
  test('precaches enough of the build to be worth going offline with', async ({ page }) => {
    // Guards every test below. They all begin by going offline, and against an
    // empty cache the failure reads as "the app is broken offline" when the
    // truth is that nothing was ever cached — a worker that failed to install,
    // or an `e2e` build served on this port by mistake. Naming that separately
    // is what keeps the others' red meaningful.
    await seed(page, { signedIn: true, entries: WORDS });
    await page.goto('/');
    expect(await waitForPrecache(page)).toBeGreaterThan(10);
  });

  test('opens the dashboard, which is the whole point of installing it', async ({
    page,
    context,
  }) => {
    await seed(page, { signedIn: true, entries: WORDS });
    await page.goto('/');
    await waitForPrecache(page);

    await context.setOffline(true);
    await page.goto('/');

    // A panel the dashboard chunk draws, and then a word inside it. A served
    // `index.html` with no chunk behind it still renders a document, so
    // asserting that the page loaded at all would pass on exactly the defect
    // this is for — and the seeded word proves the in-memory adapter came
    // across in the bundle too, rather than an empty frame.
    // Scoped to the panel, because the dashboard links the same word twice —
    // once from 今日の単語 and once from this list — and an unscoped match is a
    // strict-mode violation rather than an assertion.
    const recent = page.locator('section', {
      has: page.getByRole('heading', { name: '最近追加した語' }),
    });
    await expect(recent.getByRole('link', { name: HEADWORD })).toBeVisible();
  });

  test('reaches a route whose chunk it has never fetched, which is where lazy loading breaks', async ({
    page,
    context,
  }) => {
    await seed(page, { signedIn: true, entries: WORDS });
    await page.goto('/');
    await waitForPrecache(page);

    // Offline *before* the route is ever visited, so its chunk can only come
    // from the precache. Visiting it first would fetch and memory-cache the
    // module, and the test would then pass with `globPatterns` covering nothing
    // but the shell.
    await context.setOffline(true);
    await page.goto('/vocabulary');

    // Browse has no heading of its own, so its own controls stand in for one.
    await expect(page.getByPlaceholder('見出し語・読み方・タグ・意味・例文で検索')).toBeVisible();
    // The seeded notebook, not just the frame around it: a page that renders
    // its filters and counts no words is a chunk that did not arrive.
    await expect(page.getByText('3 語')).toBeVisible();
    await expect(page.getByRole('link', { name: HEADWORD })).toBeVisible();
  });

  test('answers a deep link with the shell, since /vocabulary was never a file', async ({
    page,
    context,
  }) => {
    await seed(page, { signedIn: true, entries: WORDS });
    await page.goto('/');
    await waitForPrecache(page);

    await context.setOffline(true);
    // A cold navigation to a path the build never emitted a document for. This
    // is `navigateFallback` doing its job, and it is the same rewrite
    // `firebase.json` performs when the network is up — so without it the app
    // works online and 404s from the home screen, on the one device it is
    // installed on.
    await page.goto('/practice/dictation');

    // The selected tab and not the heading: both drills are one screen called
    // 「練習」 now, so its `<h1>` says the same thing on either route and would
    // pass this test for a fallback that landed on the wrong one.
    await expect(page.getByRole('tab', { name: '書き取り練習', selected: true })).toBeVisible();
  });

  test('draws the headword in its own face, which is the thing the reader came for', async ({
    page,
    context,
  }) => {
    await seed(page, { signedIn: true, entries: WORDS });
    await page.goto('/');
    await waitForPrecache(page);

    // **The HTTP cache is emptied first, and Cache Storage is not.**
    //
    // `firebase.json` serves `/assets/**` as `immutable` for a year, so the
    // font files the online visit fetched are sitting in the browser's own
    // cache — which `setOffline` does not empty. Without this the offline
    // reload could be answered from there and the test would report a font the
    // worker never precached. `Network.clearBrowserCache` is Chromium-only, and
    // this project is the one place that is fine: the spec already runs in a
    // Chromium-only project, because Playwright's WebKit has no service worker.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.clearBrowserCache');
    await cdp.detach();

    await context.setOffline(true);
    await page.goto('/');

    // The claim `pwa-config.ts` cannot make about itself. Its font files are
    // split in two — the common chunks precached, the long tail left to a
    // runtime rule — and reading that configuration back says nothing about
    // whether a chunk the dashboard actually needs is in the half that survives
    // the network being off. 兆候 needs Zen Maru Gothic 700 chunks 77 and 94;
    // both are precached, and a bound moved past either of them would leave the
    // reader's vocabulary drawn in whatever face the device happened to pick.
    //
    // `document.fonts` rather than a screenshot, because a fallback face is
    // perfectly legible: the page looks fine, and only the letterforms are
    // wrong. `status` is the only place the browser says which file it got.
    //
    // **Asserted per code point, not per family.** Every face of this family
    // reports the same `family` and `weight`, and the brand mark in the header
    // is drawn in Zen Maru Gothic 700 too — so a test that asked only whether
    // *a* 700 face had loaded would stay green with 兆 and 候 both missing from
    // the precache, which is the one thing it is here to notice.
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    const covers = await page.evaluate(() => {
      const inRange = (range: string, cp: number) =>
        range.split(',').some((part) => {
          const [start, end] = part.trim().replace(/^u\+/i, '').split('-');
          const low = parseInt(start ?? '', 16);
          return cp >= low && cp <= (end === undefined ? low : parseInt(end, 16));
        });
      const loaded = [...document.fonts].filter(
        (face) =>
          face.family.replace(/["']/g, '') === 'Zen Maru Gothic' &&
          face.weight === '700' &&
          face.status === 'loaded',
      );
      return {
        faces: loaded.length,
        // 兆 and 候 — the headword the dashboard is showing.
        cho: loaded.some((face) => inRange(face.unicodeRange, 0x5146)),
        ko: loaded.some((face) => inRange(face.unicodeRange, 0x5019)),
      };
    });

    expect(covers.faces, 'no Zen Maru Gothic 700 face loaded offline at all').toBeGreaterThan(0);
    expect(covers.cho, '兆 (U+5146) is in no loaded face').toBe(true);
    expect(covers.ko, '候 (U+5019) is in no loaded face').toBe(true);
  });

  test('keeps every font chunk a file, so the runtime half cannot ride into the precache', async ({
    page,
  }) => {
    await seed(page, { signedIn: true, entries: WORDS });
    await page.goto('/');

    // A build fact, checked here because a build is the only thing that can see
    // it: Vite inlines an asset under 4 KiB as a `data:` URI, and twelve of the
    // rare Zen Maru Gothic chunks are under it. Inlined, they are emitted into
    // neither font directory — they go into the stylesheet, and the stylesheet
    // is precached, so the split quietly hands twelve of the runtime half to
    // every reader. Nothing else notices: the count of woff2 in `dist` comes
    // out 351 against 363 rules with no error anywhere.
    //
    // Read through the page rather than off disk, so what is asserted is what a
    // browser was actually served.
    const inlined = await page.evaluate(async () => {
      const hrefs = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
        (link) => link.href,
      );
      const sheets = await Promise.all(
        hrefs.map(async (href) => {
          const response = await fetch(href);
          // `fetch` resolves for a 404 as readily as for a 200, and an error
          // page contains no `data:font` — so without this the assertion below
          // would be satisfied by a stylesheet that was never served.
          return { ok: response.ok, css: await response.text() };
        }),
      );
      return {
        sheets: sheets.length,
        failed: sheets.filter((sheet) => !sheet.ok).length,
        hits: sheets.filter((sheet) => sheet.css.includes('data:font')).length,
      };
    });

    // Without these two the check below passes by finding no stylesheet at all,
    // or by reading error pages instead of the build's CSS.
    expect(inlined.sheets).toBeGreaterThan(0);
    expect(inlined.failed, 'a stylesheet did not load, so its contents prove nothing').toBe(0);
    expect(inlined.hits, 'a font is inlined into a stylesheet the worker precaches').toBe(0);
  });

  test('still serves its own manifest, which an installed window reads on launch', async ({
    page,
    context,
  }) => {
    await seed(page, { signedIn: true });
    await page.goto('/');
    await waitForPrecache(page);

    await context.setOffline(true);
    // Navigating first, and this is the whole shape of the test rather than
    // setup. `clientsClaim` is off, so the page that installed the worker is
    // never controlled by it and its `fetch` goes straight to the network —
    // which, offline, throws. Only a *later* navigation makes a client the
    // active worker controls, and that is also what an installed window does on
    // launch: the process the reader sees is never the one that installed it.
    await page.goto('/');

    // `webmanifest` is not in workbox's default `globPatterns`, so it is listed
    // by hand in `pwa-config.ts` — an omission nothing else here would notice,
    // because the app renders identically without it.
    //
    // Fetched from inside the page rather than through `page.request`, which is
    // a Node-side context that `setOffline` does not govern: it would reach the
    // preview server directly and report success no matter what the worker
    // cached, which is the shape of a test that can never go red.
    const manifest = await page.evaluate(async () => {
      const response = await fetch('/manifest.webmanifest');
      return { ok: response.ok, body: (await response.json()) as { start_url?: string } };
    });
    expect(manifest.ok).toBe(true);
    expect(manifest.body.start_url).toBe('/');
  });
});
