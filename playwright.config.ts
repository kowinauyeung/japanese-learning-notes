import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const CI = !!process.env.CI;

/**
 * End-to-end and visual regression.
 *
 * Runs against a local `vite preview` of an `e2e`-mode build, not the Firebase
 * Hosting preview channel a pull request also publishes. The channel is for a
 * human to click; pointing CI at it would add a network hop and make the run
 * depend on a deploy step that has nothing to do with the code under test.
 *
 * That build swaps `src/lib/backend.ts` for its in-memory twin, so nothing here
 * touches Firestore. Firestore is covered by tests/integration and tests/rules
 * against the emulator, where it can be asserted precisely and without a
 * browser.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Random exploration is isolated from the deterministic end-to-end gate.
  // Its own config supplies a replayable seed and retains a trace on failure.
  testIgnore: '**/monkey.spec.ts',
  fullyParallel: true,
  forbidOnly: CI,
  // One retry in CI absorbs a genuinely flaky navigation without hiding a
  // reproducible failure, which would fail twice.
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  /**
   * Screenshots are compared per platform **and per browser**.
   *
   * Baselines are generated on Linux — see `yarn test:visual:update` — because
   * macOS and Linux hint and antialias Japanese glyphs differently, and a
   * baseline authored on a laptop would fail on every CI run for reasons that
   * have nothing to do with the change.
   *
   * `{projectName}` was added when WebKit was: without it a WebKit run compares
   * against the Chromium baseline sitting beside it, which fails on
   * antialiasing alone and, worse, is silently overwritten by
   * `--update-snapshots`. Two engines rendering the same markup differently is
   * the entire reason the second project exists, so their expected results
   * cannot share a file.
   */
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',

  expect: {
    toHaveScreenshot: {
      /**
       * `threshold` is per pixel and absorbs subpixel antialiasing. The budget
       * beside it counts pixels, and it is **absolute rather than a ratio** —
       * which was the whole problem with the ratio.
       *
       * A ratio scales the allowance with the canvas, so it is strictest on the
       * baselines that need it least: 0.005 gave the 244×73 furigana crop 89
       * pixels and the 1280×1135 full-page dashboard 7,264. The large shot,
       * where a regression has the most room to hide, had the loosest gate. It
       * absorbed three changes in a row — a rebuilt 最新の練習 panel, and the
       * navigation both renamed and reordered — using 1,293 of those 7,264 and
       * staying green throughout.
       *
       * 150 is headroom, not tolerance: measured at `maxDiffPixels: 0`, all
       * four baselines render byte-identical in the pinned container image, so
       * this is slack for a font or driver revision inside it and nothing else.
       */
      threshold: 0.15,
      maxDiffPixels: 150,
      animations: 'disabled',
      caret: 'hide',
    },
  },

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Existing scenarios assert the original Japanese interface. Pinning the
    // browser preference keeps those tests deterministic now that production
    // intentionally follows the visitor's locale.
    locale: 'ja-JP',
    trace: 'on-first-retry',
    // Fixed, because it is part of every screenshot baseline.
    viewport: { width: 1280, height: 720 },
  },

  /**
   * Chromium runs everything; WebKit runs the specs that are about rendering.
   *
   * **The reason WebKit is here is a bug it shipped.** `line-clamp` compiles to
   * `display: -webkit-box`, and WebKit lays a `<ruby>` out inside one by
   * dropping the base text and painting only the annotation — so every headword
   * on the dashboard rendered as bare furigana on an iPhone, with the kanji
   * simply absent. Chromium implements the same property and renders it
   * correctly, so the whole suite, the committed baselines and a hand check in
   * a local Chromium all agreed the layout was fine.
   *
   * That is not a one-off. This is a Japanese vocabulary notebook read mostly on
   * a phone: ruby, `-webkit-` prefixed layout and iOS Safari's viewport
   * behaviour are the parts most likely to differ, and they are precisely the
   * parts nothing here could see. The previous change to this repository was
   * also an iOS-only defect.
   *
   * **Scoped by `testMatch` rather than run wholesale.** WebKit doubles the
   * suite for a second opinion that only differs on rendering; routing,
   * providers and state machines do not need a second browser to be checked in.
   * `visual.spec.ts` is where the layout claims live, so that is what runs.
   *
   * **No screenshots are taken here.** `snapshotPathTemplate` keys baselines on
   * platform and not on browser, so a WebKit run would compare against — and
   * `--update-snapshots` would overwrite — the Chromium baselines committed
   * beside it. The assertions this project exists for measure the DOM instead,
   * which is browser-independent by construction; `test.skip` on the screenshot
   * block keeps them out of its way.
   */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'webkit',
      testMatch: /visual\.spec\.ts/,
      use: { ...devices['iPhone 14'], isMobile: false, hasTouch: false },
    },
  ],

  webServer: {
    // `--host 127.0.0.1` is not decoration: vite preview otherwise binds to
    // `localhost`, which resolves to ::1 first on macOS, and the readiness poll
    // below is over IPv4. Without it the server starts fine and Playwright
    // times out waiting for a port nothing is listening on.
    command: `yarn build:e2e && yarn vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
