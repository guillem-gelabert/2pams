import { test, expect } from '@playwright/test';

// NOTE: elpais.com must NOT be used as a test target in automated CI runs.
// It is a real news site that actively blocks bots; hitting it in CI
// constitutes unsolicited scraping of a third-party and will return
// anti-bot challenges, making the test unreliable. Use example.com
// (IANA-reserved, always stable) for functional assertions instead.
// This URL is kept only to preserve the original smoke-test intent;
// the test below deliberately asserts proxy mechanics only, not content.
const ARTICLE =
  'https://elpais.com/economia/2026-04-29/el-bce-pide-a-la-banca-planes-de-contingencia-ante-el-nuevo-modelo-de-ia-de-anthropic.html';

/**
 * Smoke test for the requested URL. We assert the *proxy* did its job
 * (HTTP 200 + HTML body served from our origin). We deliberately do NOT
 * assert article content here because upstream may serve an anti-bot
 * challenge to datacenter egress (e.g. Railway). Content rendering is
 * verified by the example.com test below against a stable upstream.
 */
test('proxies the El País article URL (returns 200 HTML)', async ({
  page,
  baseURL,
}) => {
  const proxyUrl = `${baseURL}/${ARTICLE}`;
  const response = await page.goto(proxyUrl, { waitUntil: 'domcontentloaded' });
  expect(response, 'navigation must produce a response').not.toBeNull();
  expect(response!.status()).toBe(200);

  const html = await page.content();
  expect(html.length, 'proxy must return non-trivial HTML').toBeGreaterThan(
    100
  );
  expect(html, 'must inject deployment-timestamp meta tag').toContain(
    'deployment-timestamp'
  );
});

/** Stable upstream — verifies the proxy actually renders content end-to-end. */
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
