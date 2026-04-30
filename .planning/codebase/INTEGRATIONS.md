# External Integrations

**Analysis Date:** 2026-04-30

## APIs & External Services

**Observability:**
- **Highlight.io** (project ID `jdk55qvd`) — Error tracking and structured logging.
  - SDK: `@highlight-run/node` ^3.12.19.
  - Initialized in `src/index.ts:44-51` via `H.init(highlightConfig)`.
    - `serviceName: '2pa.ms'`
    - `environment: process.env['NODE_ENV'] || 'development'`
    - `serviceVersion: 'git-sha'` (placeholder; not wired to actual git SHA).
  - Express integration:
    - `app.use(Handlers.middleware(highlightConfig))` at `src/index.ts:156` (request instrumentation).
    - `app.use(Handlers.errorHandler(highlightConfig))` at `src/index.ts:181` (error capture).
  - Manual log call: `H.log('http', 'test')` inside `runProxy()` at `src/index.ts:81`.
  - Auth: project ID is hardcoded; no API key env var is read in code.

**Proxied Targets (Egress):**
- **Arbitrary HTTP(S) websites** — The whole purpose of the app.
  - Triggered by route `GET /http*` (`src/index.ts:166`); upstream URL reconstructed as `new URL("http" + req.params[0])`.
  - Upstream call: native `fetch(url.href, { headers, redirect: 'manual' })` at `src/index.ts:103-106`.
  - Outbound `User-Agent`: hardcoded bingbot string (`src/index.ts:84-86`) to bypass naive bot blockers.
  - Cookies are not forwarded (no inbound cookie reading; `Set-Cookie` is stripped from response at `src/index.ts:148`).
  - Redirects are *not* followed (`redirect: 'manual'`) — any 3xx response is returned to the client as `403`.
  - Tested against `elpais.com` and a second domain (see `tests/e2e/proxy-elpais.spec.ts`, `tests/e2e-2-domains/two-domain-proxy.spec.ts`).

**DNS:**
- **System resolver via `dns/promises`** — `dns.lookup(url.hostname)` at `src/index.ts:69`.
  - Used as SSRF guard inside `isSafeUrl()`: blocks resolved IPs matching private/loopback/link-local ranges (`127.*`, `10.*`, `192.168.*`, `172.16-31.*`, `169.254.*`, `0.*`, `::1`, `fc*`, `fd*`).
  - Failure to resolve → URL treated as unsafe (returns `403`).

## Data Storage

**Databases:**
- None. No DB client, ORM, or connection string is referenced anywhere in source. `.env.example` mentions `DATABASE_URL` only as a commented-out placeholder.

**File Storage:**
- Local filesystem only.
  - `public/` served via `express.static('public')` at `src/index.ts:155`.
  - Caddy access logs written to `/var/log/caddy/access.log` (volume `log:/var/log/caddy/` in `docker-compose.dev.yml` and `docker-compose.prod.yml`).

**Caching:**
- None at the application layer.
- Response header `Cache-Control: no-store` is set on every proxied response (`src/index.ts:149`) to prevent shared-cache pollution.

## Authentication & Identity

**Auth Provider:**
- None. The app is unauthenticated by design — it is an open URL proxy.
- No login, sessions, JWT, OAuth, or user model exists in the codebase.

## Monitoring & Observability

**Error Tracking:**
- Highlight.io (see above).

**Logs:**
- App: `console.info` only at startup (`src/index.ts:184-187`); request/error logs go through Highlight middleware.
- Caddy (self-hosted variants): JSON access logs to `/var/log/caddy/access.log` (`Caddyfile.dev`, `Caddyfile.prod`).
- GoAccess (self-hosted prod): real-time log analyzer reading Caddy logs, exposed on `127.0.0.1:8080` (`docker-compose.prod.yml`).

**Healthcheck:**
- `GET /health` at `src/index.ts:158-164` returns `{ status: 'OK', uptime, timestamp }`.
- Consumed by:
  - Railway deploy check (`railway.toml` → `healthcheckPath = "/health"`).
  - Playwright `webServer.url` for dev startup gating (`playwright.config.ts:25`, `playwright.2-domains.config.ts:30`).

## CI/CD & Deployment

**Hosting:**
- **Primary:** Railway, two services from the same Dockerfile, differentiated by `ROLE` env var:
  - `2pa.ms` — `ROLE=shell`, redirects `/http*` to content origin.
  - `2pams-content-production.up.railway.app` — `ROLE=content`, serves proxied HTML.
- **Self-hosted alt:** Docker + Caddy via `docker-compose.prod.yml` (also publishes GoAccess).

**CI Pipeline:**
- GitHub Actions: `.github/workflows/docker-push.yml` — On `push` to `main`, builds the Dockerfile and pushes `ghcr.io/${repo}:latest` using `GITHUB_TOKEN`.
- Uses `docker/setup-buildx-action@v3`, `docker/login-action@v3`, `docker/metadata-action@v5`, `docker/build-push-action@v5`.
- GHA cache (`type=gha`) for Docker layers.
- No automated test/lint job; CI is build+push only. Playwright tests are run locally.

**Container Registry:**
- GitHub Container Registry (`ghcr.io`) — image name `${{ github.repository }}`, tag `latest`.

## Environment Configuration

**Required env vars (per role):**
- All roles: `PORT` (default 3000), `NODE_ENV`.
- `ROLE=shell`: must also set `CONTENT_ORIGIN` (validated at startup, `src/index.ts:32-34`).
- `ROLE=content` / unset: no extra required vars.

**Optional env vars:**
- `DEPLOYMENT_TIMESTAMP` — Build-time stamp (set as Docker `ARG`/`ENV` in `Dockerfile`); falls back to `new Date().toISOString()` at boot.
- `APPLY_SECURITY_HEADERS=1` — Force app-level security headers when not on Railway.
- `DOMAIN` — Caddy `Caddyfile.prod` site address.
- `RAILWAY_PROJECT_ID` / `RAILWAY_SERVICE_ID` / `RAILWAY_PUBLIC_DOMAIN` — Auto-injected by Railway; auto-enables app-level security headers via `isRailwayRuntime()` in `src/security-headers.ts:7-13`.
- `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_SHELL_URL`, `PLAYWRIGHT_CONTENT_URL`, `PLAYWRIGHT_TEST_PORT` — Override test targets.

**Secrets location:**
- `.env` file at repo root (gitignored, present locally; `.env.example` documents shape).
- Railway: managed via Railway dashboard; injected into the runtime.
- GitHub Actions: only `secrets.GITHUB_TOKEN` (auto-provided) is used.
- No third-party API keys are required at runtime — Highlight uses only its public project ID.

## Webhooks & Callbacks

**Incoming:**
- None. The only public routes are `GET /health` and `GET /http*` (`src/index.ts:158`, `src/index.ts:166`).

**Outgoing:**
- None. No outbound webhook calls; all egress is the on-demand `fetch()` to user-supplied proxy targets.

---

*Integration audit: 2026-04-30*
