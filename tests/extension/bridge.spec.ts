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

test('frames a controlled live page despite upstream frame headers', async () => {
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
  const contentServer = createServer((_req, res) => {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    res.end(
      '<!doctype html><p>Upstream verification could not be completed</p>'
    );
  });
  const contentPort = await listen(contentServer);
  const profileDir = await mkdtemp(join(tmpdir(), '2pams-bridge-test-'));
  const extensionDir = join(profileDir, 'extension');
  let context: Awaited<
    ReturnType<typeof chromium.launchPersistentContext>
  > | null = null;

  try {
    await cp(resolve('extension'), extensionDir, { recursive: true });
    const manifestPath = join(extensionDir, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      host_permissions: string[];
      content_scripts: { matches: string[] }[];
    };
    manifest.host_permissions = [
      'http://content.test/*',
      'http://article.test/*',
      'http://other.test/*',
    ];
    manifest.content_scripts[0]!.matches = ['http://content.test/*'];
    await writeFile(manifestPath, JSON.stringify(manifest));

    const rulesPath = join(extensionDir, 'rules.json');
    const rules = JSON.parse(await readFile(rulesPath, 'utf8')) as {
      condition: { initiatorDomains: string[]; requestDomains: string[] };
    }[];
    rules[0]!.condition.initiatorDomains = ['content.test'];
    rules[0]!.condition.requestDomains = ['article.test'];
    await writeFile(rulesPath, JSON.stringify(rules));

    const bridgePath = join(extensionDir, 'bridge.js');
    const bridge = (await readFile(bridgePath, 'utf8'))
      .replaceAll('https://', 'http://')
      .replaceAll("'https:'", "'http:'")
      .replaceAll('elpais.com', 'article.test');
    await writeFile(bridgePath, bridge);

    context = await chromium.launchPersistentContext(
      join(profileDir, 'profile'),
      {
        channel: 'chromium',
        headless: true,
        args: [
          `--disable-extensions-except=${extensionDir}`,
          `--load-extension=${extensionDir}`,
          '--no-proxy-server',
          '--host-resolver-rules=MAP content.test 127.0.0.1, MAP article.test 127.0.0.1, MAP other.test 127.0.0.1',
        ],
      }
    );
    const page = await context.newPage();
    await page.goto(
      `http://content.test:${contentPort}/http://article.test:${articlePort}/story`
    );
    const button = page.frameLocator('iframe').locator('#count');
    await expect(button).toHaveText('0');
    await button.click();
    await expect(button).toHaveText('1');
    expect(page.url()).toContain(`content.test:${contentPort}`);

    await page.goto(`http://other.test:${contentPort}/`);
    await page.setContent(
      `<iframe src="http://article.test:${articlePort}/story"></iframe>`
    );
    await expect(page.frameLocator('iframe').locator('#count')).toHaveCount(0);
  } finally {
    await context?.close();
    await Promise.all([
      new Promise<void>(resolveClose =>
        articleServer.close(() => resolveClose())
      ),
      new Promise<void>(resolveClose =>
        contentServer.close(() => resolveClose())
      ),
    ]);
    await rm(profileDir, { recursive: true, force: true });
  }
});
