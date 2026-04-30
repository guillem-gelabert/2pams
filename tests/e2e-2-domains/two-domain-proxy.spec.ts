import { test, expect } from '@playwright/test';

const SHELL_URL =
  process.env['PLAYWRIGHT_SHELL_URL'] || 'http://app.2pams.local:3000';
const CONTENT_URL =
  process.env['PLAYWRIGHT_CONTENT_URL'] ||
  'http://content.2pams-sandbox.local:3001';

const ARTICLE =
  'https://elpais.com/economia/2026-04-29/el-bce-pide-a-la-banca-planes-de-contingencia-ante-el-nuevo-modelo-de-ia-de-anthropic.html';

test('shell health endpoint responds OK', async ({ request }) => {
  const res = await request.get(`${SHELL_URL}/health`);
  expect(res.status()).toBe(200);
});

test('content health endpoint responds OK', async ({ request }) => {
  const res = await request.get(`${CONTENT_URL}/health`);
  expect(res.status()).toBe(200);
});

test('shell /http* redirects (302) to the content origin', async ({
  request,
}) => {
  const res = await request.get(`${SHELL_URL}/https://example.com/`, {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(302);
  const location = res.headers()['location'];
  expect(location, 'must redirect somewhere').toBeTruthy();
  expect(location).toBe(`${CONTENT_URL}/https://example.com/`);
});

test('shell → follows redirect → content renders proxied page on a different site', async ({
  page,
}) => {
  await page.goto(`${SHELL_URL}/https://example.com/`, {
    waitUntil: 'domcontentloaded',
  });
  expect(page.url()).toBe(`${CONTENT_URL}/https://example.com/`);

  const u = new URL(page.url());
  expect(u.host, 'must land on the content origin').toBe(
    new URL(CONTENT_URL).host
  );

  await expect(page.locator('h1')).toHaveText(/example domain/i);
});

test('content origin uses a different registrable domain than shell (eTLD+1)', () => {
  const reg = (host: string): string => {
    const parts = host.split('.');
    if (parts.length < 2) return host;
    return parts.slice(-2).join('.');
  };
  const shellReg = reg(new URL(SHELL_URL).hostname);
  const contentReg = reg(new URL(CONTENT_URL).hostname);
  expect(
    shellReg,
    'shell and content must be on different registrable domains'
  ).not.toBe(contentReg);
});

test('shell preserves the El País URL through the redirect chain', async ({
  page,
}) => {
  await page.goto(`${SHELL_URL}/${ARTICLE}`, {
    waitUntil: 'domcontentloaded',
  });
  // Land on content origin with the same proxy path
  expect(page.url()).toBe(`${CONTENT_URL}/${ARTICLE}`);
  expect(new URL(page.url()).host).toBe(new URL(CONTENT_URL).host);
});
