import { defineConfig, devices } from '@playwright/test';

const SHELL_URL =
  process.env['PLAYWRIGHT_SHELL_URL'] || 'http://app.2pams.local:3000';
const CONTENT_URL =
  process.env['PLAYWRIGHT_CONTENT_URL'] ||
  'http://content.2pams-sandbox.local:3001';

const STARTS_OWN_SERVERS = !process.env['PLAYWRIGHT_SHELL_URL'];

export default defineConfig({
  testDir: './tests/e2e-2-domains',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: SHELL_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    extraHTTPHeaders: {},
  },
  ...(STARTS_OWN_SERVERS && {
    webServer: [
      {
        command: 'npm run dev:shell',
        url: 'http://app.2pams.local:3000/health',
        reuseExistingServer: !process.env['CI'],
        timeout: 90_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
      {
        command: 'npm run dev:content',
        url: 'http://content.2pams-sandbox.local:3001/health',
        reuseExistingServer: !process.env['CI'],
        timeout: 90_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    ],
  }),
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: SHELL_URL,
      },
      metadata: { contentURL: CONTENT_URL },
    },
  ],
});
