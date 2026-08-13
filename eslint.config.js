import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import perfectionist from 'eslint-plugin-perfectionist';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '.vite/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'tests/e2e/__screenshots__/**',
      'migration/output.json',
      'migration/review.json',
    ],
  },

  // Full-width spaces (U+3000) are ordinary Japanese text here, and appear
  // deliberately inside regexes that split headings and field labels.
  {
    rules: {
      'no-irregular-whitespace': ['error', { skipRegExps: true }],
    },
  },

  // Import order only. Perfectionist can also sort object keys, union members
  // and JSX props, and none of those are wanted: the manifest rows, the schema
  // in jsonImport.ts and the POS_MAP in normalize.mjs are all ordered on
  // purpose, and alphabetising them would destroy information.
  {
    plugins: { perfectionist },
    rules: {
      'perfectionist/sort-imports': [
        'error',
        {
          type: 'natural',
          internalPattern: ['^@/'],
          newlinesBetween: 'ignore',
          // Bare selectors, so a `import type` stays beside the value import
          // from the same module instead of being hoisted into a types block.
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'unknown'],
        },
      ],
    },
  },

  // Application source. Type-aware linting is on: the rules that matter most
  // here (floating promises around Firestore writes, unnecessary conditions)
  // need type information to fire at all.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      // Downgraded, not silenced. The three current hits (the entries fetch, the
      // form reset on open, the tooltip measurement) each need a real refactor,
      // which does not belong in a tooling PR. Kept visible so they get done.
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Vendor fence. `src/infra` is the only place allowed to reach for the
  // Firebase SDK; everything else works in domain types and plain ISO strings.
  //
  // Enforced mechanically rather than by convention because the leak it prevents
  // is invisible: `types/entry.ts` used to `import type { Timestamp }`, one line
  // that pulled a vendor type through `Entry` into every component that touched
  // an entry. Type-only imports are covered — hence the typescript-eslint
  // version of the rule, which sees them. The pattern is a regex anchored on the
  // bare specifier, because `group` matches anywhere in a path and would also
  // catch `@/infra/firebase/…`, which is the next rule's job, not this one's.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/infra/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^firebase(/|$)',
              message:
                'Import the Firebase SDK only in src/infra. Depend on src/domain/ports instead.',
            },
          ],
        },
      ],
    },
  },

  // The UI never names an adapter. Wiring a port to its implementation is the
  // job of the providers in src/lib, which are the composition root; a card or a
  // route reaching past them is how a component ends up knowing where its data
  // is stored.
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/routes/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@/infra/',
              message: 'Go through a provider or hook in src/lib rather than an adapter.',
            },
          ],
        },
      ],
    },
  },

  // Tests. Same strictness as src, and no vendor fence — driving the emulator
  // is the whole point.
  //
  // Both global sets, because a Playwright spec is a Node file that also ships
  // callbacks into the page: `addInitScript` runs its argument in the browser,
  // where `window` is the only thing there is.
  //
  // Named explicitly rather than left to projectService, which resolves through
  // the nearest tsconfig.json. That is the solution file, and tsconfig.test.json
  // is deliberately not one of its references: referencing it would require
  // tsconfig.app.json to emit, which it does not.
  {
    files: ['tests/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Same underscore convention as src. Tests destructure-and-discard more
      // often than the app does — it is how a fixture reproduces exactly what a
      // script drops before writing.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // The same fence the UI has, for the tests that stand in the UI's position.
  // CLAUDE.md states it as a rule; leaving it to self-discipline while the
  // neighbouring rule is machine-enforced is the inconsistency this closes.
  //
  // `tests/unit` is deliberately outside it: cursor encoding lives in
  // `src/infra/firebase/cursor.ts` and is pure, so a unit test importing it is
  // the cheapest layer that can see the defect, not a layering violation.
  // `tests/integration` and `tests/rules` exist to drive the adapter and the
  // emulator, which is the whole point of them.
  {
    files: ['tests/component/**/*.{ts,tsx}', 'tests/e2e/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@/infra/',
              message:
                'Component and end-to-end tests go through src/lib. An adapter test belongs in tests/integration.',
            },
          ],
        },
      ],
    },
  },

  // Build config: same TypeScript rules, Node globals.
  {
    files: ['vite.config.ts', 'vitest.config.ts', 'playwright.config.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Operator and migration scripts written in TypeScript.
  //
  // These were linted by nothing until now. `eslint .` matches no `.ts` file
  // outside the blocks above, and it does not fail on a directory it skips —
  // `npx eslint admin` says "all of the files matching the glob pattern are
  // ignored" and exits 2, but `eslint .` stays green. So `yarn lint` passed
  // over a duplicate import in the script that grants production access.
  //
  // Scoped to the same two folders `tsconfig.scripts.json` includes, so the
  // lint pass and the typecheck pass cannot disagree about what a script is.
  // Typed through `project` rather than `projectService`: the service resolves
  // the nearest `tsconfig.json`, and this repository's root one is a solution
  // file listing no files of its own.
  {
    files: ['admin/**/*.ts', 'migration/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: './tsconfig.scripts.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // One-shot migration scripts and this config file. Plain ESM outside any
  // tsconfig, so they get the untyped ruleset.
  {
    files: ['migration/**/*.mjs', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },

  prettier,
);
