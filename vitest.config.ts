import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Without this the `@/` alias does not resolve under vitest, so nothing that
 * imports across the app — which is every service — can be unit-tested.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
