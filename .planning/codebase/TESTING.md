# Testing Patterns

**Analysis Date:** 2026-04-30

## Test Framework

**Runner:**
- `@playwright/test` ^1.59.1 (devDependency in `package.json`).
- No unit-test runner is configured. There is no Jest, Vitest, Mocha, or `node:test` setup in the project.
- Two Playwright configs cover two deployment topologies:
  - `playwright.config.ts` — single-server "monolith" mode, tests under `tests/e2e/`.
  - `playwright.2-domains.config.ts` — two-server "shell + content" mode, tests under `tests/e2e-2-domains/`.

**Assertion Library:**
- Built-in `expect` from `@playwright/test` (web-first assertions like `toHaveText`, plus value matchers like `toBe`, `toBeGreaterThan`, `toContain`, `toBeTruthy`, `not.toBeNull`).

**Run Commands** (from `package.json` `scripts`):
```bash
npm run test:e2e                   # Monolith e2e against locally-launched server (port 3030)
npm run test:e2e:railway           # Monolith e2e against https://2pa.ms (Railway)
npm run test:e2e:2-domains         # Two-domain e2e against locally-launched shell+content
npm run test:e2e:2-domains:railway # Two-domain e2e against Railway shell + Railway content
npm test                           # Alias for `playwright test` (monolith e2e)
```

The `:railway` variants set `PLAYWRIGHT_BASE_URL` (or `PLAYWRIGHT_SHELL_URL` + `PLAYWRIGHT_CONTENT_URL`) so the same suite runs unmodified against the deployed environment.

## Test File Organization

**Location:** Separate top-level `tests/` directory (not co-located with source). Two parallel folders, one per topology:
- `tests/e2e/proxy-elpais.spec.ts`
- `tests/e2e-2-domains/two-domain-proxy.spec.ts`

