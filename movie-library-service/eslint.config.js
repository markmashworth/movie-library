// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // -------------------------------------------------------------------------
  // Ignored paths
  // -------------------------------------------------------------------------
  {
    ignores: ['node_modules/**', 'dist/**', 'scripts/**', 'public/**'],
  },

  // -------------------------------------------------------------------------
  // All TypeScript sources (service + tests)
  // -------------------------------------------------------------------------
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // -----------------------------------------------------------------------
      // Style — match the existing codebase conventions
      // -----------------------------------------------------------------------

      // The codebase uses single quotes throughout.
      'quotes': ['error', 'single', { avoidEscape: true }],

      // Semicolons are always present.
      'semi': ['error', 'always'],

      // Arrow functions use braces only when needed (body with multiple stmts).
      'arrow-body-style': ['error', 'as-needed'],

      // -----------------------------------------------------------------------
      // TypeScript — relax rules that fire on legitimate patterns in the repo
      // -----------------------------------------------------------------------

      // Repository intentionally uses `unknown` casts via `as` in validated
      // input handlers (validateMovieInput). Banning all assertions is too
      // strict for this codebase.
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],

      // `void` operator is used in signal handlers to suppress
      // floating-promise warnings (see index.ts).  Keep the rule but allow
      // the void-operator pattern.
      '@typescript-eslint/no-floating-promises': [
        'error',
        { ignoreVoid: true },
      ],

      // Express error-handler middleware must have 4 params even if _next is
      // unused.  The existing suppress comment is fine; don't double-warn.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // The codebase uses non-null assertions (`!`) in a few well-understood
      // places (e.g. `all[0]!.year`).  Allow them rather than forcing verbose
      // null-checks everywhere.
      '@typescript-eslint/no-non-null-assertion': 'off',

      // `require()` is never used — this is a pure ESM project.
      '@typescript-eslint/no-require-imports': 'error',

      // Unsafe `any` rules: turn off the noisiest ones that fire on the
      // googleapis / express-idempotency integrations where library types
      // are inherently loose.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
);
