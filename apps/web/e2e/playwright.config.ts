import { defineConfig, devices } from '@playwright/test';

import { BASE_URL } from './fixtures/server-harness';

export default defineConfig({
  testDir: './tests',
  outputDir: '.runtime/test-results',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: '.runtime/report', open: 'never' }],
  ],
  timeout: 30_000,

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
