# Codebase Concerns

**Analysis Date:** 2026-04-30

This audit covers the brownfield 2pams URL proxy with three deployment roles (`shell`, `content`, `monolith`) defined in `src/index.ts` and headers in `src/security-headers.ts`. Production today uses a 2-domain split: shell at `2pa.ms` redirects to content at `2pams-content-production.up.railway.app`. Concerns are grouped by severity and each is anchored to a file path.

---

## Tech Debt

### 1. SSRF guard is TOCTOU and has IPv6 coverage gaps

- Issue: `isSafeUrl()` resolves the hostname once with `dns.lookup()`, then `fetch()` performs its own resolution later. Between the two lookups the DNS answer can change (rebinding) or differ from the first record returned. `dns.lookup()` also returns only one address by default — a multi-A record with a public + private mix can pass the check on one address while `fetch()` ends up using another.
- Files: `src/index.ts:53` (`BLOCKED_IP_PATTERNS`), `src/index.ts:66` (`isSafeUrl`), `src/index.ts:103` (`fetch(url.href, …)`).
- IPv6 patterns missing:
  - `fe80::/10` link-local (regex only matches `^fc/i`, `^fd/i`, `^::1$`).
  - `::ffff:0:0/96` IPv4-mapped (a remote host can encode `::ffff:127.0.0.1`).
  - `ff00::/8` multicast and `::/128` unspecified.
  - `100.64.0.0/10` CGNAT (sometimes worth blocking on shared infra).
- Impact: Server-side fetches to internal services on the deploy host (cloud metadata endpoints, container sidecars).
- Fix approach:
  1. Resolve with `dns.lookup(host, { all: true })` and reject if **any** address matches a blocklist.
  2. Re-check the IP that `fetch()` actually connects to. The cleanest way is a custom `Agent`/`lookup` hook that pins the connection to the address you validated, avoiding the rebinding window altogether (e.g. `undici.Agent({ connect: { lookup: validatedLookup } })`).
  3. Expand the regex set to include the IPv6 ranges above.

### 2. `redirect: 'manual'` returns 403 for any 3xx upstream

- Issue: `if (site.status >= 300 && site.status < 400) res.sendStatus(403);` — every upstream redirect (trailing slash normalisation, http→https, marketing campaign URLs) is rejected.
- Files: `src/index.ts:103-115`.
- Impact: A large fraction of real-world URLs are unproxyable.
- Fix approach: Either (a) follow redirects manually after re-running the SSRF guard on each `Location`, or (b) emit a 302 back to the client pointing at the proxied form of the new URL (`${baseUrl}/${nextUrl.href}`). Option (b) keeps redirect handling on the browser and avoids per-hop SSRF expansion.

### 3. User-Agent hardcoded as Bingbot

- Issue: Every upstream request advertises `Mozilla/5.0 …; bingbot/2.0; …`.
- Files: `src/index.ts:84-86`.
- Impact: (1) Many upstreams serve different (often pre-rendered, unauthenticated) content to Bingbot; behaviour is non-uniform and fragile. (2) Several sites' ToS prohibit UA spoofing for non-search-engine crawlers; the IP/UA mismatch is trivially detectable. (3) Bingbot-specific behaviour (e.g. paywalls bypassed) can be revoked unilaterally by upstream.
- Fix approach: Use a project-specific UA (e.g. `2pams/<version> (+https://2pa.ms)`); add an opt-in `?ua=googlebot` for users who knowingly want crawler-mode rendering.

### 4. No application-level rate limiting

- Issue: There is no `express-rate-limit` (or equivalent) middleware. Every `/http*` request triggers a DNS lookup, an outbound fetch, and HTML parsing.
- Files: `src/index.ts` (no rate-limit middleware registered).
- Impact: A single client can use the deploy as a high-volume scraper or DoS amplifier; abuse mitigation depends entirely on Railway's edge or Caddy in self-host mode.
- Fix approach: Add a lightweight per-IP limiter on `/http*` (e.g. 60/min). Because `app.set('trust proxy', 1)` is already on, `req.ip` will reflect the X-Forwarded-For-derived address — verify Railway and Caddy override that header end-to-end before relying on it.

### 5. Stylesheet href rewriting only handles relative paths

