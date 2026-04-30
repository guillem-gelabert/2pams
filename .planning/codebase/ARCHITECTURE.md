# Architecture

**Analysis Date:** 2026-04-30

## Pattern Overview

**Overall:** Single Express application with role-based runtime behavior (deployable as 1, 2, or N processes from one binary).

The same compiled `dist/index.js` runs in three logical modes selected by the `ROLE` environment variable, implementing a cooperative two-domain (eTLD+1) separation security model:

- `ROLE` unset → **monolith**: single host serves both the landing UI and proxied HTML on the same origin (iframe-less, less isolated; legacy variant).
- `ROLE=shell` → **trusted UI host** (`https://2pa.ms`): only serves the static landing page, `/health`, and 302-redirects every `/http*` request to `${CONTENT_ORIGIN}${req.originalUrl}`. No proxied bytes ever transit this origin.
- `ROLE=content` → **untrusted sandbox host** (`https://2pams-content-production.up.railway.app`): runs the actual proxy on `/http*`. Cookies, `localStorage`, and Service Workers belonging to proxied pages are scoped to a different registrable domain than the shell, so the browser's same-site/origin policies prevent leakage into the trusted surface.

Implementation is deliberately small: two TypeScript files (`src/index.ts`, `src/security-headers.ts`) and a tiny static landing page in `public/index.html`.

