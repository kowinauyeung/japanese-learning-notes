import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Kept separate from vite.config.ts so the test run does not pull in the React
 * and Tailwind plugins it has no use for. JSX is handled by esbuild below
 * instead: the component tests render markup and assert on it, and none of them
 * care how the CSS was generated.
 *
 * Playwright owns `tests/e2e` and is configured in playwright.config.ts. Nothing
 * here matches those files.
 */
export default defineConfig({
  // Mirrors vite.config.ts. Kept in step by hand rather than shared, because
  // importing that config would pull its plugins in with it.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // The root tsconfig.json is a solution file with no compilerOptions, so
  // esbuild cannot discover `jsx: react-jsx` from it. Stating it here is what
  // lets a .tsx test compile without adding the React plugin.
  esbuild: { jsx: 'automatic' },
  test: {
    // Rules tests call clearFirestore() between cases, and the adapter tests
    // write to the same emulator. Running files in parallel would have one
    // wiping the other's data.
    fileParallelism: false,
    // Emulator startup is outside this budget (emulators:exec waits for it),
    // but a rules evaluation that hangs should fail rather than stall CI.
    testTimeout: 15_000,

    // Split by what a project needs to run, not by what it tests: `unit` and
    // `dom` need nothing, `emulator` needs a Java process. That is the line CI
    // splits its jobs on, and the line that decides whether a contributor can
    // run something without installing a JDK.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/component/**/*.test.tsx'],
          setupFiles: ['tests/setup/dom.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'emulator',
          environment: 'node',
          include: ['tests/{integration,rules}/**/*.test.ts'],
        },
      },
    ],

    // Reported, never enforced. A threshold rewards writing assertions that
    // execute lines rather than assertions that would fail on a defect, and
    // the modules that matter here are named in CLAUDE.md instead.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Composition and configuration: no branches worth asserting on, and
        // both read import.meta.env, which only exists in a browser build.
        'src/main.tsx',
        'src/router.tsx',
        'src/lib/env.ts',
        'src/infra/firebase/client.ts',
        'src/vite-env.d.ts',
        // Type-only modules compile away to nothing.
        'src/domain/ports.ts',
      ],
    },
  },
});