**Naming:**
- `*.spec.ts` (Playwright's default test pattern). The "spec" suffix distinguishes them from `*.test.ts` (which is excluded from the TS build by `tsconfig.json` but unused in this project).

**Structure:**
```
tests/
├── e2e/
│   └── proxy-elpais.spec.ts        # Monolith mode: same origin proxies + serves
└── e2e-2-domains/
    └── two-domain-proxy.spec.ts     # Shell (3000) → 302 → Content (3001) topology
```

`tsconfig.json` excludes `**/*.test.ts` from the build but does not include the `tests/` tree at all (it's outside `rootDir: ./src`). Playwright runs them via its own `ts-node`-style loader.

## Playwright Configuration

**Shared options (both configs):**
- `fullyParallel: false`, `workers: 1` — tests run serially. The proxy is stateful (Highlight init, `app.listen`) and the suites are short, so parallelism is intentionally disabled.
- `forbidOnly: !!process.env['CI']` — `test.only` is rejected on CI.
- `retries: process.env['CI'] ? 2 : 0` — locally fail fast; on CI tolerate flakes.
- `reporter: [['list'], ['html', { open: 'never' }]]` — terminal list output plus an HTML report (not auto-opened).
- `use.trace: 'retain-on-failure'`, `use.screenshot: 'only-on-failure'` — diagnostics on red, nothing on green.
- `use.actionTimeout: 30_000`, `use.navigationTimeout: 60_000` — generous timeouts because the proxy fetches real upstream sites.
- Single project: `chromium` with `devices['Desktop Chrome']`.

**Monolith config (`playwright.config.ts`):**
- `testDir: './tests/e2e'`.
- Port: `PLAYWRIGHT_TEST_PORT` env var, default `3030`. **`3030` is intentional** — the developer runs an unrelated Nuxt project on `3000` locally, so the test server must not collide.
- `baseURL = process.env['PLAYWRIGHT_BASE_URL'] || `http://localhost:${TEST_PORT}``.
- `STARTS_OWN_SERVER = !process.env['PLAYWRIGHT_BASE_URL']` — only auto-starts a `webServer` when no external URL is targeted. Spreading the `webServer` block conditionally with `...(STARTS_OWN_SERVER && { webServer: {...} })` is the project's pattern for "don't launch a server when running against a deployed environment".
- `webServer.command: PORT=${TEST_PORT} npm run dev` — boots the Express app via `nodemon`.
- `webServer.url: http://localhost:${TEST_PORT}/health` — readiness probe hits the real `/health` endpoint defined in `src/index.ts`.
- `webServer.reuseExistingServer: !process.env['CI']` — locally piggybacks on an already-running dev server; CI always starts fresh.

**Two-domain config (`playwright.2-domains.config.ts`):**
- `testDir: './tests/e2e-2-domains'`.
- Two URLs from env, with `.local` hostname defaults:
  - `SHELL_URL` ← `PLAYWRIGHT_SHELL_URL` || `http://app.2pams.local:3000`.
  - `CONTENT_URL` ← `PLAYWRIGHT_CONTENT_URL` || `http://content.2pams-sandbox.local:3001`.
- `baseURL = SHELL_URL` (chromium project also pins `baseURL: SHELL_URL` and stores `CONTENT_URL` on `metadata.contentURL`).
- `STARTS_OWN_SERVERS = !process.env['PLAYWRIGHT_SHELL_URL']` gates a **two-element** `webServer` array:
  - `npm run dev:shell` (binds 3000, role=`shell`, points `CONTENT_ORIGIN` at the content host).
  - `npm run dev:content` (binds 3001, role=`content`).
- The `.local` hostnames require a hosts-file entry; the README documents this.

## Test Structure

**Suite organization:**
- Top-level `test('description', async ({ ... }) => { ... })` blocks. No `test.describe` grouping — each spec file is small enough that flat structure reads better.
- Test names describe **observable behavior**, not implementation: `'proxies the El País article URL (returns 200 HTML)'`, `'shell /http* redirects (302) to the content origin'`, `'content origin uses a different registrable domain than shell (eTLD+1)'`.

**Fixtures used (Playwright built-ins, no custom fixtures):**
- `{ page }` — for tests that need a real browser navigation (DOM assertions, redirect following).
- `{ request }` — for HTTP-level tests (status codes, headers, JSON bodies). Faster, no browser context.
- `{ baseURL }` — read from `use.baseURL`, used to build proxy URLs portably.

**Example pattern (from `tests/e2e/proxy-elpais.spec.ts`):**
```typescript
test('proxies example.com and renders visible content', async ({
  page,
  baseURL,
}) => {
  const response = await page.goto(`${baseURL}/https://example.com/`, {
    waitUntil: 'domcontentloaded',
  });
  expect(response!.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText(/example domain/i);
});
```

## Mocking

**Framework:** None.

**Strategy: zero mocking — true end-to-end.**
- Tests hit the real Express app over HTTP.
- The Express app issues real `fetch` calls to real upstream sites (`example.com`, `elpais.com`).
- DNS, network, and HTML parsing all run for real.

**What this means:**
- The example.com test asserts content (`h1` says "example domain") because example.com is a stable, anti-bot-free upstream.
- The El País test was deliberately **relaxed** to `status === 200` + `html.length > 100` + presence of the injected `deployment-timestamp` meta tag. Reason: El País uses **DataDome** which fingerprints datacenter egress, so when the suite runs from Railway IPs the proxy fetch returns a challenge page rather than the article. The test still proves the proxy itself worked end-to-end (200 + non-trivial HTML + our header injection); content-level assertions are pushed to the example.com test instead.
- The pattern when adding new tests: **prefer a stable upstream for content-level assertions**; if you must test against a hostile-to-datacenter site, assert proxy-level invariants (status, headers, body length, injected metadata) only.

**SSRF guard test:** Uses `127.0.0.1` as the proxied URL and asserts `403` — no mock, the real DNS lookup against `127.0.0.1` matches `BLOCKED_IP_PATTERNS` in `src/index.ts` and the handler short-circuits.

## Fixtures and Factories

**Test data:** Hardcoded URL constants at the top of each spec file:
```typescript
const ARTICLE =
  'https://elpais.com/economia/2026-04-29/el-bce-pide-a-la-banca-planes-de-contingencia-ante-el-nuevo-modelo-de-ia-de-anthropic.html';
