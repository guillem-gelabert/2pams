import { test, expect } from '@playwright/test';

/** Stable upstream — verifies the proxy fetches and serves content end-to-end. */
test('proxies example.com and renders visible content', async ({
  page,
  baseURL,
}) => {
  const response = await page.goto(`${baseURL}/https://example.com/`, {
    waitUntil: 'domcontentloaded',
  });
  expect(response!.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText(/example domain/i);
});

test('rejects requests to private hosts (SSRF guard)', async ({ request }) => {
  const res = await request.get(`/https://127.0.0.1/`);
  expect(res.status()).toBe(403);
});

test('health endpoint responds OK', async ({ request }) => {
  const res = await request.get(`/health`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { status: string };
  expect(body.status).toBe('OK');
});
