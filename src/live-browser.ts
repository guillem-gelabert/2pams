import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';

const VIEWPORT = { width: 1280, height: 900 };
const IDLE_MS = 2 * 60_000;
const LIFETIME_MS = 10 * 60_000;
const MAX_REQUESTS = 1500;

type SafeUrl = (url: URL) => Promise<boolean>;
type Session = {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  lastUsedAt: number;
  requestCount: number;
  framePromise: Promise<Buffer> | null;
  timer: ReturnType<typeof setInterval> | null;
};

let activeSession: Session | null = null;
let starting = false;

const LIVE_BROWSER_HOSTS = (process.env['LIVE_BROWSER_HOSTS'] || '')
  .split(',')
  .map(host => host.trim().toLowerCase())
  .filter(Boolean);

function matchesHost(hostname: string, hosts: string[]): boolean {
  return hosts.some(host => hostname === host || hostname.endsWith(`.${host}`));
}

export function shouldUseLiveBrowser(url: URL, role: string): boolean {
  return (
    role === 'content' &&
    url.protocol === 'https:' &&
    matchesHost(url.hostname.toLowerCase(), LIVE_BROWSER_HOSTS)
  );
}

function isAllowedNavigation(url: URL, articleHost: string): boolean {
  return (
    matchesHost(url.hostname.toLowerCase(), [
      articleHost,
      ...LIVE_BROWSER_HOSTS,
    ]) ||
    matchesHost(url.hostname.toLowerCase(), [
      'captcha-delivery.com',
      'datadome.co',
    ])
  );
}

function shouldBlockSubscriptionResource(
  url: URL,
  articleHost: string,
  resourceType: string
): boolean {
  if (
    !matchesHost(articleHost.toLowerCase(), ['elpais.com']) ||
    !['script', 'xhr', 'fetch'].includes(resourceType)
  ) {
    return false;
  }

  if (/\/arc\/subs\/p\.min\.js$/.test(url.pathname)) return true;
  if (
    matchesHost(url.hostname.toLowerCase(), ['prisa.com']) &&
    /^\/dist\/subs\/pmwall\/.+\/pmwall\.min\.js$/.test(url.pathname)
  ) {
    return true;
  }
  return (
    matchesHost(url.hostname.toLowerCase(), ['ampproject.org']) &&
    /^\/v0\/amp-access-.+\.js$/.test(url.pathname)
  );
}

async function closeSession(session: Session): Promise<void> {
  if (activeSession === session) activeSession = null;
  if (session.timer) clearInterval(session.timer);
  await session.browser.close().catch(() => undefined);
}

export async function closeLiveBrowser(): Promise<void> {
  if (activeSession) await closeSession(activeSession);
}

function getSession(id: string): Session | null {
  const session = activeSession;
  if (!session || session.id !== id) return null;
  const now = Date.now();
  if (
    now - session.lastUsedAt > IDLE_MS ||
    now - session.createdAt > LIFETIME_MS
  ) {
    void closeSession(session);
    return null;
  }
  session.lastUsedAt = now;
  return session;
}

