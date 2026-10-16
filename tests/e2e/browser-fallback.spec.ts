import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';
import { renderChallengedPage } from '../../src/browser-fallback';

test('browser fallback keeps an upstream challenge cookie within one visit', async () => {
  const server = createServer((req, res) => {
    if (req.headers.cookie?.includes('verified=1')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        `<html><body><article>Controlled article. ${'Readable text. '.repeat(
          10
        )}</article></body></html>`
      );
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body>datadome captcha-delivery.com
      <script>document.cookie = 'verified=1'; location.reload()</script>
      </body></html>`);
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as AddressInfo;
    const url = new URL(`http://127.0.0.1:${address.port}/article`);
    const result = await renderChallengedPage(url, async () => true);
    expect(result?.html).toContain('Controlled article');
    expect(result?.url.href).toBe(url.href);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  }
});
