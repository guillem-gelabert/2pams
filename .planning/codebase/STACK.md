# Technology Stack

**Analysis Date:** 2026-04-30

## Languages

**Primary:**
- TypeScript ^5.3.3 — All app source under `src/` (`src/index.ts`, `src/security-headers.ts`); compiled to `dist/` via `tsc`.

**Secondary:**
- JavaScript (CommonJS) — Tooling configs only (`.eslintrc.js`, `nodemon.json`).
- HCL/INI-like — `railway.toml` (Railway deployment config).
- Caddyfile DSL — `Caddyfile.dev`, `Caddyfile.prod` (reverse-proxy configs for self-hosted variant).
- Dockerfile — `Dockerfile` (Node 24 alpine container).
- YAML — `docker-compose.dev.yml`, `docker-compose.prod.yml`, `.github/workflows/docker-push.yml`.

## Runtime

**Environment:**
- Node.js 24 (alpine) in production via `Dockerfile` (`FROM node:24-alpine`).
- `@types/node` ^20.10.0 — type definitions lag behind runtime; safe because runtime APIs used (`dns/promises`, global `fetch`, `URL`) exist on both.

**Package Manager:**
- npm — `package-lock.json` present (140 KB, committed).
- No `engines` field in `package.json`; Node version pinned only via Dockerfile base image.
- `.npmrc` present at repo root.

## Frameworks

**Core:**
- Express ^4.18.2 — HTTP server / routing in `src/index.ts`.
  - Single app entry: `app.get('/health', ...)` and `app.get('/http*', ...)`.
- TypeScript ^5.3.3 with `strict: true` — `tsconfig.json` enables `noImplicitAny`, `noImplicitReturns`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noUncheckedIndexedAccess`.

**Testing:**
- Playwright ^1.59.1 (`@playwright/test`) — End-to-end browser tests.
  - Two configs:
    - `playwright.config.ts` — single-domain (monolith) tests in `tests/e2e/`.
    - `playwright.2-domains.config.ts` — shell+content split tests in `tests/e2e-2-domains/`.
  - Project: `chromium` only (`devices['Desktop Chrome']`).
  - `fullyParallel: false`, `workers: 1` (sequential — proxied targets are real network calls).
  - Auto-starts dev server(s) when no `PLAYWRIGHT_BASE_URL` / `PLAYWRIGHT_SHELL_URL` provided.

**Build/Dev:**
- `tsc` (TypeScript compiler) — `npm run build` → emits to `dist/`.
- `ts-node` ^10.9.1 — runs TS directly via `nodemon` in dev (`nodemon.json` → `exec: ts-node ./src/index.ts`).
- `nodemon` ^3.0.2 — file watcher for dev (`watch: ['src']`, `ext: 'ts,json'`).
- `concurrently` ^9.2.1 — runs shell+content servers side-by-side via `npm run dev:2-domains`.

## Key Dependencies

**Critical:**
- `express` ^4.18.2 — HTTP server.
- `node-html-parser` ^7.0.1 — Server-side HTML parsing/rewriting in `src/index.ts`:
  - Strips `javascript:` pseudo-URLs from `href`/`src`/`action` attributes.
  - Rewrites relative `<link rel="stylesheet">` hrefs to absolute upstream origin.
  - Injects `<meta name="deployment-timestamp">` into `<head>`.
- `@highlight-run/node` ^3.12.19 — Observability/error tracking (initialized with `H.init`, mounted via `Handlers.middleware` and `Handlers.errorHandler`).
- `dotenv` ^16.3.1 — Loads `.env` at startup (`dotenv.config()` in `src/index.ts:8`).
- Native `fetch` (Node 18+) — Used for upstream proxy calls in `runProxy()` at `src/index.ts:103`.
- Native `dns/promises` — SSRF guard via `dns.lookup()` at `src/index.ts:69`.

**Infrastructure:**
- `@types/express` ^4.17.21 — Type defs for Express.
- `@types/node` ^20.10.0 — Type defs for Node stdlib.

## Configuration

**Environment:**
- Loaded by `dotenv.config()` in `src/index.ts`.
- `.env` file present (gitignored); `.env.example` documents shape.
- Key env vars (read in code or referenced in configs):
  - `PORT` — HTTP listen port (default `3000`).
  - `NODE_ENV` — `production` in Dockerfile, `development` in nodemon.
  - `ROLE` — `shell` | `content` | unset (monolith). Read in `src/index.ts:25`.
  - `CONTENT_ORIGIN` — Required when `ROLE=shell`; target origin for redirects.
  - `DEPLOYMENT_TIMESTAMP` — Baked into proxied pages as a `<meta>` tag; set at Docker build time via `ARG`.
  - `APPLY_SECURITY_HEADERS` — Force-enable app-level security headers (else auto-on when Railway env is detected).
  - `RAILWAY_PROJECT_ID` / `RAILWAY_SERVICE_ID` / `RAILWAY_PUBLIC_DOMAIN` — Auto-set by Railway; consumed by `isRailwayRuntime()` in `src/security-headers.ts:7`.
  - `DOMAIN` — Caddy `Caddyfile.prod` site address (substituted at Caddy startup).

**Build:**
- `tsconfig.json` — `target: ES2022`, `module: commonjs`, `outDir: ./dist`, `rootDir: ./src`, `declaration: true`, `sourceMap: true`.
- `.eslintrc.js` — Extends `eslint:recommended` + `prettier`; plugins `@typescript-eslint`, `prettier`.
- `.prettierrc` — `semi: true`, `singleQuote: true`, `trailingComma: 'es5'`, `printWidth: 80`, `tabWidth: 2`, `arrowParens: 'avoid'`, `endOfLine: 'lf'`.
- `nodemon.json` — Watches `src/`, ignores `*.test.ts`/`*.spec.ts`, runs via `ts-node`.

## Platform Requirements

**Development:**
- Node.js (any 18+ for native `fetch`; 24 to match prod).
- npm.
- For 2-domain dev: `/etc/hosts` entries for `app.2pams.local` and `content.2pams-sandbox.local` (referenced in `playwright.2-domains.config.ts`).
- Docker + docker-compose (optional, for local Caddy + app stack via `docker-compose.dev.yml`).

**Production:**
- **Primary:** Railway (Dockerfile builder per `railway.toml`).
  - Two services deployed: `2pa.ms` (`ROLE=shell`) and `2pams-content-production.up.railway.app` (`ROLE=content`).
  - Healthcheck path: `/health`, timeout 30s, restart `ON_FAILURE` (`railway.toml`).
- **Self-hosted alternative:** Docker + Caddy reverse proxy via `docker-compose.prod.yml` (Caddy on 80/443, app on internal 3000, GoAccess for log analysis on `127.0.0.1:8080`).
- Container images published to GHCR via `.github/workflows/docker-push.yml` on `main` push (tag `latest`).

---

*Stack analysis: 2026-04-30*
