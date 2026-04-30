# 2pams

## What This Is

A URL proxy at `https://2pa.ms` that opens pages the browser would normally refuse to render in embedded or restricted contexts. You paste a URL after the slash (`https://2pa.ms/https://example.com`) and the proxy fetches it server-side and serves it back from a sandboxed origin, so framing/embedding restrictions, X-Frame-Options, geo-walls and similar refusals don't block the view. Personal project / playground; no accounts, no first-party state.

## Core Value

**Open any URL even when the upstream refuses to be framed or embedded — without giving the upstream's JavaScript any access to the user's first-party state on `2pa.ms`.**

If everything else fails, this must work: paste URL → see page → upstream JS cannot reach my cookies/storage/SW.

## Requirements

### Validated

<!-- Shipped in real production and observed working. -->

- ✓ **PROXY-01**: User can fetch any public `http(s)` URL via `https://2pa.ms/<url>` — shipped, in production
- ✓ **SEC-01**: SSRF guard — block private/internal IP ranges before fetching upstream — `src/index.ts` `isSafeUrl()` + `BLOCKED_IP_PATTERNS`
- ✓ **SEC-02**: SSRF guard — reject upstream redirects to avoid open-redirect SSRF — `src/index.ts`, `redirect: 'manual'`
- ✓ **SEC-03**: Origin separation — proxied JS runs on a different eTLD+1 (`*.up.railway.app`) from the trusted shell (`2pa.ms`), so cookies/`localStorage`/Service Workers cannot reach the shell — shipped today via `ROLE=shell` (302 redirect) + `ROLE=content` (proxy) on two Railway services
- ✓ **SEC-04**: Strict CSP on the shell, permissive-but-bounded CSP on content (`worker-src 'none'`, `frame-ancestors 'none'`, no cookies forwarded) — `src/security-headers.ts`
- ✓ **OBS-01**: Health check endpoint (`/health`) for Railway healthcheck and uptime monitors
- ✓ **OBS-02**: Highlight.io error/log integration (project `jdk55qvd`)
- ✓ **DEPLOY-01**: Deploys cleanly on Railway via `Dockerfile` + `railway.toml`; mirrors Caddy security headers via app-level middleware when `RAILWAY_*` env is present
- ✓ **DEPLOY-02**: Self-hostable behind Caddy (`Caddyfile.dev`, `Caddyfile.prod`) with the same header policy as Railway
- ✓ **TEST-01**: End-to-end Playwright smoke tests for both monolith and 2-domain modes; runs locally and against Railway via env vars (`PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_SHELL_URL`, `PLAYWRIGHT_CONTENT_URL`)

### Active

<!-- Hypotheses for the next milestone — not yet shipped/validated. -->

