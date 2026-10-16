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

type Role = 'shell' | 'content' | 'monolith';

const SHELL_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'";

const CONTENT_CSP =
  "default-src https: data: blob: 'unsafe-inline' 'unsafe-eval'; img-src https: data: blob:; connect-src https:; worker-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/** Proxied scripts run first-party in the legacy monolith mode. */
const MONOLITH_CSP =
  "default-src https: data: blob: 'unsafe-inline' 'unsafe-eval'; img-src https: data: blob:; connect-src https:; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/**
 * Sets response headers. Mirrors Caddy when the app is exposed directly
 * (e.g. Railway has no Caddy in front).
 *
 * Enable on Railway (Railway sets `RAILWAY_PROJECT_ID`, etc.) or locally
 * with `APPLY_SECURITY_HEADERS=1`.
 */
export function useAppSecurityHeadersIfNeeded(app: Express, role: Role): void {
  if (!shouldApplyAppSecurityHeaders()) {
    return;
  }

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.set({
      ...BASE_HEADERS,
      'Content-Security-Policy':
        role === 'shell'
          ? SHELL_CSP
          : role === 'content'
            ? CONTENT_CSP
            : MONOLITH_CSP,
    });
    if (role !== 'monolith') res.setHeader('X-Frame-Options', 'DENY');
    if (role === 'shell') {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    }
    res.removeHeader('Server');
    next();
  });
}
