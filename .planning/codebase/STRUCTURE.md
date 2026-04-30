# Codebase Structure

**Analysis Date:** 2026-04-30

## Directory Layout

```
2pams/
├── src/                              # TypeScript source (compiled to dist/)
│   ├── index.ts                      # Express app, routing, runProxy, SSRF guard, boot
│   └── security-headers.ts           # Per-role CSP/HSTS/etc. middleware (Railway path)
├── dist/                             # tsc output (gitignored). Run target for `npm start`.
│   ├── index.js (+ .d.ts, .map)
│   └── security-headers.js (+ .d.ts, .map)
├── public/                           # Static assets served by express.static
│   └── index.html                    # Landing page with URL-input form
├── tests/                            # Playwright e2e specs (no unit tests)
│   ├── e2e/                          # Single-process / monolith specs
│   │   └── proxy-elpais.spec.ts
│   └── e2e-2-domains/                # Shell + content (2-domain) specs
│       └── two-domain-proxy.spec.ts
├── docs/                             # Operator-facing guides (linked from README)
│   ├── railway.md                    # Railway deploy walkthrough
│   └── secure-javascript-proxy.md    # Threat model, CSP rationale, sandbox design
├── configs/                          # Operator configs (not consumed by Node)
│   ├── certs/                        # (empty placeholder)
│   └── goaccess.vanilla.conf         # Log-analyzer config used by docker-compose.prod.yml
├── scripts/                          # (empty placeholder)
├── logs/                             # Local Caddy log mount (gitignored content)
├── .github/workflows/
│   └── docker-push.yml               # GHCR image publish workflow
├── .ai/                              # Repo-local AI context
│   └── AGENTS.md                     # Symlinked to AGENTS.md at repo root
├── .planning/codebase/               # GSD codebase analysis output (this file)
├── .cursor/, .claude/                # Per-tool config (lnai-managed; mostly gitignored)
├── Caddyfile.dev                     # Self-hosted dev TLS edge (`tls internal`)
├── Caddyfile.prod                    # Self-hosted prod TLS edge (auto-TLS via $DOMAIN)
├── Dockerfile                        # node:24-alpine; npm install → tsc → npm start
├── docker-compose.dev.yml            # Local stack: app + caddy
├── docker-compose.prod.yml           # VPS stack: app + caddy + goaccess
├── railway.toml                      # Railway config (DOCKERFILE builder, /health probe)
├── playwright.config.ts              # Single-process e2e config (port 3030)
├── playwright.2-domains.config.ts    # 2-domain e2e config (shell:3000, content:3001)
├── nodemon.json                      # ts-node dev runner (watch src/)
├── tsconfig.json                     # strict TS, ES2022, outDir=dist, rootDir=src
├── .eslintrc.js                      # eslint:recommended + prettier
├── .prettierrc                       # Format config
├── .env.example                      # Template (PORT, NODE_ENV, APPLY_SECURITY_HEADERS, ...)
├── package.json                      # Scripts, deps; entry main = dist/index.js
├── package-lock.json
├── README.md
└── AGENTS.md                         # → .ai/AGENTS.md (symlink)
```

## Directory Purposes

**`src/`:**
- Purpose: all TypeScript source. Two files only — the Express app and the role-aware security-headers middleware.
- Contains: `.ts` files (no subdirectories).
- Key files:
  - `src/index.ts` — entry point, bootstraps Express, declares the `Role` union, defines `isSafeUrl`, `runProxy`, the `/health` and `/http*` routes, and `app.listen`.
  - `src/security-headers.ts` — exports `useAppSecurityHeadersIfNeeded(app, role)`. Holds the `BASE_HEADERS`, `SHELL_CSP`, `CONTENT_CSP`, `MONOLITH_CSP` constants and the `isRailwayRuntime()` / `shouldApplyAppSecurityHeaders()` predicates.

**`dist/`:**
- Purpose: `tsc` compile output. **Do not edit.** Gitignored (`.gitignore:8`).
- Production runtime entry: `dist/index.js` (referenced by `package.json` `main` and `npm run start`).

**`public/`:**
- Purpose: static assets mounted at `/` by `express.static('public')` (`src/index.ts:155`).
- Currently a single file: `public/index.html` — minimal landing page with a URL form that does `window.location.href = origin + '/' + url` to navigate into the proxy.

**`tests/e2e/`:**
- Purpose: Playwright specs that exercise the **monolith / single-process** flow on one server.
- Loaded by `playwright.config.ts` (`testDir: './tests/e2e'`).
- Asserts: 200 HTML proxying, deployment-timestamp meta-tag injection, SSRF rejection (`/https://127.0.0.1/` → 403), `/health`.

**`tests/e2e-2-domains/`:**
- Purpose: Playwright specs that exercise the **shell + content** topology on two servers.
- Loaded by `playwright.2-domains.config.ts` (`testDir: './tests/e2e-2-domains'`).
- Asserts: 302 from shell to content, eTLD+1 difference, end-to-end navigation rendering on the content origin, URL preservation across redirect.

