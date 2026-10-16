import { chromium } from 'playwright';

type Role = 'shell' | 'content' | 'monolith';

let fallbackHosts: string[] | null = null;

function getFallbackHosts(): string[] {
  if (!fallbackHosts) {
    fallbackHosts = (process.env['BROWSER_FALLBACK_HOSTS'] || '')
      .split(',')
      .map(host => host.trim().toLowerCase())
      .filter(Boolean);
  }
  return fallbackHosts;
}

let browserBusy = false;

function isAllowedHost(hostname: string): boolean {
  return getFallbackHosts().some(
    host => hostname === host || hostname.endsWith(`.${host}`)
  );
}

function isAllowedBrowserResource(
  hostname: string,
  articleHost: string
): boolean {
  return (
    hostname === articleHost ||
    hostname.endsWith(`.${articleHost}`) ||
    isAllowedHost(hostname) ||
    hostname === 'captcha-delivery.com' ||
    hostname.endsWith('.captcha-delivery.com') ||
    hostname === 'datadome.co' ||
    hostname.endsWith('.datadome.co')
  );
}

export function isChallengePage(body: string): boolean {
  return (
    /captcha-delivery\.com/i.test(body) &&
    /datadome|please enable js and disable any ad blocker/i.test(body)
  );
}

/** Browser fallback is operator-enabled and only runs on the untrusted content service. */
export function shouldTryBrowserFallback(
  url: URL,
  status: number,
  body: string,
  role: Role
): boolean {
  return (
    role === 'content' &&
    isAllowedHost(url.hostname.toLowerCase()) &&
    (status === 403 || status === 200) &&
    isChallengePage(body)
  );
}

/** Render one upstream page in an isolated, short-lived browser context. */
export async function renderChallengedPage(
  url: URL,
  isSafeUrl: (url: URL) => Promise<boolean>
): Promise<{ html: string; url: URL } | null> {
  if (browserBusy) return null;
  browserBusy = true;

  try {
    const browser = await chromium.launch({
      channel: 'chromium',
      timeout: 10_000,
    });
    try {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      let requestCount = 0;
      await context.route('**/*', async route => {
        requestCount++;
        if (requestCount > 100) {
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
          !isAllowedBrowserResource(
            requestUrl.hostname.toLowerCase(),
            url.hostname.toLowerCase()
          ) ||
          !(await isSafeUrl(requestUrl))
        ) {
          await route.abort();
          return;
        }
        await route.continue();
      });

      const page = await context.newPage();
      page.on('dialog', dialog => void dialog.dismiss());
      let navigationStatus = 0;
      page.on('response', response => {
        if (
          response.request().isNavigationRequest() &&
          response.request().frame() === page.mainFrame()
        ) {
          navigationStatus = response.status();
        }
      });
      await page.goto(url.href, {
        waitUntil: 'domcontentloaded',
        timeout: 12_000,
      });
      let html = await page.content();
      for (let attempt = 0; attempt < 20 && isChallengePage(html); attempt++) {
        await page.waitForTimeout(500);
        html = await page.content();
      }

      const finalUrl = new URL(page.url());
      if (
        finalUrl.hostname !== url.hostname &&
        !isAllowedHost(finalUrl.hostname.toLowerCase())
      )
        return null;
      if (navigationStatus !== 200 || isChallengePage(html)) return null;
      const visibleText = (await page.locator('body').innerText()).trim();
      if (visibleText.length < 100) return null;
      return { html, url: finalUrl };
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  } finally {
    browserBusy = false;
  }
}
