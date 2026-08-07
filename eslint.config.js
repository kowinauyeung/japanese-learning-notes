import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import perfectionist from 'eslint-plugin-perfectionist';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', '.vite/**', 'migration/output.json', 'migration/review.json'],
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

  // Tests. Same strictness as src, Node globals, and no vendor fence — driving
  // the emulator is the whole point.
  //
  // Named explicitly rather than left to projectService, which resolves through
  // the nearest tsconfig.json. That is the solution file, and tsconfig.test.json
  // is deliberately not one of its references: referencing it would require
  // tsconfig.app.json to emit, which it does not.
  {
    files: ['tests/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Build config: same TypeScript rules, Node globals.
  {
    files: ['vite.config.ts', 'vitest.config.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
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
