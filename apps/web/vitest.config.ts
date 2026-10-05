import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Whole-app render tests take 1-4 s alone; `pnpm check` runs every workspace's tests at once,
    // which pushed them past the 5 s default. 15 s still catches a hang.
    testTimeout: 15_000,
  },
});
