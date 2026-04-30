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

type Role = 'shell' | 'content' | 'monolith';

/** Base headers applied regardless of role. */
const BASE_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': PERMISSIONS_POLICY,
} as const;

/**
 * Strict CSP for the trusted shell — no third-party scripts, no framing,
 * no foreign form submissions. This origin only does redirects + landing.
 */
const SHELL_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'; upgrade-insecure-requests";

/**
 * Permissive CSP for the content (untrusted) origin — proxied sites need
 * inline JS/CSS and eval. Containment comes from the *origin separation*
 * (different eTLD+1), not from CSP. Still forbid:
 *   - service workers (no persistent takeover of the host)
 *   - framing this origin (no UI redress against the proxied page)
 *   - <object>/<base>/forms (legacy + exfil mitigations)
 */
const CONTENT_CSP =
  "default-src https: data: blob: 'unsafe-inline' 'unsafe-eval'; img-src https: data: blob:; connect-src https:; worker-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/** Iframe-less monolith: same as content but without frame-ancestors=none. */
const MONOLITH_CSP =
  "default-src https: data: blob: 'unsafe-inline' 'unsafe-eval'; img-src https: data: blob:; connect-src https:; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/**
 * Sets response headers per role. Mirrors Caddy when the app is exposed
 * directly (e.g. Railway has no Caddy in front).
 *
 * Enable on Railway (Railway sets `RAILWAY_PROJECT_ID`, etc.) or locally
 * with `APPLY_SECURITY_HEADERS=1`.
 */
export function useAppSecurityHeadersIfNeeded(
  app: Express,
  role: Role
): void {
  if (!shouldApplyAppSecurityHeaders()) {
    return;
  }

  app.use((_req: Request, res: Response, next: NextFunction) => {
    if (role === 'shell') {
      res.set({
        ...BASE_HEADERS,
        'Content-Security-Policy': SHELL_CSP,
        'X-Frame-Options': 'DENY',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
      });
    } else if (role === 'content') {
      res.set({
        ...BASE_HEADERS,
        'Content-Security-Policy': CONTENT_CSP,
        'X-Frame-Options': 'DENY',
      });
    } else {
      res.set({
        ...BASE_HEADERS,
        'Content-Security-Policy': MONOLITH_CSP,
      });
    }
    res.removeHeader('Server');
    next();
  });
}
