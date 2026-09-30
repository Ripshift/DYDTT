// Vitest config for Firestore security-rule tests (runs against the local emulator).
// Usage: pnpm test:rules   (needs Java installed — the emulator is a Java app)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include:     ['firestore/**/*.test.js'],
    environment: 'node',
    testTimeout: 15000,
  },
});