```

The two-domain spec also hoists its own `SHELL_URL` / `CONTENT_URL` constants from env (mirroring the config) so individual tests can build absolute URLs against either origin.

**Location:** Inline. There is no shared `tests/fixtures/` or factory file.

## Coverage

**Requirements:** None enforced. No coverage tool is configured.

**View coverage:** Not applicable (no `c8`, no `istanbul`).

## Test Types

**Unit tests:** None. There are no `*.test.ts` files; `tsconfig.json` excludes that pattern but the project doesn't author them either.

**Integration tests:** None as a separate tier — integration is folded into e2e because the surface area (one Express app, a few helpers) is small enough that black-box e2e covers it.

**E2E tests:** All testing today. Two suites covering the two deployment topologies described above.

**Cross-environment runs:**
- The same spec files run against either `localhost` (auto-launched dev servers) or Railway (deployed) by varying env vars at the command line. No code changes needed to switch — the conditional `webServer` block + env-driven `baseURL` handles both.

## Common Patterns

**Async navigation with explicit wait:**
```typescript
const response = await page.goto(proxyUrl, { waitUntil: 'domcontentloaded' });
expect(response, 'navigation must produce a response').not.toBeNull();
expect(response!.status()).toBe(200);
```
Always pass `waitUntil: 'domcontentloaded'` rather than the default `'load'` — proxied pages may pull slow third-party assets that we don't care about for assertions.

**HTTP-level assertions without a browser:**
```typescript
test('shell /http* redirects (302) to the content origin', async ({
  request,
}) => {
  const res = await request.get(`${SHELL_URL}/https://example.com/`, {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(302);
  const location = res.headers()['location'];
  expect(location).toBe(`${CONTENT_URL}/https://example.com/`);
});
```
Use `request` (not `page`) when verifying redirect status — `page.goto` follows redirects transparently. `maxRedirects: 0` is required to observe the 302.

**Custom assertion messages:**
- Pass a string as the second arg to `expect(...)` to label assertions: `expect(response, 'navigation must produce a response').not.toBeNull();`. Used liberally throughout both spec files.

**Same-origin / different-origin checks:**
- The two-domain suite computes "registrable domain" inline (last two labels of the hostname) to assert eTLD+1 separation between shell and content. See `tests/e2e-2-domains/two-domain-proxy.spec.ts`.

## Browser Cache

- `PLAYWRIGHT_BROWSERS_PATH` is **not** pinned in any project file; the project uses whatever the surrounding environment provides.
- On this developer's machine, the Cursor sandbox sets `PLAYWRIGHT_BROWSERS_PATH` to a Cursor-managed cache path so browser binaries persist across sandboxed shell sessions. CI/Railway environments should rely on the default (`~/.cache/ms-playwright`) or set their own.
- If a test run reports "Executable doesn't exist", run `npx playwright install chromium` against the same `PLAYWRIGHT_BROWSERS_PATH` the test runner will see.

## Adding a New Test

1. Pick the topology: monolith → `tests/e2e/`, two-domain → `tests/e2e-2-domains/`.
2. Create `tests/<dir>/<scenario>.spec.ts`.
3. `import { test, expect } from '@playwright/test';`
4. Use `{ request }` for status/header/JSON checks, `{ page, baseURL }` for DOM assertions.
5. Prefer stable upstreams (`example.com`) for content assertions; assert only proxy-level invariants when targeting bot-protected sites.
6. Add explicit `expect` messages — they show up in the HTML report and help diagnose Railway-only failures where you can't attach a debugger.
7. Run locally with `npm run test:e2e` (or the `:2-domains` variant) before pushing; run against Railway with `npm run test:e2e:railway` to catch egress-IP-specific failures.

---

*Testing analysis: 2026-04-30*