**`docs/`:**
- Purpose: operator/developer guides. Hand-written Markdown, linked from README. Not consumed by code.
- Files:
  - `docs/railway.md` — Railway deploy walkthrough; documents the Railway-env-var-triggered in-app security headers.
  - `docs/secure-javascript-proxy.md` — Threat model, CSP/COOP/CORP rationale, the historical iframe-sandbox design that preceded the 2-domain split.

**`configs/`:**
- Purpose: configs for sidecar services in `docker-compose.prod.yml`.
- `configs/goaccess.vanilla.conf` — referenced (indirectly via `goaccess.conf` mount in `docker-compose.prod.yml:39`) by the GoAccess container.
- `configs/certs/` — empty; reserved for self-hosted manual certs.

**`scripts/`:**
- Currently empty placeholder.

**`logs/`:**
- Purpose: bind-mount target for Caddy access logs in dev. Contents gitignored (`logs/` in `.gitignore:35`).

**`.github/workflows/`:**
- `docker-push.yml` — GitHub Actions workflow that builds and publishes the image to GHCR.

**`.planning/codebase/`:**
- GSD codebase mapper output (this directory). Read by `/gsd-plan-phase` and `/gsd-execute-phase`.

## Key File Locations

**Entry Points:**
- `src/index.ts` — Node application boot (`app.listen` at the bottom).
- `public/index.html` — user-facing landing page.
- `Dockerfile` — container build entry (`CMD ["npm", "run", "start"]`).
- `railway.toml` — Railway build/deploy entry; tells Railway to use `Dockerfile` and probe `/health`.
- `docker-compose.dev.yml` / `docker-compose.prod.yml` — self-hosted multi-service entry.

**Configuration:**
- `tsconfig.json` — TypeScript compiler options (strict, ES2022, `outDir: ./dist`).
- `.eslintrc.js` — ESLint rules (TS parser, prettier integration, `no-console: warn`).
- `.prettierrc` — Prettier formatting rules.
- `nodemon.json` — dev watcher (`watch: ["src"]`, `exec: "ts-node ./src/index.ts"`).
- `.env.example` — env var template; copy to `.env` (gitignored).
- `package.json` — npm scripts and dependency versions.

**Core Logic:**
- `src/index.ts:24-28` — `ROLE` parsing.
- `src/index.ts:32-34` — `ROLE=shell` boot-time guard for `CONTENT_ORIGIN`.
- `src/index.ts:54-74` — SSRF deny-list (`BLOCKED_IP_PATTERNS`) and `isSafeUrl`.
- `src/index.ts:76-151` — `runProxy` (the entire proxy pipeline).
- `src/index.ts:166-179` — the `/http*` route (role switch: 302 vs `runProxy`).
- `src/security-headers.ts:34-50` — the three CSP strings (shell/content/monolith).
- `src/security-headers.ts:59-91` — `useAppSecurityHeadersIfNeeded` middleware.

**Edge / TLS Configs:**
- `Caddyfile.dev` — local TLS via `tls internal` on `2pams.local`.
- `Caddyfile.prod` — production TLS via `{$DOMAIN}` with auto-HTTPS.

**Testing:**
- `playwright.config.ts` — single-process config; auto-spawns `npm run dev` on port 3030.
- `playwright.2-domains.config.ts` — two-server config; auto-spawns `npm run dev:shell` (3000) + `npm run dev:content` (3001).
- `tests/e2e/proxy-elpais.spec.ts` — monolith spec.
- `tests/e2e-2-domains/two-domain-proxy.spec.ts` — 2-domain spec.

## Naming Conventions

**Files:**
- Source: `kebab-case.ts` (e.g., `security-headers.ts`).
- Single-purpose entry kept as `index.ts`.
- Tests: `*.spec.ts` under `tests/e2e*` (matches Playwright default).
- Build artifacts: `*.js` + `*.d.ts` + `*.map` mirroring source filenames inside `dist/`.

**Directories:**
- Lowercase single words at the root (`src`, `tests`, `docs`, `public`, `configs`, `scripts`).
- Test subdirs describe topology, not feature: `e2e/` and `e2e-2-domains/`.

**Configuration files:**
- Tool dotfiles at root: `.eslintrc.js`, `.prettierrc`, `.env.example`, `.gitignore`, `.dockerignore`, `.npmrc`, `nodemon.json`, `tsconfig.json`.
- Caddy: `Caddyfile.{dev,prod}` (suffixed by environment).
- Compose: `docker-compose.{dev,prod}.yml` (suffixed by environment).
- Playwright: `playwright.config.ts` (default) and `playwright.2-domains.config.ts` (variant indicated by descriptive infix).

