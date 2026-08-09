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
  fullyParallel: true,
  forbidOnly: CI,
  // One retry in CI absorbs a genuinely flaky navigation without hiding a
  // reproducible failure, which would fail twice.
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  /**
   * Screenshots are compared per platform. Baselines are generated on Linux —
   * see `yarn test:visual:update` — because macOS and Linux hint and antialias
   * Japanese glyphs differently, and a baseline authored on a laptop would fail
   * on every CI run for reasons that have nothing to do with the change.
   */
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{platform}{ext}',

  expect: {
    toHaveScreenshot: {
      // Loose enough to absorb subpixel antialiasing, tight enough that a
      // furigana annotation moving from above the word to beside it — which is
      // the defect these exist for — is far outside it.
      threshold: 0.15,
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
      caret: 'hide',
    },
  },

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    // Fixed, because it is part of every screenshot baseline.
    viewport: { width: 1280, height: 720 },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

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