function viewerHtml(id: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Live article · 2pa.ms</title>
<style>
html,body{margin:0;min-height:100%;background:#171717;color:#fff;font:14px system-ui,sans-serif}
header{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.6rem 1rem}
a{color:#dce9ff}main{display:grid;place-items:center}#screen{display:block;width:min(100%,1280px);height:auto;cursor:default;outline:none;touch-action:none}
#status{margin:1rem;color:#ddd}
</style>
</head>
<body>
<header><span>Live article</span><a id="restart" href="" aria-label="Start a new session">Reload</a></header>
<main><img id="screen" width="${VIEWPORT.width}" height="${VIEWPORT.height}" tabindex="0" alt="Interactive remote article"><p id="status">Connecting to the browser…</p></main>
<script>
(() => {
  const screen = document.getElementById('screen');
  const status = document.getElementById('status');
  const restart = document.getElementById('restart');
  const base = '/__live/${id}';
  let frameNumber = 0;
  let queue = Promise.resolve();
  let lastMove = 0;
  function refresh() { screen.src = base + '/frame?f=' + ++frameNumber; }
  screen.onload = () => { status.textContent = ''; setTimeout(refresh, 300); };
  screen.onerror = () => { status.textContent = 'Browser session ended. Reload to start again.'; };
  function point(event) {
    const rect = screen.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(${VIEWPORT.width}, (event.clientX - rect.left) * ${VIEWPORT.width} / rect.width)),
      y: Math.max(0, Math.min(${VIEWPORT.height}, (event.clientY - rect.top) * ${VIEWPORT.height} / rect.height))
    };
  }
  function send(input) {
    queue = queue.then(() => fetch(base + '/input', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(input)
    })).catch(() => { status.textContent = 'Connection lost. Reload to start again.'; });
  }
  screen.addEventListener('pointerdown', event => {
    event.preventDefault(); screen.focus(); screen.setPointerCapture(event.pointerId);
    send({type:'move', ...point(event)}); send({type:'down', button:event.button});
  });
  screen.addEventListener('pointerup', event => {
    event.preventDefault(); send({type:'up', button:event.button});
  });
  screen.addEventListener('pointermove', event => {
    if (!event.buttons && Date.now() - lastMove < 80) return;
    lastMove = Date.now(); send({type:'move', ...point(event)});
  });
  screen.addEventListener('wheel', event => {
    event.preventDefault(); send({type:'wheel', deltaX:event.deltaX, deltaY:event.deltaY});
  }, {passive:false});
  screen.addEventListener('keydown', event => { event.preventDefault(); send({type:'keyDown', key:event.key}); });
  screen.addEventListener('keyup', event => { event.preventDefault(); send({type:'keyUp', key:event.key}); });
  restart.addEventListener('click', async event => {
    event.preventDefault();
    await fetch(base + '/close', {method:'POST'}).catch(() => {});
    location.reload();
  });
  refresh();
})();
</script>
</body>
</html>`;
}

export async function startLiveBrowser(
  res: Response,
  articleUrl: URL,
  isSafeUrl: SafeUrl
): Promise<void> {
  if (activeSession || starting) {
    res.status(429).send('Live browser is busy. Try again shortly.');
    return;
  }
  starting = true;
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ channel: 'chromium', timeout: 10_000 });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    const page = await context.newPage();
    const session: Session = {
      id: randomUUID(),
      browser,
      context,
      page,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      requestCount: 0,
      framePromise: null,
      timer: null,
    };
    activeSession = session;
    session.timer = setInterval(() => {
      const now = Date.now();
      if (
        now - session.lastUsedAt > IDLE_MS ||
        now - session.createdAt > LIFETIME_MS
      ) {
        void closeSession(session);
      }
    }, 10_000);
    session.timer.unref();
    browser.on('disconnected', () => {
      if (activeSession === session) activeSession = null;
      if (session.timer) clearInterval(session.timer);
    });
    page.on('dialog', dialog => void dialog.dismiss().catch(() => undefined));
    page.on('popup', popup => void popup.close().catch(() => undefined));
    await context.route('**/*', async route => {
      session.requestCount++;
      if (session.requestCount > MAX_REQUESTS) {
        await route.abort();
        return;
      }
      let requestUrl: URL;
      try {
        requestUrl = new URL(route.request().url());
      } catch {
        await route.abort();
        return;
      }
      if (
        shouldBlockSubscriptionResource(
          requestUrl,
          articleUrl.hostname,
          route.request().resourceType()
        )
      ) {
        await route.abort();
        return;
      }
      if (
        !['http:', 'https:'].includes(requestUrl.protocol) ||
        !(await isSafeUrl(requestUrl)) ||
        (route.request().isNavigationRequest() &&
          route.request().frame() === page.mainFrame() &&
          !isAllowedNavigation(requestUrl, articleUrl.hostname))
      ) {
        await route.abort();
        return;
      }
      await route.continue();
    });
    await page
      .goto(articleUrl.href, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      })
      .catch(() => undefined);
    if (matchesHost(articleUrl.hostname.toLowerCase(), ['elpais.com'])) {
      await page
        .addStyleTag({
          content: 'div.ad-giga, aside.outbrain { display: none !important; }',
        })
        .catch(() => undefined);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(viewerHtml(session.id));
  } catch {
    if (browser) await browser.close().catch(() => undefined);
    activeSession = null;
    res.status(502).send('Live browser could not start');
  } finally {
    starting = false;
  }
}

function isSameOrigin(req: Request): boolean {
  const origin = req.get('Origin');
  if (!origin) return false;
  return origin === `${req.protocol}://${req.get('host')}`;
}

