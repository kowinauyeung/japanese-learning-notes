import type { VitePWAOptions } from 'vite-plugin-pwa';
import { CORE_FONT_DIR, RUNTIME_FONT_DIR } from './font-config.ts';

/**
 * The service worker's configuration, as a function of the build mode.
 *
 * Extracted from `vite.config.ts` for the same reason `build-info.ts` is: the
 * interesting part is a value, and a value can be read back and asserted on. A
 * plugin instance cannot — `VitePWA(options)` returns plugin objects that do
 * not carry the options anywhere a test can reach — so inlining this would put
 * every decision below beyond the reach of anything but a full build.
 *
 * `tests/unit/pwaConfig.test.ts` is what reads it.
 */
export const pwaOptions = (mode: string): Partial<VitePWAOptions> => ({
  /**
   * **`prompt`, not `autoUpdate`.** The reader decides when the new build is
   * taken; see `src/lib/appUpdate.tsx` for what that costs and why it is still
   * the right side of the trade.
   */
  registerType: 'prompt',

  /**
   * **Off for the end-to-end build, and this is not a tidiness measure.** A
   * worker that precached the previous build serves it to Playwright, and the
   * suite then passes against code that is not the code under test — green for
   * a build nobody shipped. `vite.config.ts` already branches on this mode for
   * the backend alias, so the seam is one the architecture had rather than one
   * added for this.
   *
   * **`e2e-pwa` is the deliberate exception**, and the comparison is exact
   * rather than a prefix for that reason. It is the same in-memory build with
   * the worker left in, so that `tests/e2e/offline.spec.ts` can load the app
   * with the network off — the one claim in this file that no amount of reading
   * the configuration back can settle.
   *
   * The hazard above does not follow it there, and that was measured rather
   * than assumed: `chromium.launch()` starts from an empty profile, so a fresh
   * browser reports `caches.keys()` as `[]` and precaches 40 entries from the
   * build it was just given. Contexts inside one launch do share the cache —
   * but one launch is one build, so there is no earlier build for them to be
   * served. Only a cache surviving *between runs* could do that, and none does.
   */
  disable: mode === 'e2e',

  /**
   * Off by default. A worker in `yarn dev` caches modules Vite expects to serve
   * fresh, and the resulting staleness reads as a bug in whatever is being
   * edited. Flip it here when the thing being debugged *is* the worker.
   */
  devOptions: { enabled: false },

  /**
   * The manifest is `public/manifest.webmanifest`, written by hand in #66 and
   * linked from `index.html`. Letting the plugin emit one too would put two
   * manifests in `dist/` and leave which of them a browser reads to the order
   * of the tags.
   */
  manifest: false,

  /**
   * Registration happens in `src/infra/pwa/updatePort.ts`, because the prompt
   * has to be wired to the same `registerSW` call that learns a new build is
   * waiting. An injected script would register a second time and own the
   * callback this app needs.
   *
   * `false` and not `null`: both mean "inject nothing", and the plugin's own
   * type marks `null` deprecated in favour of `false`.
   */
  injectRegister: false,

  workbox: {
    /**
     * Every route in `src/router.tsx` is a `lazy: () => import(...)`, so the
     * chunks are the app. Precaching the shell without them is what #67
     * describes: a cache full of words behind a shell that cannot reach the
     * screen the reader asked for.
     *
     * `webmanifest` is here because the default pattern list does not include
     * it, and an installed window that cannot read its own manifest offline is
     * the case this whole change is for.
     */
    globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}', `${CORE_FONT_DIR}/*.woff2`],

    /**
     * **Why the fonts are not simply added to the pattern above.**
     *
     * Adding `woff2` to the extension list above would precache 6.8 MB — two
     * whole CJK families at every weight — onto a reader's device before they
     * have looked at a single word. Precaching none of them costs the
     * other way: #81 is explicit that a reader whose vocabulary falls back to
     * the platform face is not looking at a slightly different page, they are
     * looking at different letterforms — which is the subject of this
     * application.
     *
     * So `font-config.ts` splits the files by how common the characters in
     * them are, `vite.config.ts` emits the two halves into two directories,
     * and the split lands here: the common half is precached (about 1.2 MB, so
     * roughly a doubling of a precache that was 1.2 MB), and the long tail is
     * fetched the first time a character needs it and kept from then on.
     *
     * `CacheFirst` rather than `StaleWhileRevalidate`, because these files are
     * content-hashed: the URL changes when the bytes do, so there is nothing a
     * revalidation could discover except that the file is still itself.
     */
    runtimeCaching: [
      {
        urlPattern: new RegExp(`/${RUNTIME_FONT_DIR}/.*\\.woff2$`),
        handler: 'CacheFirst',
        options: {
          cacheName: 'font-chunks',
          /**
           * Above the number of files that exist (266 at the time of writing),
           * so the cap is a runaway guard rather than an eviction policy. A
           * limit that actually bit would evict on a schedule nobody chose, and
           * the character it dropped would silently change shape the next time
           * the reader opened the app offline.
           */
          expiration: { maxEntries: 400 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],

    /**
     * Matches the `rewrites` block in `firebase.json`: without a navigation
     * fallback an offline navigation to `/vocabulary` asks the cache for a
     * document that was never a file.
     *
     * **This restates the plugin's own default rather than establishing the
     * behaviour**, which was found by trying to prove the opposite: deleting
     * this line still emits `createHandlerBoundToURL("index.html")` into
     * `sw.js`, and `tests/e2e/offline.spec.ts` stayed green. It is kept because
     * the fallback is a decision this app depends on and a default is a decision
     * nobody made — but it is not what holds the behaviour up, so nothing should
     * be red-proofed by removing it. The denylist below is the load-bearing half.
     */
    navigateFallback: '/index.html',

    /**
     * **Firebase reserves `/__/*`, and sign-in is served from it.**
     * `signInWithPopup` opens `/__/auth/handler` on the configured auth domain.
     * That is a different origin while the auth domain is the
     * `*.firebaseapp.com` default — but pointing it at the hosting domain is a
     * documented way to avoid third-party cookie problems, and the day someone
     * does that, a navigation fallback would answer the auth handler with
     * `index.html` and sign-in would break with no error naming the cause.
     * Denying the prefix costs nothing today and is the difference between that
     * being a non-event and an outage.
     */
    navigateFallbackDenylist: [/^\/__\//],

    /**
     * **`skipWaiting` and `clientsClaim` both stay off**, which is the decision
     * #68 asks to have written down.
     *
     * Claiming immediately swaps the precached assets under a session that is
     * already running. The reader mid-dictation does not get a new build so
     * much as a different one halfway through: the chunk their next interaction
     * lazily imports comes from a bundle the loaded code was not compiled
     * against. That is a worse failure than the staleness it fixes, because it
     * is not reproducible and it lands on whoever was busiest.
     *
     * The cost of the other side is real and is not being waved away: a waiting
     * worker waits for every tab on the origin to close, which for an installed
     * app can be days. That is exactly why this cannot ship without the prompt
     * in #68 — the prompt is what ends the wait, on the reader's word rather
     * than the browser's.
     */
    skipWaiting: false,
    clientsClaim: false,

    /**
     * Precaches are keyed by revision, so a superseded entry is dead weight in
     * storage a phone may later reclaim under pressure — taking the live cache
     * with it.
     */
    cleanupOutdatedCaches: true,
  },
});