- Issue: `stylesheet.setAttribute('href', `${url.origin}${stylesheet.getAttribute('href')}`)` is naive string concatenation, not URL resolution.
- Files: `src/index.ts:132-137`.
- Impact:
  - Protocol-relative `//cdn.example.com/style.css` becomes `https://upstream.com//cdn.example.com/style.css` (broken).
  - Absolute `https://other.cdn/style.css` becomes `https://upstream.comhttps://other.cdn/style.css` (broken).
  - Relative `style.css` (no leading `/`) becomes `https://upstream.comstyle.css` (broken).
- Fix approach: Use `new URL(href, url).href`; this handles relative, protocol-relative, and absolute correctly.

### 6. Only `<link rel=stylesheet>` is rewritten — other URL-bearing tags are left alone

- Issue: The proxy injects `url.origin` only on stylesheet hrefs. `<script src>`, `<img src>`, `<iframe src>`, `<a href>`, `<form action>`, `<source srcset>`, `<link rel=preload|prefetch|icon>` etc. are not rewritten at all.
- Files: `src/index.ts:124-137`.
- Impact: (1) Relative anchors do not navigate back through the proxy — clicking a link on a proxied page leaves the proxy. (2) Relative scripts/images load from the wrong origin — they hit the proxy's own host and 404. (3) Most "is this proxy useful for browsing" UX is broken by this alone.
- Fix approach: Walk each tag with a known URL attribute and rewrite via `new URL(value, url)`. For navigation links, prepend `${baseUrl}/${absUrl}` so clicks stay inside the proxy.

### 7. `deployment-timestamp` meta tag leaks env to clients

- Issue: `<meta name="deployment-timestamp" content="${DEPLOYMENT_TIMESTAMP}">` is appended to every proxied `<head>`.
- Files: `src/index.ts:41-42`, `src/index.ts:140-146`.
- Impact: Intentional today, but worth tracking — if `DEPLOYMENT_TIMESTAMP` is ever bound to a build-id, commit SHA, or sensitive identifier, that value lands in every response.
- Fix approach: Document the contract that this var must remain a coarse timestamp; consider gating injection behind `NODE_ENV !== 'production'` or moving it to a `Server-Timing`/response header instead of HTML.

### 8. `app.set('trust proxy', 1)` is unconditional

- Issue: Trusting the first `X-Forwarded-For` hop is correct behind Caddy/Railway, but the app does not detect that runtime.
- Files: `src/index.ts:37`.
- Impact: If the app is ever exposed without an upstream proxy (raw `npm start` to the open internet, or a misconfigured port-forward), clients can spoof `X-Forwarded-For` and bypass any IP-based logic added later (rate limiting, allow-lists).
- Fix approach: Gate on the same signal `useAppSecurityHeadersIfNeeded` already uses (`isRailwayRuntime()` + `APPLY_SECURITY_HEADERS=1`) so the trust setting only flips on when an upstream is known to exist.

### 9. Highlight.io project ID is hardcoded

- Issue: `projectID: 'jdk55qvd'` is checked into source.
- Files: `src/index.ts:44-49`.
- Impact: Forks send telemetry to the original project; you cannot rotate the project without a code change; the value is mildly sensitive (allows sending arbitrary log volume).
- Fix approach: Read from `process.env['HIGHLIGHT_PROJECT_ID']` and skip `H.init()` when unset.

### 10. Body parsers registered on a GET-only proxy

- Issue: `app.use(express.json())` and `app.use(express.urlencoded({ extended: true }))` are registered, but the only routes are `/health` and `/http*` (both GET).
- Files: `src/index.ts:153-154`.
- Impact: Wasted parse cost and an unnecessary attack surface (malformed JSON rejection paths) on every request.
- Fix approach: Remove both `app.use` calls until a route actually consumes a body.

---

## Known Bugs

### B1. `docker-compose.dev.yml` mounts source over the image's `node_modules`

- Symptoms: After running `npm install` on the host, the container can run with stale dependencies; conversely, after a clean `docker compose build`, the host's `node_modules` overwrite the image's freshly built copy.
- Files: `docker-compose.dev.yml:9-11` (`.:/app` then `/app/node_modules` anonymous volume).
- Trigger: Any time `package.json` changes are applied on one side but not the other.
- Workaround: `docker compose down -v` to wipe the anonymous volume, then rebuild. Long-term fix: install dependencies inside the container only (move `npm install` into the entrypoint, or mount source under `/app/src` only and keep `/app/node_modules` purely image-backed).

