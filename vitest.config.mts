import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  resolve: { tsconfigPaths: true },
  test: {
    // Test files that need a DOM start with `// @vitest-environment jsdom`.
    environment: 'node',
    // The shell may export these for the installed app. Emptied, the app's
    // `||` fallbacks use this checkout's migrations and Playbook (T1266).
    env: { TANDEMBIKE_PACKAGE_DIR: '', TANDEMBIKE_DATA_DIR: '' },
    // The browser-check helper lives in the docs it serves (T1374).
    include: [
      'src/**/*.test.{ts,tsx}',
      'docs/agents/browser-check/**/*.test.ts',
    ],
    setupFiles: ['./src/test/setup.ts'],
  },
});
