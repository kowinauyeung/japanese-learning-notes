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

  // Build config: same TypeScript rules, Node globals.
  {
    files: ['vite.config.ts'],
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
