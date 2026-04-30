import { defineConfig, devices } from '@playwright/test';

const TEST_PORT = process.env['PLAYWRIGHT_TEST_PORT'] || '3030';
const BASE_URL =
  process.env['PLAYWRIGHT_BASE_URL'] || `http://localhost:${TEST_PORT}`;
const STARTS_OWN_SERVER = !process.env['PLAYWRIGHT_BASE_URL'];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  ...(STARTS_OWN_SERVER && {
    webServer: {
      command: `PORT=${TEST_PORT} npm run dev`,
      url: `http://localhost:${TEST_PORT}/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 90_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  }),
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
