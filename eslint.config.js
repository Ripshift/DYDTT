/**
 * DYDTT — ESLint 9 flat config
 */
import js      from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'storybook-static/**', 'coverage/**', 'node_modules/**'] },

  js.configs.recommended,

  // App code — runs in the browser
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType:  'module',
      globals:     { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },

  // Dev seed can also run under Node (`pnpm seed`)
  {
    files: ['src/db/seed.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Service worker
  {
    files: ['public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },

  // Tests + configs
  {
    files: ['tests/**/*.js', 'firestore/**/*.js', '*.config.js', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...globals.vitest } },
  },
];