- [ ] **HARDEN-01**: Close the SSRF TOCTOU window (re-resolve at fetch time / pin connection to validated IP) and cover IPv6 link-local / IPv4-mapped / CGNAT
- [ ] **HARDEN-02**: Bound upstream behaviour — fetch timeout + max body size + max redirects (currently unbounded; can be DoS'd by slow/huge upstreams)
- [ ] **HARDEN-03**: Either follow redirects with re-checked SSRF, or 302 back to client with the proxied form of the next URL — current `403-on-3xx` rejects most real URLs
- [ ] **HARDEN-04**: App-level rate limit on `/http*` (per-IP) so the proxy can't be used as a high-volume scraper / amplifier
- [ ] **HARDEN-05**: Project-specific User-Agent (`2pams/<ver> (+https://2pa.ms)`) instead of the hardcoded Bingbot string; optional `?ua=` opt-in for crawler mode
- [ ] **NAV-01**: Rewrite all URL-bearing attributes (`a[href]`, `img[src]`, `script[src]`, `form[action]`, `link[href]`, `source[srcset]`, etc.) using proper `new URL(href, base)` resolution so navigation/links inside proxied pages stay proxied
- [ ] **DOCS-01**: Update `docs/secure-javascript-proxy.md` and `README.md` to reflect the 2-domain architecture (current docs still describe the removed iframe `/_p/*` split-route model)
- [ ] **CONFIG-01**: Document `ROLE`, `CONTENT_ORIGIN`, `APPLY_SECURITY_HEADERS` in `.env.example` and README

### Out of Scope

- **User accounts / login** — the entire security model relies on the shell having no first-party state; adding accounts breaks this. Defer until/unless a clear user need emerges.
- **Persistent history / bookmarks** — same reason as accounts.
- **Bypassing authenticated paywalls / DRM / botwalls (e.g. DataDome on El País)** — out of scope, ethically and practically. Some upstreams will simply not be readable from the cloud egress; document the limitation, don't fight it.
- **Full read-mode / reader-view rewriting** — separate product. The proxy preserves the upstream's HTML; it doesn't reformat it.
- **Headless-browser rendering** — the value here is "lightweight HTML proxy". Full browser rendering would be a different (much heavier) product.
- **Multi-region / global edge** — Railway single-region is fine for a personal project.

## Context

- **Brownfield, just refactored.** The codebase is mapped in `.planning/codebase/`. Production today runs the 2-domain split — `2pa.ms` (shell, `ROLE=shell`) redirects `/http*` to `2pams-content-production.up.railway.app` (content, `ROLE=content`) which serves the proxied HTML. This replaced an iframe-sandbox model that broke for sites with `X-Frame-Options: DENY`.
- **Single Express process per role**, same codebase, runtime-switched via `ROLE` env var. Both services run on Railway from the same repo.
- **No first-party state anywhere.** No DB, no auth, no cookies set, no Service Workers (CSP `worker-src 'none'`), no `localStorage` use by the shell. The whole containment story depends on this.
- **Pre-existing tech debt is concentrated in `CONCERNS.md`** — 22 confirmed + 11 surfaced during mapping. The Active requirements above are the high-value subset for the next milestone.
- **Tests today are e2e only** (Playwright). No unit tests; chosen deliberately for a small surface area where e2e covers more risk per token.

## Constraints

- **Tech stack:** Node 24 (alpine) / TypeScript / Express 4 / `node-html-parser`. Strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). No swap-out planned.
- **Hosting:** Railway is primary; Caddy + Docker Compose self-host is secondary but supported. Both must keep working.
- **No first-party state:** Cookies/localStorage/SW are deliberately absent from the shell origin and forbidden on content. Any feature that introduces state must justify breaking the security model.
- **Personal-scale traffic:** Solo project, no SLA, but it's a public open proxy — abuse-mitigation matters more than uptime.
- **No new domain purchases (yet):** Content is on `*.up.railway.app` for now; promote to a custom eTLD+1 later if/when needed.
- **Test infra constraint on this dev machine:** Cursor's sandbox redirects `PLAYWRIGHT_BROWSERS_PATH`; `npx playwright install` must be run after `npm install` in this environment (documented in `TESTING.md`).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Same-origin sandbox iframe (initial) | Cheapest containment for proxied JS — opaque origin via `sandbox` without `allow-same-origin` | ⚠️ Replaced — broke for sites with `X-Frame-Options: DENY` |
| Drop iframe; serve proxied HTML directly on `2pa.ms` (interim) | Get sites rendering again; user accepted reduced isolation | ⚠️ Superseded by 2-domain — used only as a one-day transition |
| 2-domain (eTLD+1) split via `ROLE=shell` + `ROLE=content` | Same containment as the iframe (different-site origin for proxied JS) without any iframe — `X-Frame-Options` is no longer applicable | ✓ Good — production today, all e2e tests green |
| Content origin = `*.up.railway.app` (Railway-provided) | Ships today without buying/wiring a custom domain; differs from `2pa.ms` at the registrable-domain level so containment holds | ✓ Good for now; revisit if URL-bar UX matters |
| Same codebase / different `ROLE` env per service | One repo, one Dockerfile, two services — minimum operational complexity | ✓ Good |
| Playwright (e2e) only, no unit tests | Small surface area; e2e against real upstreams (`example.com`) catches the things that matter | ✓ Pending — re-evaluate if logic surface grows |
| Hardcoded Bingbot User-Agent | Some sites serve cleaner HTML to crawlers | ⚠️ Revisit — see HARDEN-05 |
| `redirect: 'manual'` → 403 on any 3xx upstream | SSRF safety first, fix UX later | ⚠️ Revisit — see HARDEN-03 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-30 after initialization (post 2-domain ship)*
