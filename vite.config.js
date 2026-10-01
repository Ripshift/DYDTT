/**
 * DYDTT Phase 1 — Vite Configuration
 * Vite 5 · vite-plugin-pwa (Workbox injectManifest) · Vitest
 */

import { defineConfig } from 'vite';
import { VitePWA }      from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      strategies:    'injectManifest',
      srcDir:        'public',
      filename:      'sw.js',
      registerType:  'prompt',
      injectRegister: null,

      manifest: false, // We manage manifest.json manually in public/

      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores:  ['**/node_modules/**', '**/sw.js'],
      },

      devOptions: {
        enabled:  true,
        type:     'module',
        navigateFallback: 'index.html',
      },
    }),
  ],

  build: {
    target:     'es2022',
    outDir:     'dist',
    sourcemap:  true,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        manualChunks: {
          dexie: ['dexie'],
        },
      },
    },
  },

  server: {
    port:  5173,
    open:  true,
    https: false,
    headers: {
      'Service-Worker-Allowed': '/',
    },
  },

  preview: {
    port:  4173,
    https: false,
  },

  test: {
    globals:     true,
    environment: 'jsdom',
    setupFiles:  ['./tests/setup.js'],
    coverage: {
      provider:   'v8',
      reporter:   ['text', 'lcov', 'html'],
      include:    ['src/**/*.js'],
      exclude:    [
        'src/stories/**', 'src/**/*.stories.js',
        // Not unit-tested on purpose:
        'src/main.js',              // boot wiring — covered by the browser smoke test
        'src/firebase.js',          // Firebase SDK init (needs real config + network)
        'src/auth/authManager.js',  // thin Firebase Auth wrapper — test against the Auth emulator later
        'src/db/seed.js',           // dev-only sample data
        'src/sync/firestoreAdapter.js', // talks to real Firestore — covered by firestore/rules.test.js + manual testing
        'src/social/socialAdapter.js',  // same, for Friends & Family
      ],
      thresholds: {
        lines:      80,
        functions:  80,
        branches:   75,
        statements: 80,
      },
    },
    include: ['tests/**/*.test.js', 'src/**/*.test.js'],
  },

  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
