import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    // The shell may export these for the installed app. Emptied, the app's
    // `||` fallbacks use this checkout's migrations and Playbook (T1266).
    env: { TANDEMBIKE_PACKAGE_DIR: '', TANDEMBIKE_DATA_DIR: '' },
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
