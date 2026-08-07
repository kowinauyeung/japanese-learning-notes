import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Kept separate from vite.config.ts so the test run does not pull in the React
 * and Tailwind plugins it has no use for. These tests drive the Firestore
 * emulator over the wire; nothing is bundled.
 */
export default defineConfig({
  // Mirrors vite.config.ts. Kept in step by hand rather than shared, because
  // importing that config would pull its plugins in with it.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
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
