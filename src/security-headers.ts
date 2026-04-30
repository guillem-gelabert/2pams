import type { Express, NextFunction, Request, Response } from 'express';

/** Mirrors [Caddyfile.prod](../Caddyfile.prod) when the app is exposed directly (e.g. Railway has no Caddy). */
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

/**
 * Sets the same response headers Caddy adds.
 *
 * Single-profile (iframe-less) variant: proxied HTML is served first-party
 * from /http*, so we use a permissive CSP that lets real sites' inline/eval
 * JS run.
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
      'Content-Security-Policy':
        "default-src https: data: blob: 'unsafe-inline' 'unsafe-eval'; img-src https: data: blob:; connect-src https:; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
      'Strict-Transport-Security':
        'max-age=63072000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': PERMISSIONS_POLICY,
    });
    res.removeHeader('Server');
    next();
  });
}