export function useLiveBrowserRoutes(app: Express): void {
  app.get('/__live/:id/frame', async (req: Request, res: Response) => {
    const session = getSession(req.params['id'] || '');
    if (!session) {
      res.sendStatus(410);
      return;
    }
    try {
      session.framePromise ||= session.page.screenshot({
        type: 'jpeg',
        quality: 70,
        timeout: 10_000,
      });
      const frame = await session.framePromise;
      res.setHeader('Cache-Control', 'no-store');
      res.type('jpeg').send(frame);
    } catch {
      res.sendStatus(502);
    } finally {
      session.framePromise = null;
    }
  });

  app.post('/__live/:id/input', async (req: Request, res: Response) => {
    const session = getSession(req.params['id'] || '');
    if (!session) {
      res.sendStatus(410);
      return;
    }
    if (!isSameOrigin(req)) {
      res.sendStatus(403);
      return;
    }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.sendStatus(400);
      return;
    }
    const input = req.body as Record<string, unknown>;
    const type = input['type'];
    try {
      if (type === 'move') {
        const x = input['x'];
        const y = input['y'];
        if (
          typeof x !== 'number' ||
          typeof y !== 'number' ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          x < 0 ||
          y < 0 ||
          x > VIEWPORT.width ||
          y > VIEWPORT.height
        ) {
          res.sendStatus(400);
          return;
        }
        await session.page.mouse.move(x, y);
      } else if (type === 'down' || type === 'up') {
        const button = input['button'] === 2 ? 'right' : 'left';
        if (type === 'down') await session.page.mouse.down({ button });
        else await session.page.mouse.up({ button });
      } else if (type === 'wheel') {
        const deltaX = input['deltaX'];
        const deltaY = input['deltaY'];
        if (
          typeof deltaX !== 'number' ||
          typeof deltaY !== 'number' ||
          !Number.isFinite(deltaX) ||
          !Number.isFinite(deltaY)
        ) {
          res.sendStatus(400);
          return;
        }
        await session.page.mouse.wheel(
          Math.max(-1000, Math.min(1000, deltaX)),
          Math.max(-1000, Math.min(1000, deltaY))
        );
      } else if (type === 'keyDown' || type === 'keyUp') {
        const key = input['key'];
        if (typeof key !== 'string' || key.length > 32 || !key) {
          res.sendStatus(400);
          return;
        }
        if (type === 'keyDown') await session.page.keyboard.down(key);
        else await session.page.keyboard.up(key);
      } else {
        res.sendStatus(400);
        return;
      }
      res.sendStatus(204);
    } catch {
      res.sendStatus(502);
    }
  });

  app.post('/__live/:id/close', async (req: Request, res: Response) => {
    const session = getSession(req.params['id'] || '');
    if (!session) {
      res.sendStatus(410);
      return;
    }
    if (!isSameOrigin(req)) {
      res.sendStatus(403);
      return;
    }
    await closeSession(session);
    res.sendStatus(204);
  });
}