**Code identifiers (`src/index.ts`, `src/security-headers.ts`):**
- Types: `PascalCase` (`Role`).
- Functions: `camelCase` (`isSafeUrl`, `runProxy`, `useAppSecurityHeadersIfNeeded`, `isRailwayRuntime`, `shouldApplyAppSecurityHeaders`).
- Constants: `SCREAMING_SNAKE_CASE` for module-level config (`BLOCKED_IP_PATTERNS`, `BASE_HEADERS`, `SHELL_CSP`, `CONTENT_CSP`, `MONOLITH_CSP`, `PERMISSIONS_POLICY`, `DEPLOYMENT_TIMESTAMP`, `CONTENT_ORIGIN`, `PORT`, `ROLE`).
- Env access uses bracket notation (`process.env['ROLE']`) — required by `tsconfig.json` `noPropertyAccessFromIndexSignature: true`.

## Where to Add New Code

**New route or HTTP handler:**
- Add directly in `src/index.ts` next to the existing `/health` and `/http*` handlers. The codebase is intentionally flat — no `routes/` or `controllers/` directories. If the file grows past a comfortable size, the natural split is by *role* (e.g., `src/proxy.ts`) or by *concern* (e.g., `src/ssrf.ts`).

**New SSRF rule or proxy hardening:**
- Extend `BLOCKED_IP_PATTERNS` (`src/index.ts:54-64`) for new IP/hostname denies.
- Modify `isSafeUrl` (`src/index.ts:66-74`) for additional URL-shape checks.
- Modify the rewrite block inside `runProxy` (`src/index.ts:117-150`) for new HTML transforms. Keep the comment block at `src/index.ts:120-123` honest if you change which sanitization happens.

**New role or per-role behavior:**
1. Add the variant to the `Role` union in **both** `src/index.ts:22` and `src/security-headers.ts:20`.
2. Add a branch in the `ROLE` parser (`src/index.ts:24-28`).
3. Add a CSP constant + branch in `useAppSecurityHeadersIfNeeded` (`src/security-headers.ts:67-87`).
4. Add a branch in `app.get('/http*')` (`src/index.ts:166-179`).
5. Add a matching `npm run dev:<role>` script in `package.json:scripts`.

**New security header:**
- Edit `BASE_HEADERS` (always-applied) or one of the role-specific sets in `src/security-headers.ts:23-50`.
- **Mirror the change in both `Caddyfile.dev` and `Caddyfile.prod`** so the self-hosted edge stays equivalent to the in-app path.

**New environment variable:**
- Read via `process.env['NAME']` (bracket access required).
- Document in `.env.example`.
- If it gates Railway-only behavior, extend `isRailwayRuntime()` (`src/security-headers.ts:7-13`).
- If it must be present at boot, throw early like `src/index.ts:32-34`.

**New static asset:**
- Drop into `public/`. Served at the root path because of `app.use(express.static('public'))` (`src/index.ts:155`).

**New test:**
- Single-process / monolith assertion → new `tests/e2e/<name>.spec.ts`.
- Behaviour that requires the shell/content split → new `tests/e2e-2-domains/<name>.spec.ts`.
- Use `process.env['PLAYWRIGHT_BASE_URL']` (or `PLAYWRIGHT_SHELL_URL` / `PLAYWRIGHT_CONTENT_URL`) to retarget against deployed environments without code changes — see `package.json` scripts `test:e2e:railway` and `test:e2e:2-domains:railway`.

**New documentation:**
- Add to `docs/` as a Markdown file. Keep it linked from `README.md`. Operator-facing only — runtime code never reads `docs/`.

## Special Directories

**`dist/`:**
- Purpose: tsc compile output.
- Generated: yes (by `npm run build`).
- Committed: no (`.gitignore:8`).
- Used at runtime by `npm start` (`node dist/index.js`).

**`node_modules/`:**
- Purpose: npm dependency cache.
- Generated: yes (`npm install`).
- Committed: no.
- Replaced inside the Docker image by `RUN npm install` (`Dockerfile:13`).

**`logs/`:**
- Purpose: bind-mount for Caddy access logs in self-hosted mode.
- Generated: yes (Caddy at runtime).
- Committed contents: no (`logs/` in `.gitignore`).

**`test-results/`, `playwright-report/`, `blob-report/`:**
- Purpose: Playwright artifact output (screenshots, traces, HTML report).
- Generated: yes (by `playwright test`).
- Committed: no (`.gitignore:97-100`).

**`.planning/`:**
- Purpose: GSD workflow artifacts (codebase docs, phase plans, etc.).
- Generated: by GSD commands.
- Committed: usually yes (project-specific).

**`.ai/`, `.cursor/`, `.claude/`:**
- Purpose: per-tool agent config and rules. `AGENTS.md` at the root is a symlink to `.ai/AGENTS.md`.
- Several entries inside `.cursor/` and `.claude/` are managed by the lnai tool and gitignored (`.gitignore:103-110`).

**`Caddyfile/`:**
- Empty stub directory at the root (likely a stale artifact). Active Caddy configs are the **files** `Caddyfile.dev` and `Caddyfile.prod`, not this directory.

---

*Structure analysis: 2026-04-30*
