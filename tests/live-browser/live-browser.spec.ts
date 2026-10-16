import { test, expect, chromium } from '@playwright/test';
import express from 'express';
import { createServer, Server } from 'node:http';
import {
  closeLiveBrowser,
  startLiveBrowser,
  useLiveBrowserRoutes,
} from '../../src/live-browser';

async function listen(server: Server): Promise<number> {
  await new Promise<void>(resolveListen =>
    server.listen(0, '127.0.0.1', resolveListen)
  );
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  return address.port;
}

test('live browser forwards clicks without running article scripts in the viewer', async () => {
  let clicks = 0;
  const articleServer = createServer((req, res) => {
    if (req.url === '/clicked') {
      clicks++;
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      '<!doctype html><style>button{position:absolute;left:100px;top:100px;width:200px;height:80px}</style>' +
        '<button onclick="fetch(\'/clicked\')">Map control</button>'
    );
  });
  const articlePort = await listen(articleServer);
  const app = express();
  app.use(express.json());
  useLiveBrowserRoutes(app);
  app.get('/start', async (_req, res) => {
    await startLiveBrowser(
      res,
      new URL(`http://127.0.0.1:${articlePort}/`),
      async () => true
    );
  });
  const viewerServer = createServer(app);
  const viewerPort = await listen(viewerServer);
  const browser = await chromium.launch({ channel: 'chromium' });

  try {
    const page = await browser.newPage({
      viewport: { width: 1400, height: 1000 },
    });
    const viewerUrl = `http://127.0.0.1:${viewerPort}/start`;
    const response = await page.goto(viewerUrl);
    expect(response?.headers()['set-cookie']).toBeUndefined();
    const screen = page.locator('#screen');
    await expect
      .poll(() =>
        screen.evaluate(img => (img as { naturalWidth: number }).naturalWidth)
      )
      .toBe(1280);
    await screen.click({ position: { x: 150, y: 140 } });
    await expect.poll(() => clicks).toBe(1);
    await expect(page).toHaveURL(viewerUrl);

    const second = await page.request.get(viewerUrl);
    expect(second.status()).toBe(429);

    const frameSrc = await screen.getAttribute('src');
    if (!frameSrc) throw new Error('Viewer did not request a frame');
    const sessionPath = frameSrc.slice(0, frameSrc.indexOf('/frame'));
    const crossOriginInput = await page.request.post(
      `http://127.0.0.1:${viewerPort}${sessionPath}/input`,
      {
        headers: { Origin: 'https://another.example' },
        data: { type: 'move', x: 1, y: 1 },
      }
    );
    expect(crossOriginInput.status()).toBe(403);

    const close = await page.request.post(
      `http://127.0.0.1:${viewerPort}${sessionPath}/close`,
      { headers: { Origin: `http://127.0.0.1:${viewerPort}` } }
    );
    expect(close.status()).toBe(204);
    const restarted = await page.request.get(viewerUrl);
    expect(restarted.status()).toBe(200);
  } finally {
    await browser.close();
    await closeLiveBrowser();
    await Promise.all([
      new Promise<void>(resolveClose =>
        articleServer.close(() => resolveClose())
      ),
      new Promise<void>(resolveClose =>
        viewerServer.close(() => resolveClose())
      ),
    ]);
  }
});
