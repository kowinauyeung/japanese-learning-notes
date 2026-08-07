import { defineConfig } from 'vitest/config';

/**
 * Kept separate from vite.config.ts so the test run does not pull in the React
 * and Tailwind plugins it has no use for. These tests drive the Firestore
 * emulator over the wire; nothing is bundled.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Rules tests share one emulator instance and seed overlapping paths, so
    // running files in parallel would have them clearing each other's data.
    fileParallelism: false,
    // Emulator startup is outside this budget (emulators:exec waits for it),
    // but a rules evaluation that hangs should fail rather than stall CI.
    testTimeout: 15_000,
  },
});