### B2. `docker-compose.prod.yml` references a missing `goaccess.conf`

- Symptoms: `docker compose -f docker-compose.prod.yml up` will fail to start the `goaccess` service because the bind mount source is missing.
- Files: `docker-compose.prod.yml:39` (`./goaccess.conf:/etc/goaccess/goaccess.conf:ro`); the file does not exist in the repo.
- Trigger: Anyone attempting the legacy VPS-style deploy described in `README.md`.
- Workaround: Either commit a `goaccess.conf` (the original config used before Railway), or — preferably, given that prod is on Railway — drop the `goaccess` service and the `Caddyfile.prod` block alongside it.

### B3. The landing form is served on the content origin too

- Symptoms: `app.use(express.static('public'))` is registered before the role check, so `public/index.html` is served on **both** shell and content origins. The form's submit handler does `window.location.href = window.location.origin + '/' + value`, so a user landing on the content domain (bookmark, search-engine result, share link) submits a URL directly to the content origin and never passes through the shell redirect.
- Files: `src/index.ts:155`, `public/index.html:117`.
- Trigger: Any direct visit to `https://2pams-content-production.up.railway.app/`.
- Impact: Functional only — the proxy still works — but the security model is shell-first; the content origin is supposed to be a sandbox the user is *redirected into*, not a destination they bookmark and submit forms on.
- Fix approach: Make `express.static('public')` and the form route conditional on `ROLE !== 'content'`. Have the content role respond `404` on `/` and `redirect 302 → SHELL_HOST` on the form path.

### B4. ESLint/Prettier are failing on the working tree

- Symptoms: `npm run lint` exits 1 with **4 errors** and **4 warnings** (not 3 — `console.info` appears on lines 184, 185, 186, **and** 187 of `src/index.ts`).
- Files: `src/index.ts:184-187` (no-console x4), `src/security-headers.ts:10-11`, `src/security-headers.ts:59` (Prettier), `src/index.ts:186` (Prettier).
- Trigger: Running `npm run lint` on the current uncommitted state.
- Workaround: `npm run lint:fix && npm run format` cleans the Prettier errors immediately. The 4 `no-console` warnings are intentional startup logs — either downgrade with an `eslint-disable-next-line` comment per line, or migrate to a structured logger (`pino` is the lightest option compatible with Highlight).

---

## Security Considerations

### S1. Monolith mode runs proxied JS as first-party (`<script>` and `on*` not stripped)

- Risk: When `ROLE` is unset (or any value other than `shell`/`content`), `/http*` serves proxied HTML directly from the same origin as the landing UI. Inline `<script>` and `on*` event handlers from upstream execute first-party on that origin. If the deploy ever introduces cookies, `localStorage` data, or a Service Worker, every proxied page can read/write/install them.
- Files: `src/index.ts:24-28` (default to `'monolith'`), `src/index.ts:120-130` (intentional comment that `<script>` and `on*` are NOT stripped), `src/security-headers.ts:48-50` (`MONOLITH_CSP` permits `'unsafe-inline'`/`'unsafe-eval'`).
- Current mitigation: Production runs `ROLE=shell` + `ROLE=content` on different eTLD+1, so the content origin is a separate browser security principal. The monolith path is unused in prod.
- Recommendations:
  1. Remove the `monolith` default and make `ROLE` required (`throw` if unset). This eliminates a foot-gun and dead surface area.
  2. If monolith must stay for local-dev convenience, gate it on `NODE_ENV !== 'production'` so a misconfigured Railway deploy can't silently fall back to it.

### S2. Upstream `Content-Type` is not validated before HTML parsing

