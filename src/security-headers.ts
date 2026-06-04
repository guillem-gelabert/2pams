import type { Express, NextFunction, Request, Response } from 'express';

const PERMISSIONS_POLICY =
  'geolocation=(), camera=(), microphone=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), midi=(), bluetooth=(), display-capture=(), notifications=(), interest-cohort=()';

/** True when running on Railway (see https://docs.railway.com/reference/variables). */
function isRailwayRuntime(): boolean {
  return Boolean(
    process.env['RAILWAY_PROJECT_ID'] ||
      process.env['RAILWAY_SERVICE_ID'] ||
      process.env['RAILWAY_PUBLIC_DOMAIN']
  );
}

function shouldApplyAppSecurityHeaders(): boolean {
  if (process.env['APPLY_SECURITY_HEADERS'] === '1') return true;
  return isRailwayRuntime();
}

/** Base headers applied on every response. */
const BASE_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': PERMISSIONS_POLICY,
} as const;

/**
 * Permissive CSP for the monolith — proxied sites need inline JS/CSS and
 * eval. Containment is NOT provided by CSP here; the proxied JS runs
 * first-party. Service workers are forbidden to prevent persistent takeover.
 */
const MONOLITH_CSP =
  "default-src https: data: blob: 'unsafe-inline' 'unsafe-eval'; img-src https: data: blob:; connect-src https:; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/**
 * Sets response headers. Mirrors Caddy when the app is exposed directly
 * (e.g. Railway has no Caddy in front).
 *
 * Enable on Railway (Railway sets `RAILWAY_PROJECT_ID`, etc.) or locally
 * with `APPLY_SECURITY_HEADERS=1`.
 */
export function useAppSecurityHeadersIfNeeded(app: Express): void {
  if (!shouldApplyAppSecurityHeaders()) {
    return;
  }

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.set({
      ...BASE_HEADERS,
      'Content-Security-Policy': MONOLITH_CSP,
    });
    res.removeHeader('Server');
    next();
  });
}
