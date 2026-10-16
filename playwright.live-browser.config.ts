import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/live-browser',
  workers: 1,
  reporter: 'list',
});