**Key Characteristics:**
- Stateless single Node process per service; no database, no session store, no cache.
- Role-switched at boot via env var; no role-aware routing framework — a single `if (ROLE === 'shell')` branch in `app.get('/http*')`.
- Containment achieved by **browser-enforced origin separation** (different eTLD+1), not by sanitization.
- Two deployment topologies share the same image: Caddy-fronted self-hosted (Caddy applies headers + strips cookies on the wire) and Railway-fronted PaaS (Railway terminates TLS; the app applies the same headers itself).
- TypeScript strict mode (`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).

## Layers

The request pipeline is intentionally flat — Express middleware + one main route handler.

**Bootstrap & Configuration (`src/index.ts:1-51`):**
- Purpose: load `.env`, resolve `ROLE` and `CONTENT_ORIGIN`, init Highlight.io observability, enforce `ROLE=shell ⇒ CONTENT_ORIGIN required`.
- Location: `src/index.ts`
- Contains: `Role` type alias, env parsing, `H.init(highlightConfig)`, `app.set('trust proxy', 1)`.
- Depends on: `dotenv`, `@highlight-run/node`, `./security-headers`.

**Security Headers Middleware (`src/security-headers.ts`):**
- Purpose: apply per-role response headers (CSP, HSTS, COOP/CORP, Permissions-Policy, etc.) when the app is exposed without Caddy in front.
- Location: `src/security-headers.ts`
- Activation gate: `shouldApplyAppSecurityHeaders()` — true when `APPLY_SECURITY_HEADERS=1` or any of `RAILWAY_PROJECT_ID` / `RAILWAY_SERVICE_ID` / `RAILWAY_PUBLIC_DOMAIN` is present (`isRailwayRuntime()`).
- Header sets: `BASE_HEADERS` (always), plus one of `SHELL_CSP` (strict, `default-src 'self'`), `CONTENT_CSP` (permissive `unsafe-inline`/`unsafe-eval` but `worker-src 'none'`, `frame-ancestors 'none'`), or `MONOLITH_CSP` (like content but without `frame-ancestors 'none'`).
- Used by: registered once in `src/index.ts:38` via `useAppSecurityHeadersIfNeeded(app, ROLE)` before any route.

**Express Built-ins & Static Assets (`src/index.ts:153-156`):**
- Purpose: parse JSON/URL-encoded bodies, serve `public/` (landing page).
- `express.static('public')` exposes `public/index.html` (the URL form on `2pa.ms/`).

**Observability Middleware (`src/index.ts:156, 181`):**
- Purpose: Highlight.io request tracing and error capture.
- `Handlers.middleware(highlightConfig)` mounted before routes; `Handlers.errorHandler(highlightConfig)` mounted after.

**Routes (`src/index.ts:158-179`):**
- `GET /health` — liveness probe used by Railway (`railway.toml` healthcheckPath) and Playwright (`webServer.url`).
- `GET /http*` — single proxy entry point. Behavior branches on `ROLE`:
  - `shell` → `res.redirect(302, ${CONTENT_ORIGIN}${req.originalUrl})` (no upstream fetch).
  - `content` / `monolith` → `runProxy(res, p0, true)`.

**Proxy Core — `runProxy` (`src/index.ts:76-151`):**
- Purpose: SSRF-safe upstream fetch + minimal HTML rewrite + response hardening.
- Sequential pipeline:
  1. **URL parse** — `new URL(\`http${param0}\`)` (the `/http*` wildcard captures `s://example.com/...` so prepending `http` reconstructs the full URL). Returns 404 on parse failure.
  2. **SSRF guard** — `isSafeUrl(url)`: enforces `http:`/`https:` protocol, then `dns.lookup()` and rejects any address matching `BLOCKED_IP_PATTERNS` (loopback, RFC1918, link-local, ULA, IPv6 loopback). Returns 403 on failure.
  3. **Upstream fetch** — global `fetch()` with bot-flavored User-Agent and `redirect: 'manual'`. Network failure → 502.
  4. **Redirect refusal** — any `3xx` response from upstream → 403 (prevents hop-based SSRF bypass and chain-following).
  5. **HTML rewrite** — `node-html-parser` `parse(body)`:
     - Defense-in-depth: strip `javascript:` from `href`/`src`/`action`. **Intentionally does not strip `<script>` or `on*` handlers** — isolation comes from the cross-eTLD+1 origin, not the DOM.
     - Absolutize `<link rel="stylesheet">` `href` to `${url.origin}/...` (only stylesheets, not other assets).
     - Inject `<meta name="deployment-timestamp" content="${DEPLOYMENT_TIMESTAMP}">` into `<head>` for cache/version verification (asserted by the e2e tests).
  6. **Response hardening** — `res.removeHeader('Set-Cookie')` and `Cache-Control: no-store` so upstream cannot plant state on the proxy origin.

## Data Flow

**Two-domain (recommended) — `2pa.ms` shell + `2pams-content-production.up.railway.app` content:**

1. User loads `https://2pa.ms/` → `express.static` serves `public/index.html` (landing form).
2. User submits URL → form JS does `window.location.href = origin + '/' + url` → top-level navigation to `https://2pa.ms/https://example.com/`.
3. Shell process (`ROLE=shell`) hits `app.get('/http*')` → `res.redirect(302, '${CONTENT_ORIGIN}/https://example.com/')`. No proxied bytes ever touch the shell origin.
4. Browser follows the 302 to `https://2pams-content-production.up.railway.app/https://example.com/` (top-level navigation, distinct registrable domain).
5. Content process (`ROLE=content`) runs `runProxy`: SSRF check → upstream fetch → DOM rewrite → response with permissive `CONTENT_CSP` headers.
6. Browser renders the proxied page. Any cookies/`localStorage`/Service Workers it sets are scoped to `*.railway.app` (or whatever the content eTLD+1 is) and **cannot** read or write state on `2pa.ms`.

**Monolith (legacy / single-domain) — `ROLE` unset:**

1. User loads `/` → landing page → submits URL → navigates to `/${url}`.
2. Same process hits `/http*` → falls through to `runProxy(...)` directly (no redirect).
3. Response served on the same origin as the landing page. Proxied JS runs first-party — accepted trade-off documented in `docs/secure-javascript-proxy.md` and `src/index.ts:120-123`.

**Health check flow:**
- Railway and Playwright `webServer.url` poll `GET /health` → JSON `{ status, uptime, timestamp }`. Configured in `railway.toml:8-11` (`healthcheckPath = "/health"`, 30s timeout, `restartPolicyType = "ON_FAILURE"`).

**State Management:**
- None. The app holds no per-request state across the handler. `DEPLOYMENT_TIMESTAMP` is captured once at process start (`src/index.ts:41-42`) and embedded in proxied HTML for cache busting.
- No sessions, no cookies (explicitly stripped: `res.removeHeader('Set-Cookie')` + Caddy `request_header -Cookie` + `-Set-Cookie`).

## Key Abstractions

**`Role` type (`src/index.ts:22`, redeclared `src/security-headers.ts:20`):**
- Purpose: discriminated string union driving every behavioral switch in the codebase.
- Values: `'shell' | 'content' | 'monolith'`.
- Note: defined twice (not exported from `index.ts`); a future refactor would extract to a shared module.

**`runProxy(res, param0, log)` (`src/index.ts:76-151`):**
- Purpose: the entire upstream-fetch + rewrite + response pipeline as a single async function.
- Pure-ish: takes the Express `Response` and the wildcard tail; mutates `res` and returns `void`.
- Called only from the `/http*` route when `ROLE !== 'shell'`.

**`isSafeUrl(url)` (`src/index.ts:66-74`):**
- Purpose: SSRF gate. Resolves DNS once and rejects any private/loopback target.
- Pattern: deny-list of regexes (`BLOCKED_IP_PATTERNS`, `src/index.ts:54-64`) over the resolved IPv4/IPv6 string.
- Caveat: single `dns.lookup`; not protected against DNS-rebinding (the upstream `fetch` is a separate resolution). Documented in `docs/secure-javascript-proxy.md`.

**`useAppSecurityHeadersIfNeeded(app, role)` (`src/security-headers.ts:59-91`):**
- Purpose: register the per-role header middleware iff the app is the public-facing TLS edge (Railway) or the user opts in locally.
- Pattern: gated middleware factory — no-op when Caddy is in front.
- Side effect: also `res.removeHeader('Server')` to strip the Express banner (mirrors Caddy's `-Server`).

**Header constants (`src/security-headers.ts`):**
- `BASE_HEADERS` — HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (always applied when middleware is active).
- `SHELL_CSP` / `CONTENT_CSP` / `MONOLITH_CSP` — three CSPs encoded as constants. Values match `Caddyfile.dev`/`Caddyfile.prod` so the in-app and in-Caddy paths produce equivalent responses.

## Entry Points

**Application boot — `src/index.ts:183-188`:**
- `app.listen(process.env.PORT || 3000)` and logs role + content origin + health URL.
- `npm run start` → `node dist/index.js` (production after `tsc`).
- `npm run dev` → `nodemon src/index.ts` (ts-node; see `nodemon.json`).
- `npm run dev:shell` / `npm run dev:content` → preset env vars (`PORT=3000 ROLE=shell CONTENT_ORIGIN=...` / `PORT=3001 ROLE=content`); `npm run dev:2-domains` runs both concurrently via `concurrently`.

**HTTP entry points:**
- `GET /` → `public/index.html` (via `express.static('public')`, `src/index.ts:155`).
- `GET /health` → JSON liveness (`src/index.ts:158-164`).
- `GET /http*` → role-switched proxy or redirect (`src/index.ts:166-179`).

**Container / platform entry points:**
- Docker: `Dockerfile` final `CMD ["npm", "run", "start"]`; `EXPOSE 3000`. Railway uses this image directly (`railway.toml` `builder = "DOCKERFILE"`).
- Self-hosted: `docker-compose.dev.yml` brings up `app` (Node) + `caddy` (`caddy:2-alpine`) sharing `app-network`. Caddy listens on `:80`/`:443`, `reverse_proxy localhost:3000` (dev) or `app:${PORT:3000}` (prod).
- Caddy: `Caddyfile.dev` (`2pams.local` with `tls internal`) and `Caddyfile.prod` (`{$DOMAIN:localhost}` with auto-TLS).

## Caddy ↔ Railway Equivalence

The codebase encodes one identity: **whichever component owns the TLS edge applies the security headers**.

- **Self-hosted (Caddy in front):** Caddy applies CSP/HSTS/etc. (`Caddyfile.dev:5-12`, `Caddyfile.prod:4-14`) and strips `Cookie`/`Set-Cookie`. The Node app sets *no* security headers because `shouldApplyAppSecurityHeaders()` returns `false` (no Railway env vars, no `APPLY_SECURITY_HEADERS=1`).
- **Railway (no Caddy):** Railway terminates TLS but does not inject CSP. `isRailwayRuntime()` (`src/security-headers.ts:7-13`) detects `RAILWAY_PROJECT_ID` / `RAILWAY_SERVICE_ID` / `RAILWAY_PUBLIC_DOMAIN` and switches `useAppSecurityHeadersIfNeeded` on. The CSP/HSTS/etc. constants in `src/security-headers.ts` are intentionally byte-for-byte equivalent to the Caddyfile values.
- **Local prod-like test without Railway:** set `APPLY_SECURITY_HEADERS=1` in `.env` to force the app-level path (`src/security-headers.ts:16`).

`docs/railway.md:3-58` is the canonical narrative of this equivalence.

## Error Handling

**Strategy:** local try/catch with explicit HTTP status, no global error mapping. Express 4 default error handler is preserved at the tail by `Handlers.errorHandler(highlightConfig)` (`src/index.ts:181`).

**Patterns:**
- URL parse failure → `res.sendStatus(404)` (`src/index.ts:91-93`).
- SSRF rejection → `res.sendStatus(403)` (`src/index.ts:96-98`).
- Upstream network error → `res.sendStatus(502)` (`src/index.ts:107-109`).
- Upstream redirect → `res.sendStatus(403)` (`src/index.ts:112-114`).
- Missing `req.params[0]` on `/http*` → `res.sendStatus(404)` (`src/index.ts:166-170`).
- Boot-time misconfiguration (`ROLE=shell` without `CONTENT_ORIGIN`) → throws synchronously, process exits (`src/index.ts:32-34`).
- Highlight.io captures unhandled errors via its error-handler middleware.

**Logging:**
- `console.info` for boot banner (`src/index.ts:184-187`); ESLint warns on `no-console` so other call sites are intentional.
- `H.log('http', 'test')` from `runProxy` when `log === true` — currently every proxied request logs this stub; observability proper rides on Highlight middleware.
- Caddy emits structured JSON access logs to `/var/log/caddy/access.log` (`Caddyfile.dev:16-19`, `Caddyfile.prod:15-18`).

## Cross-Cutting Concerns

**Authentication:** None. The proxy is open. The threat model in `docs/secure-javascript-proxy.md` assumes anonymous abuse and relies on rate limiting at the edge (not implemented; called out as future work in section 5 of that doc).

**Validation:** Inline. URL validation is `new URL(...)` + `isSafeUrl`. There is no request-body validation framework (the proxy ignores body — only `GET` is routed) and no schema layer.

**Cookies:** Forcefully removed at two layers in self-hosted (Caddy `request_header -Cookie` + header `-Set-Cookie`) and at the app layer (`res.removeHeader('Set-Cookie')` in `runProxy`).

**Caching:** `Cache-Control: no-store` on every proxied response. No CDN. Static `public/index.html` uses Express's default static caching.

**Reverse-proxy trust:** `app.set('trust proxy', 1)` (`src/index.ts:37`) — required for both Caddy and Railway to surface the real client host/IP via `X-Forwarded-*`.

**Observability:** Highlight.io project `jdk55qvd`, service `2pa.ms` (hard-coded in `highlightConfig`, `src/index.ts:44-49`). Environment derived from `NODE_ENV`.

**Build pipeline:** `tsc` with `outDir: ./dist`, `rootDir: ./src`, declaration maps, source maps. `Dockerfile` runs `npm install` → `npm run build` → `npm run start`. `.github/workflows/docker-push.yml` publishes the image.

**Testing:** Playwright e2e only — no unit tests. Two configs:
- `playwright.config.ts` → `tests/e2e/proxy-elpais.spec.ts` (single-process: smoke + SSRF + health). Spawns its own server via `npm run dev` on `PORT=3030` unless `PLAYWRIGHT_BASE_URL` is set (e.g. `npm run test:e2e:railway`).
- `playwright.2-domains.config.ts` → `tests/e2e-2-domains/two-domain-proxy.spec.ts` (asserts the redirect chain, eTLD+1 separation, and content rendering on the content origin). Spawns both `npm run dev:shell` and `npm run dev:content` on `:3000`/`:3001` unless `PLAYWRIGHT_SHELL_URL`/`PLAYWRIGHT_CONTENT_URL` are set.

---

*Architecture analysis: 2026-04-30*
