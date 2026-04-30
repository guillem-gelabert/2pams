# Roadmap: 2pams

**Defined:** 2026-04-30
**Granularity:** coarse
**Core Value:** Open any URL even when the upstream refuses to be framed/embedded — without giving the upstream's JavaScript any access to the user's first-party state on `2pa.ms`.

## Context

Brownfield project. The Validated set in `PROJECT.md` is already shipped (2-domain `ROLE=shell`/`ROLE=content` split, SSRF guard, CSP, Highlight observability, Railway deploy, Caddy self-host, Playwright e2e). This milestone hardens that base, makes navigation inside proxied pages work, and brings the docs back in sync with the shipped architecture.

Phases are ordered by **risk to the live deploy**:

1. Hardening first — security/abuse-mitigation gaps in production today (TOCTOU SSRF, no fetch bounds, no rate limit, Bingbot UA, untrusted `X-Forwarded-For` if direct-Node). Regressing or shipping these wrong directly affects the public proxy.
2. Navigation second — largest user-visible behaviour change (rewrites every URL-bearing tag and changes the entry-point UX); risky to develop before the hardening floor is in.
3. Docs last — must describe the post-hardening, post-navigation state, so it ships after the behaviour stabilises.

## Phases

- [ ] **Phase 1: Harden the proxy against hostile upstreams and abusive clients** — close SSRF TOCTOU + IPv6 gaps, bound fetch (timeout / body / redirects), rate-limit + project-UA + gated `trust proxy`.
- [ ] **Phase 2: Make navigation work inside proxied pages** — rewrite all URL-bearing attributes, route clicks back through the proxy, ship a shell-only landing form.
- [ ] **Phase 3: Document the shipped state** — rewrite README + threat-model doc + `.env.example` to match the 2-domain reality.

## Phase Details

### Phase 1: Harden the proxy against hostile upstreams and abusive clients
**Goal**: The production proxy survives malicious upstreams (DNS-rebinding, OOM-via-large-body, slow-loris, redirect chains) and abusive clients (high-volume scraping), and stops impersonating Bingbot. `trust proxy` is honest about whether an upstream proxy is actually present.
**Depends on**: Nothing (first phase).
**Requirements**: HARDEN-01, HARDEN-02, HARDEN-03, HARDEN-04, HARDEN-05, HARDEN-06, CONFIG-02, TEST-01
**Success Criteria** (what must be TRUE):
  1. Fetching any URL whose hostname resolves to **any** private/loopback range — including IPv6 link-local (`fe80::/10`), IPv4-mapped IPv6 (`::ffff:0:0/96`), multicast (`ff00::/8`), unspecified (`::/128`), CGNAT (`100.64.0.0/10`), plus the existing RFC 1918 / loopback set — returns `403`. The check uses `dns.lookup(host, { all: true })` and rejects if **any** returned address matches; the connection is pinned to the validated address (no DNS-rebinding window between guard and fetch).
  2. An upstream that stalls beyond the configured timeout (default 10s) or streams more than the configured max body (default 5 MB) returns `502` promptly with no body buffered into memory and no event-loop saturation.
  3. Upstream `3xx` responses are followed up to N=5 hops with the SSRF guard re-run on each `Location`, loops are detected and rejected, and the final resource is served — instead of the current blanket `403`-on-any-3xx behaviour.
  4. A single client IP exceeding the configured rate (default 60 req/min) on `/http*` is throttled with `429`; legitimate sub-limit traffic is unaffected. The limiter keys on `req.ip`, which reflects `X-Forwarded-For` only when running behind a known upstream proxy (Railway/Caddy detected).
  5. Outbound `User-Agent` is `2pams/<version> (+https://2pa.ms)` by default; appending `?ua=googlebot|bingbot|firefox` swaps the outbound UA observably (asserted by Playwright). The hardcoded Bingbot string is gone.
**Plans**: TBD

