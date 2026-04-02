import dns from 'dns/promises';
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { H, Handlers } from '@highlight-run/node';
import { parse } from 'node-html-parser';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env['PORT'] || 3000;

// Deployment timestamp: use env var if set during deployment, otherwise use server start time
const DEPLOYMENT_TIMESTAMP =
  process.env['DEPLOYMENT_TIMESTAMP'] || new Date().toISOString();

const highlightConfig = {
  projectID: 'jdk55qvd',
  serviceName: '2pa.ms',
  environment: process.env['NODE_ENV'] || 'development',
  serviceVersion: 'git-sha',
};

H.init(highlightConfig);

// Block private/internal IP ranges to prevent SSRF (Vuln 1)
const BLOCKED_IP_PATTERNS = [
  /^127\./, // loopback
  /^10\./, // RFC 1918
  /^192\.168\./, // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC 1918
  /^169\.254\./, // link-local / cloud metadata (AWS, GCP, Azure)
  /^0\./, // "this" network
  /^::1$/, // IPv6 loopback
  /^fc/i, // IPv6 unique local
  /^fd/i, // IPv6 unique local
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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(Handlers.middleware(highlightConfig));

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/http*', async (req: Request, res: Response) => {
  H.log('http', 'test');

  const headers = {
    'User-Agent':
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/80.0.345.0 Safari/537.36',
  };

  let url: URL;
  try {
    url = new URL(`http${req.params[0]}`);
  } catch (e) {
    return res.sendStatus(404);
  }

  // Block requests to private/internal hosts
  if (!(await isSafeUrl(url))) {
    return res.sendStatus(403);
  }

  // Disable redirect following to prevent SSRF via open redirects
  const site = await fetch(url.href, {
    headers,
    redirect: 'manual',
  });

  if (site.status >= 300 && site.status < 400) {
    return res.sendStatus(403);
  }

  const body = await site.text();

  const root = parse(body);

  // Strip scripts and inline event handlers to prevent XSS
  root.querySelectorAll('script').forEach(el => el.remove());
  root.querySelectorAll('*').forEach(el => {
    Object.keys(el.attributes).forEach(attr => {
      if (attr.startsWith('on')) el.removeAttribute(attr);
    });
    ['href', 'src', 'action'].forEach(attrName => {
      const val = el.getAttribute(attrName);
      if (val != null && /^\s*javascript:/i.test(val))
        el.removeAttribute(attrName);
    });
  });

  root.querySelectorAll('link[rel="stylesheet"]').forEach(stylesheet => {
    stylesheet.setAttribute(
      'href',
      `${url.origin}${stylesheet.getAttribute('href')}`
    );
  });

  // Inject deployment timestamp meta tag
  const head = root.querySelector('head');
  if (head) {
    const metaTagHtml = `<meta name="deployment-timestamp" content="${DEPLOYMENT_TIMESTAMP}">`;
    const metaTag = parse(metaTagHtml).querySelector('meta');
    if (metaTag) {
      head.appendChild(metaTag);
    }
  }

  return res.send(root.toString());
});

app.use(Handlers.errorHandler(highlightConfig));

// Start server
app.listen(PORT, () => {
  console.info(`🚀 Server is running on port ${PORT}`);
  console.info(`📝 Environment: ${process.env['NODE_ENV'] || 'development'}`);
  console.info(`🔗 Health check: http://localhost:${PORT}/health`);
});