- Risk: `parse(body)` runs on whatever `site.text()` returns — JSON, XML, RSS, plain text, even binary text-decoded blobs. The `<meta name="deployment-timestamp">` injection succeeds only if a `<head>` exists, but `res.send(root.toString())` will happily ship malformed/garbled output to the browser as `text/html` (Express's default for `.send(string)`).
- Files: `src/index.ts:117-150`.
- Current mitigation: None.
- Recommendations: Branch on `site.headers.get('content-type')`. For non-`text/html` responses, stream the body through unchanged with the original `Content-Type` and skip parsing/injection.

### S3. No body-size cap on the upstream response

- Risk: `await site.text()` buffers the entire upstream document into memory. A hostile or merely large upstream (a 1 GB log dump, a misconfigured JSON-Lines feed) crashes the worker via OOM.
- Files: `src/index.ts:117`.
- Recommendations: Set a hard limit (a few MB) by reading from `site.body` as a stream and aborting once the byte count is exceeded.

### S4. No timeout on the upstream `fetch`

- Risk: A slow-loris upstream holds the request open indefinitely. With Node's default agent and no concurrency cap, a handful of slow URLs can saturate the event loop and starve `/health`.
- Files: `src/index.ts:103-110`.
- Recommendations: `AbortController` with a ~10 s timeout for both connect and total response. Combine with S3 to bound worst-case resource use per request.

### S5. Highlight.io test log fires on every proxy call

- Risk: `H.log('http', 'test')` looks like a leftover instrumentation probe. It runs once per `/http*` request that reaches `runProxy`, so it inflates Highlight log volume and obscures real signals.
- Files: `src/index.ts:81`.
- Recommendations: Remove. If logging is intended, log structured fields (`H.log('http_proxy', { url, status, ms })`) only on completion, not at entry.

---

## Performance Bottlenecks

### P1. Whole-document buffering and parse on every request

- Problem: `site.text()` → `parse(body)` → `root.toString()` is three full passes over the document, and the parser materialises a DOM-like tree.
- Files: `src/index.ts:117-150`.
- Cause: The current rewriting model (mutating attributes) requires a tree representation.
- Improvement path: For pages where rewriting is minimal (inject one meta tag, rewrite a handful of stylesheet hrefs), a streaming HTML rewriter (Cloudflare's `htmlrewriter`-style or `parse5-html-rewriting-stream`) would cut both memory and latency. Premature today; revisit if/when concern #6 is addressed (rewriting more attributes amplifies the cost).

### P2. DNS lookup on every request, no caching

- Problem: `dns.lookup` per request adds ~5–50 ms cold and is repeated for popular hosts.
- Files: `src/index.ts:69`.
- Cause: No cache, no reuse of the resolution between guard and fetch.
- Improvement path: A small LRU keyed by hostname (TTL bounded by the lowest `dns.lookup` TTL or a fixed 30 s) cuts repeat lookups and pairs naturally with the fix to concern #1 (validated address pinned into the fetch agent).

---

## Fragile Areas

### F1. `runProxy` is a single 75-line function that mixes concerns

- Files: `src/index.ts:76-151`.
- Why fragile: URL parsing, SSRF check, fetch, status mapping, HTML parse, multiple rewriters, header munging, and response send are all interleaved. Any change (e.g. adding an upstream timeout or content-type check) touches the same function.
- Safe modification: Refactor into pure helpers (`fetchSafely`, `rewriteHtml`, `injectMetadata`) before adding new behaviour. None of the tests in `tests/e2e/` exercise the rewriter in isolation, so changes today are validated only through the full e2e path.
- Test coverage: No unit tests at all. The proxy is exercised end-to-end through Playwright only.

### F2. The `/http*` Express 4 wildcard is migration-fragile

- Files: `src/index.ts:166`.
- Why fragile: Express 5 changes wildcard semantics (`*` is no longer a positional capture; you must use `*splat` or a regex). `req.params[0]` will silently change shape on upgrade.
- Safe modification: When `express` is bumped to v5, switch to `app.get(/^\/http(.+)/, …)` and read `req.params[0]`, or migrate to `app.get('/*splat', …)` and read `req.params.splat`. Pin Express to `^4` until the migration is intentional.

### F3. The same-site separation security model relies on Railway's domain choice

- Files: `src/index.ts:172-176`, `src/security-headers.ts:34-50`.
- Why fragile: Containment between shell and content depends on the two services living on different eTLD+1 entries. Today shell is `2pa.ms` and content is `2pams-content-production.up.railway.app` (different registrable domains, so `SameSite` cookies and storage are fully partitioned). If content is ever moved under a `*.2pa.ms` subdomain, the boundary collapses without any code change. The code does not assert this invariant.
- Safe modification: Add a startup check that `new URL(CONTENT_ORIGIN).host` and the shell's expected host share no registrable domain. Fail closed if they do.
- Test coverage: `tests/e2e-2-domains/two-domain-proxy.spec.ts:50-62` already encodes this invariant; lift it into a runtime assertion.

---

## Scaling Limits

### SC1. Single-worker Node, no concurrency cap on outbound fetches

- Current capacity: One Node process per Railway instance, default Node fetch (undici) connection pooling per host.
- Limit: A few hundred concurrent slow upstreams will exhaust the event loop. There is no `maxSockets` tuning and no concurrency budget per client.
- Scaling path: Combine the timeout (S4) and body-size cap (S3) to bound worst-case fetches; add a per-IP concurrency limit (`p-limit`-style or queue middleware) so one abusive client can't consume all sockets.

---

## Dependencies at Risk

### D1. `express@^4`

- Risk: Express 5 is current; ecosystem drift will accelerate. Several behaviours change (wildcard routes — see F2 — query-parser default, error handling).
- Impact: A `npm install` with no caret pin (none today) is fine; an opt-in upgrade later requires the wildcard rewrite plus middleware audit.
- Migration plan: Track Express 5 as an isolated phase; do it together with B3 (form-on-content fix) so middleware ordering changes are reviewed once.

### D2. `node-html-parser@^7`

- Risk: A non-spec-compliant parser. Mutation XSS / parser-differential bugs are a known class for any HTML rewriter that isn't the browser's.
- Impact: Today the rewriter only touches a few attributes; risk is contained. Risk grows if rewriting expands (concern #6).
- Migration plan: If full rewriting is implemented, evaluate `parse5` (spec-compliant) or a streaming rewriter (P1).

---

## Missing Critical Features

### M1. No per-host or per-user abuse controls

- Problem: Anyone on the internet can use this deploy as a free unauthenticated open proxy. There is no allow-list, no quota, no anonymous-fetch budget.
- Blocks: Sustainable hosting on a single Railway instance; ToS compliance with strict upstreams.
- Fix approach: Pair concern #4 (rate limiting) with optional API-key gating for high-volume callers.

### M2. No structured logging

- Problem: `console.info` for startup; `H.log('http', 'test')` for request logging. No request-level log line covering URL, status, duration, upstream Content-Type.
- Blocks: Operational debugging; correlating Highlight events with ingress.
- Fix approach: Adopt `pino` (or the Highlight Node SDK's structured log) and emit one line per `/http*` request on completion.

---

## Test Coverage Gaps

### T1. No unit tests; only Playwright e2e

- What's not tested: `isSafeUrl()` (every regex branch), the stylesheet rewriter, the `<head>` meta-tag injector, the role branching in `/http*`.
- Files: `src/index.ts:53-75`, `src/index.ts:120-150`, `src/index.ts:166-179`.
- Risk: Any of the security-relevant edits proposed above (SSRF expansion, URL rewriter) ship without a fast feedback loop. Playwright is wall-clock expensive and skipped by anyone without browsers installed.
- Priority: High for `isSafeUrl()` (security boundary). Medium for the rewriter.

### T2. e2e tests depend on undocumented Playwright browser cache

- What's not tested: Anyone running `npm test` for the first time hits "Executable doesn't exist" errors because `npx playwright install` is never run by CI/setup. The `package.json` `test` script is just `playwright test`.
- Files: `package.json:21`, no setup hook in `tests/`.
- Risk: New contributors and sandboxed environments (e.g. `PLAYWRIGHT_BROWSERS_PATH` redirected) hit this immediately. Cursor's sandbox repros it deterministically.
- Priority: Medium. Either add a `pretest` hook (`"pretest": "playwright install --with-deps chromium"`) or document the one-time `npx playwright install` step in `README.md`.

### T3. SSRF guard is exercised only against `127.0.0.1`

- What's not tested: `tests/e2e/proxy-elpais.spec.ts:43-46` checks `127.0.0.1` only. None of the IPv6 patterns, none of the RFC 1918 ranges, no rebinding scenario.
- Files: `tests/e2e/proxy-elpais.spec.ts:43-46`.
- Risk: Any future regex tweak can silently regress. Pair with T1 — unit tests over `isSafeUrl()` are the right place to cover all branches.
- Priority: High.

---

## Documentation Debt

### DOC1. `docs/secure-javascript-proxy.md` describes a removed architecture

- Problem: The doc's "primary architecture shipped in the codebase" is the iframe-sandbox split between `/http*` (wrapper) and `/_p/http*` (inner). That second route does not exist in `src/index.ts`. The Caddy `/_p/*` matcher in §2 also does not exist in `Caddyfile.dev` / `Caddyfile.prod`.
- Files: `docs/secure-javascript-proxy.md:6-10`, `docs/secure-javascript-proxy.md:25-46`, `docs/secure-javascript-proxy.md:49-78`, `docs/secure-javascript-proxy.md:88-98`.
- Impact: A reader trying to understand the security model is sent down a path the codebase no longer implements; security claims (sandbox iframes, `Sec-Fetch-Dest` enforcement) are *not* what the production deploy actually does.
- Fix approach: Rewrite around the two architectures that *do* exist — `monolith` (single origin, no sandbox; current default-but-unused) and `shell + content` (current production: shell at `2pa.ms` 302→ content on a different eTLD+1). The "What we deliberately did *not* solve" section is largely still valid; the architecture description is what needs replacing.

### DOC2. `README.md` does not describe the proxy at all

- Problem: The README describes a generic "TypeScript Express.js API" with `GET /` welcome message and `GET /health`. It does not mention:
  - The proxy's purpose (URL prepended to host → fetch + render).
  - The `/http*` route or how to use it.
  - The `ROLE` / `CONTENT_ORIGIN` / `APPLY_SECURITY_HEADERS` / `DEPLOYMENT_TIMESTAMP` env vars.
  - The 2-domain shell+content production architecture.
  - Railway as the actual deploy target (it's only mentioned as one of several CI/CD options).
- Additionally, the "CI/CD Deployment" section (`README.md:185-231`) describes an SSH-based deploy with `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` secrets; the actual workflow is `.github/workflows/docker-push.yml`, and production is on Railway. These secrets are not used by the live pipeline.
- Files: `README.md:1-258`.
- Impact: Anyone landing on the repo cannot reproduce the current production deploy without reading source. Onboarding is blocked.
- Fix approach: Replace the generic-API content with: project purpose, proxy contract (request shape, response semantics, redirect behaviour, refusal behaviour), env-var matrix, link to `docs/railway.md` for deploy, link to a (rewritten) `docs/secure-javascript-proxy.md` for the security model.

### DOC3. Playwright browser install not documented

- Problem: `npm test`/`npm run test:e2e` requires `npx playwright install` first, but neither `README.md` nor any setup section mentions it.
- Files: `package.json:17-21`, `README.md` (no test section at all).
- Impact: Every fresh checkout — including CI runners that don't pre-install browsers — fails on first test invocation with an opaque "Executable doesn't exist" error.
- Fix approach: Either add `"pretest": "playwright install --with-deps chromium"` or document the one-time install in a "Testing" section of `README.md`.

---

## Configuration Debt

### CFG1. `.env.example` is missing the role-based variables

- Problem: `.env.example` lists `PORT`, `NODE_ENV`, `APPLY_SECURITY_HEADERS`, `DEPLOYMENT_TIMESTAMP`. It does not mention `ROLE` or `CONTENT_ORIGIN`, both of which are required for the production architecture (`src/index.ts` throws if `ROLE=shell` is set without `CONTENT_ORIGIN`).
- Files: `.env.example:1-15`, `src/index.ts:24-34`.
- Impact: A new contributor cloning the repo cannot replicate prod-shape locally without reading source. `npm run dev:shell` from `package.json:9` exposes the canonical pair, but those names are not surfaced in `.env.example`.
- Fix approach: Add commented `ROLE=` and `CONTENT_ORIGIN=` examples covering all three values (`shell`, `content`, unset), with notes about the required pairing.

### CFG2. Significant uncommitted work

- Problem: `git status` shows 10 modified and 8 untracked files spanning the iframe undo, Playwright introduction, 2-domain split, security-headers refactor, Caddyfile rewrites, and `railway.toml` addition. None of this is committed, despite production already running on it.
- Files: `.env.example`, `.gitignore`, `Caddyfile.dev`, `Caddyfile.prod`, `Dockerfile`, `README.md`, `docker-compose.dev.yml`, `package.json`, `package-lock.json`, `src/index.ts` (modified); `playwright.config.ts`, `playwright.2-domains.config.ts`, `railway.toml`, `src/security-headers.ts`, `tests/e2e/`, `tests/e2e-2-domains/`, `docs/railway.md`, `docs/secure-javascript-proxy.md` (untracked); `.mcp.json` untracked.
- Impact: HEAD does not match what's deployed. Bisect, blame, and rollback are all impaired. Any of the concerns above can only be reasoned about against the *uncommitted* tree.
- Fix approach: Commit in logical chunks before any further work — (1) iframe→monolith reversal, (2) 2-domain role split + security-headers.ts, (3) Playwright introduction + 2-domain config, (4) Caddyfile rewrites, (5) Railway config (`railway.toml`, `docs/railway.md`).

### CFG3. `.mcp.json` is untracked and not in `.gitignore`

- Problem: `.mcp.json` exists at repo root, is not committed, and is not listed in `.gitignore`. It's the only file in that state.
- Files: `.mcp.json`, `.gitignore:1-110`.
- Impact: Either the file should be committed (if it's a shared MCP config) or ignored (if it's per-developer). Right now it's a permanent "you have uncommitted changes" item in everyone's git status.
- Fix approach: Decide which it is. If shared, commit. If per-developer, add to `.gitignore` next to the existing `# lnai-generated` block.

---

## Obsolete / Unused Surface Area

### O1. `ROLE='monolith'` default is no longer used in production

- Problem: `src/index.ts:24-28` defaults to `'monolith'` when `ROLE` is unset; `MONOLITH_CSP` exists in `src/security-headers.ts:48-50`; `useAppSecurityHeadersIfNeeded` has a `monolith` branch (`src/security-headers.ts:82-87`). Production never hits any of this — both Railway services explicitly set `ROLE=shell` or `ROLE=content`.
- Files: `src/index.ts:13-28`, `src/security-headers.ts:20`, `src/security-headers.ts:48-87`.
- Impact: Two extra code paths and a permissive CSP variant carry security risk (S1) without a corresponding use case. Removing them shrinks the threat model.
- Fix approach: Make `ROLE` required (throw if unset or not in `{ 'shell', 'content' }`); delete `MONOLITH_CSP` and the `else` branch in `useAppSecurityHeadersIfNeeded`. Update `package.json:8` (`"dev"`) to either alias `dev:2-domains` or fail loudly.

### O2. VPS-style production assets are stale

- Problem: `Caddyfile.prod`, `docker-compose.prod.yml`, the entire `goaccess` service (B2), and the `### CI/CD Deployment` section of `README.md` describe a self-hosted VPS deploy that production no longer uses. The actual deploy target is Railway, which uses `Dockerfile` + `railway.toml` only.
- Files: `Caddyfile.prod`, `docker-compose.prod.yml`, `README.md:185-247`.
- Impact: New contributors aren't sure which set of files is authoritative. Stale Caddy headers in `Caddyfile.prod` could drift from `src/security-headers.ts` and create policy mismatches if anyone ever resurrects the VPS path.
- Fix approach: Either delete the VPS-style files, or move them under `docs/legacy/` with a README note that Railway is current. Keep `src/security-headers.ts` as the single source of truth for headers.

---

## Verified-False Claims (from suggested concerns)

- "README still mentions dashboard / dashboard.{$DOMAIN}." **Not present in `README.md`.** The only surviving `dashboard` reference is in `docs/secure-javascript-proxy.md:126`, and that mention is itself a *migration note* telling readers to remove `DASHBOARD_USER` / `DASHBOARD_PASSWORD` from local `.env` — i.e. it correctly flags the removal. No action needed beyond the broader rewrite of that doc (DOC1).
- "Pre-existing eslint warnings (3 no-console)." **The actual count is 4** (`src/index.ts:184-187`), and there are also 4 Prettier errors on the working tree. See B4.

---

*Concerns audit: 2026-04-30*
