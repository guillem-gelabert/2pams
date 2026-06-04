import dns from 'dns/promises';
import express, { Request, Response as ExpressResponse } from 'express';
import dotenv from 'dotenv';
import { H, Handlers } from '@highlight-run/node';
import { parse, HTMLElement as ParsedHTMLElement } from 'node-html-parser';
import { useAppSecurityHeadersIfNeeded } from './security-headers';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
useAppSecurityHeadersIfNeeded(app);
const PORT = process.env['PORT'] || 3000;

const DEPLOYMENT_TIMESTAMP =
  process.env['DEPLOYMENT_TIMESTAMP'] || new Date().toISOString();

const highlightConfig = {
  projectID: 'jdk55qvd',
  serviceName: '2pa.ms',
  environment: process.env['NODE_ENV'] || 'development',
  serviceVersion: 'git-sha',
};

H.init(highlightConfig);

// SSRF: block private/internal IP ranges
const BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc/i,
  /^fd/i,
];

async function isSafeUrl(url: URL): Promise<boolean> {
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  try {
    const { address } = await dns.lookup(url.hostname);
    return !BLOCKED_IP_PATTERNS.some(pattern => pattern.test(address));
  } catch {
    return false;
  }
}

async function runProxy(
  res: ExpressResponse,
  param0: string,
  log: boolean
): Promise<void> {
  if (log) H.log('http', 'test');

  const headers = {
    'User-Agent':
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/80.0.345.0 Safari/537.36',
  };

  let url: URL;
  try {
    url = new URL(`http${param0}`);
  } catch {
    res.sendStatus(404);
    return;
  }

  if (!(await isSafeUrl(url))) {
    res.sendStatus(403);
    return;
  }

  let site: Awaited<ReturnType<typeof fetch>>;
  try {
    site = await fetch(url.href, {
      headers,
      redirect: 'manual',
    });
  } catch {
    res.sendStatus(502);
    return;
  }

  if (site.status >= 300 && site.status < 400) {
    res.sendStatus(403);
    return;
  }

  const body = await site.text();
  const root = parse(body);

  // Resolve a single URL-valued attribute: strip javascript:, resolve relative
  // URLs against the upstream origin, leave absolute URLs unchanged.
  const resolveAttr = (el: ParsedHTMLElement, attrName: string): void => {
    const val = el.getAttribute(attrName);
    if (val == null) return;
    if (/^\s*javascript:/i.test(val)) {
      el.removeAttribute(attrName);
      return;
    }
    // Leave data:, blob:, and protocol-relative (//host) as-is.
    if (/^\s*(data:|blob:|\/\/)/i.test(val)) return;
    try {
      el.setAttribute(attrName, new URL(val.trim(), url.href).href);
    } catch {
      // Unparseable value — leave unchanged.
    }
  };

  // Resolve each URL token inside a srcset attribute.
  // Format: "<url> [descriptor], <url> [descriptor], ..."
  const resolveSrcset = (el: ParsedHTMLElement): void => {
    const val = el.getAttribute('srcset');
    if (val == null) return;
    const resolved = val
      .split(',')
      .map(entry => {
        const parts = entry.trim().split(/\s+/);
        const urlToken = parts[0];
        if (!urlToken) return entry;
        if (/^\s*(data:|blob:|\/\/)/i.test(urlToken)) return entry;
        try {
          const abs = new URL(urlToken.trim(), url.href).href;
          return [abs, ...parts.slice(1)].join(' ');
        } catch {
          return entry;
        }
      })
      .join(', ');
    el.setAttribute('srcset', resolved);
  };

  // NOTE: <script> and on* handlers are intentionally NOT stripped —
  // the user accepts reduced isolation and proxied JS runs first-party.
  root.querySelectorAll('*').forEach(el => {
    resolveAttr(el, 'src');
    resolveAttr(el, 'href');
    resolveAttr(el, 'action');
  });
  root.querySelectorAll('img, source').forEach(el => resolveSrcset(el));

  const head = root.querySelector('head');
  if (head) {
    const metaTagHtml = `<meta name="deployment-timestamp" content="${DEPLOYMENT_TIMESTAMP}">`;
    const metaTag = parse(metaTagHtml).querySelector('meta');
    if (metaTag) {
      head.appendChild(metaTag);
    }
  }

  res.removeHeader('Set-Cookie');
  res.setHeader('Cache-Control', 'no-store');
  res.send(root.toString());
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(Handlers.middleware(highlightConfig));

app.get('/health', (_req: Request, res: ExpressResponse) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/http*', async (req: Request, res: ExpressResponse) => {
  const p0 = req.params[0];
  if (p0 === undefined) {
    return res.sendStatus(404);
  }

  return runProxy(res, p0, true);
});

app.use(Handlers.errorHandler(highlightConfig));

app.listen(PORT, () => {
  console.info(`🚀 Server is running on port ${PORT}`);
  console.info(`📝 Environment: ${process.env['NODE_ENV'] || 'development'}`);
  console.info(`🔗 Health check: http://localhost:${PORT}/health`);
});