### Phase 2: Make navigation work inside proxied pages
**Goal**: A user clicking a link or submitting a form inside a proxied page stays inside the proxy, every URL-bearing attribute resolves to a valid absolute URL, and the entry point is a single form on the shell origin.
**Depends on**: Phase 1 (the rate limit, fetch bounds, and redirect-follow from Phase 1 change `/http*` semantics that the navigation Playwright tests depend on; risk-ordering also says ship the security floor before the largest behaviour change).
**Requirements**: NAV-01, NAV-02, NAV-03, TEST-02
**Success Criteria** (what must be TRUE):
  1. Inside any proxied HTML response, every URL-bearing attribute (`a[href]`, `link[href]`, `script[src]`, `img[src]`, `img[srcset]`, `source[srcset]`, `iframe[src]`, `form[action]`) resolves to a valid absolute URL via `new URL(value, upstreamUrl)` — relative, protocol-relative, and absolute inputs all become correct absolute URLs (no `https://upstream.comhttps://other.cdn/...` style breakage).
  2. Clicking an `<a href>` or submitting a `<form action>` inside a proxied page navigates to the proxied form of the next URL (`<shell-origin>/<absolute-next-url>`); subsequent navigation stays inside the proxy. Asserted by Playwright clicking a link inside a proxied page.
  3. Asset URLs (`<script src>`, `<img src>`, `<link href>`, `<source srcset>`) inside proxied HTML point at the **original absolute upstream URL** — they load directly from upstream rather than being re-proxied.
  4. `GET /` on the shell origin returns a landing page with a single URL input field; submitting redirects to `/<typed-url>`. The bare-URL form (`https://2pa.ms/<url>`) keeps working unchanged for power users.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Document the shipped state
**Goal**: A new contributor reading the repo can understand what 2pams is, run it locally in either topology, and deploy it to Railway — without source-code spelunking or reading docs that describe the removed iframe model.
**Depends on**: Phase 1, Phase 2 (must document the post-hardening, post-navigation behaviour, including the new env-var contract and rate-limit/UA defaults).
**Requirements**: DOCS-01, DOCS-02, CONFIG-01
**Success Criteria** (what must be TRUE):
  1. `README.md` describes (a) what 2pams does as a URL proxy, (b) commands to run it locally in monolith mode, (c) commands to run it locally in 2-domain mode (`dev:shell` + `dev:content`), (d) the Railway deploy path — and contains zero references to dashboard / `dashboard.{$DOMAIN}` or to the removed iframe `/_p/*` model.
  2. `docs/secure-javascript-proxy.md` describes the live 2-domain `ROLE=shell` (302 at `2pa.ms`) → `ROLE=content` (proxy on a different eTLD+1) architecture; the obsolete iframe-sandbox / `/_p/*` split-route description is removed.
  3. `.env.example` documents `ROLE`, `CONTENT_ORIGIN`, and `APPLY_SECURITY_HEADERS` alongside the existing variables, with example values for each deployment mode (`shell`, `content`, monolith / unset).
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Harden the proxy against hostile upstreams and abusive clients | 0/0 | Not started | - |
| 2. Make navigation work inside proxied pages | 0/0 | Not started | - |
| 3. Document the shipped state | 0/0 | Not started | - |

## Coverage

- v1 requirements: 15
- Mapped: 15 / 15 ✓
- Unmapped: 0

| Cluster | Requirements | Phase |
|---------|--------------|-------|
| Hardening | HARDEN-01, HARDEN-02, HARDEN-03, HARDEN-04, HARDEN-05, HARDEN-06 | 1 |
| Documentation & Configuration → CONFIG-02 | CONFIG-02 | 1 (paired with HARDEN-05; `trust proxy` gating is a security prerequisite for the rate limiter) |
| Tests → TEST-01 | TEST-01 | 1 (tests travel with the HARDEN-* behaviours they cover) |
| Navigation | NAV-01, NAV-02, NAV-03 | 2 |
| Tests → TEST-02 | TEST-02 | 2 (tests travel with the NAV-* behaviours they cover) |
| Documentation & Configuration → DOCS / CONFIG-01 | DOCS-01, DOCS-02, CONFIG-01 | 3 |

## Notes

- **Cluster vs. phase**: The REQUIREMENTS.md "Tests" and "Documentation & Configuration" clusters are split across phases on purpose. Tests live with the behaviour they verify (TEST-01 with HARDEN-*, TEST-02 with NAV-*). `CONFIG-02` (gated `trust proxy`) is logically a hardening prerequisite for HARDEN-05 (rate limiter) — keeping it in Phase 1 avoids a config/security straddle.
- **Parallelization**: Within each phase, plans can fan out where dependencies allow (config has `parallelization: true`). Across phases the dependency chain is strict (1 → 2 → 3) per the risk-ordering instruction.
- **Mode**: `mode: yolo` in `config.json` — execution can chain through without per-plan approval gates once a phase is planned.

---

*Roadmap defined: 2026-04-30*
*Last updated: 2026-04-30 after initial roadmap creation*
