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

test('relative URLs in proxied HTML are rewritten to upstream origin', async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/https://example.com/`, {
    waitUntil: 'domcontentloaded',
  });
  // Every src/href on the page must either be absolute (start with http/https/data/blob//)
  // or be absent — no bare relative paths should survive the rewriter.
  const relativeAttrs = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[src],[href],[action]'));
    return els.flatMap(el => {
      const results: string[] = [];
      for (const attr of ['src', 'href', 'action'] as const) {
        const val = el.getAttribute(attr);
        if (val && !/^(https?:|data:|blob:|\/\/|#|mailto:|tel:)/i.test(val)) {
          results.push(`${el.tagName}[${attr}]="${val}"`);
        }
      }
      return results;
    });
  });
  expect(
    relativeAttrs,
    'no relative URLs should remain after rewriting'
  ).toHaveLength(0);
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
