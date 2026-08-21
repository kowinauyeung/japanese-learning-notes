import type { VitePWAOptions } from 'vite-plugin-pwa';

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
    globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],

    /**
     * Matches the `rewrites` block in `firebase.json`. Without it an offline
     * navigation to `/vocabulary` asks the cache for a document that was never
     * a file.
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
