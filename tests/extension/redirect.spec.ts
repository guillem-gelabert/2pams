import { test, expect, chromium } from '@playwright/test';
import { createServer, Server } from 'node:http';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

async function listen(server: Server): Promise<number> {
  await new Promise<void>(resolveListen =>
    server.listen(0, '127.0.0.1', resolveListen)
  );
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  return address.port;
}

test('opens a controlled article as a top-level interactive page', async () => {
  let entryRequests = 0;
  const entryServer = createServer((req, res) => {
    if (req.url?.startsWith('/http://')) entryRequests++;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><p>Entry page</p>');
  });
  const entryPort = await listen(entryServer);
  const articleServer = createServer((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
    });
    res.end(
      '<!doctype html><button id="count">0</button>' +
        '<script>document.querySelector("button").onclick = event => {' +
        'event.target.textContent = Number(event.target.textContent) + 1}</script>'
    );
  });
  const articlePort = await listen(articleServer);
  const profileDir = await mkdtemp(join(tmpdir(), '2pams-redirect-test-'));
  const extensionDir = join(profileDir, 'extension');
  let context: Awaited<
    ReturnType<typeof chromium.launchPersistentContext>
  > | null = null;

  try {
    await cp(resolve('extension'), extensionDir, { recursive: true });
    const manifestPath = join(extensionDir, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      host_permissions: string[];
    };
    manifest.host_permissions = [
      'http://entry.test/*',
      'http://article.test/*',
    ];
    await writeFile(manifestPath, JSON.stringify(manifest));

    const rulesPath = join(extensionDir, 'rules.json');
    const rules = JSON.parse(await readFile(rulesPath, 'utf8')) as {
      action: { redirect: { regexSubstitution: string } };
      condition: { regexFilter: string };
    }[];
    rules[0]!.condition.regexFilter =
      '^http://entry\\.test:[0-9]+/http://article\\.test:[0-9]+(/.*)$';
    rules[0]!.action.redirect.regexSubstitution = `http://article.test:${articlePort}\\1`;
    await writeFile(rulesPath, JSON.stringify(rules));

    context = await chromium.launchPersistentContext(
      join(profileDir, 'profile'),
      {
        channel: 'chromium',
        headless: true,
        args: [
          `--disable-extensions-except=${extensionDir}`,
          `--load-extension=${extensionDir}`,
          '--no-proxy-server',
          '--host-resolver-rules=MAP entry.test 127.0.0.1, MAP article.test 127.0.0.1',
        ],
      }
    );
    const page = await context.newPage();
    await page.goto(
      `http://entry.test:${entryPort}/http://article.test:${articlePort}/story?view=map`
    );
    await expect(page).toHaveURL(
      `http://article.test:${articlePort}/story?view=map`
    );
    expect(entryRequests).toBe(0);
    const button = page.locator('#count');
    await expect(button).toHaveText('0');
    await button.click();
    await expect(button).toHaveText('1');

    await page.goto(`http://entry.test:${entryPort}/http://example.com/`);
    await expect(page.locator('p')).toHaveText('Entry page');
    expect(entryRequests).toBe(1);
  } finally {
    await context?.close();
    await Promise.all([
      new Promise<void>(resolveClose =>
        entryServer.close(() => resolveClose())
      ),
      new Promise<void>(resolveClose =>
        articleServer.close(() => resolveClose())
      ),
    ]);
    await rm(profileDir, { recursive: true, force: true });
  }
});
