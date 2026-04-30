# Requirements: 2pams

**Defined:** 2026-04-30
**Core Value:** Open any URL even when the upstream refuses to be framed/embedded — without giving the upstream's JavaScript any access to the user's first-party state on `2pa.ms`.

## v1 Requirements

Next-milestone scope. The Validated set in `PROJECT.md` is already shipped (2-domain split, SSRF guard, CSP, Playwright, Railway deploy). This v1 hardens that base.

### Hardening

- [ ] **HARDEN-01**: Server re-resolves the upstream hostname at fetch time and pins the connection to a validated IP, so a DNS rebinding window between SSRF check and fetch cannot reach a private IP. `dns.lookup(host, { all: true })` is used and **all** returned addresses are checked.
- [ ] **HARDEN-02**: SSRF block-list covers IPv6 link-local (`fe80::/10`), IPv4-mapped IPv6 (`::ffff:0:0/96`), multicast (`ff00::/8`), unspecified (`::/128`), and CGNAT (`100.64.0.0/10`) in addition to the existing RFC 1918 / loopback ranges.
- [ ] **HARDEN-03**: Upstream `fetch` enforces a configurable timeout (default 10s) and a max body size (default 5 MB). Requests exceeding either return `502` with no body buffered.
- [ ] **HARDEN-04**: Upstream `3xx` redirects are followed (up to N=5) with the SSRF guard re-run on each `Location`, instead of the current `403`-on-any-3xx behaviour. Loops are detected and rejected.
- [ ] **HARDEN-05**: A per-IP rate limiter is applied to `/http*` (default 60 req/min/IP). `req.ip` is used (`trust proxy` is already on); limiter respects `X-Forwarded-For` from Railway/Caddy.
- [ ] **HARDEN-06**: Outbound `User-Agent` is `2pams/<version> (+https://2pa.ms)` by default. Optional `?ua=googlebot|bingbot|firefox` query param lets a user opt into a crawler/browser UA when they knowingly want it.

### Navigation

- [ ] **NAV-01**: All URL-bearing attributes inside the proxied HTML are rewritten so links/assets resolve correctly. At minimum: `a[href]`, `link[href]`, `script[src]`, `img[src]`, `img[srcset]`, `source[srcset]`, `iframe[src]`, `form[action]`. Each value is resolved with `new URL(value, upstreamUrl)` (handles relative, protocol-relative, and absolute correctly).
- [ ] **NAV-02**: Navigation `a[href]` and `form[action]` rewrites point at the proxy itself (`/<absolute-upstream-url>`) so clicking inside a proxied page stays proxied. Asset URLs (`script`, `img`, `link`, `source`) point at the original absolute upstream URL (so they load directly from upstream rather than re-proxied).
- [ ] **NAV-03**: A simple landing page on the shell origin (`GET /`) shows a single URL input field; submitting redirects to `/<typed-url>`. Replaces the current "paste-after-slash" UX as the entry point but still allows the bare-URL form for power users.

### Documentation & Configuration

- [ ] **DOCS-01**: `docs/secure-javascript-proxy.md` is rewritten to describe the 2-domain `ROLE=shell`/`ROLE=content` architecture currently in production. The obsolete iframe `/_p/*` description is removed.
- [ ] **DOCS-02**: `README.md` documents what 2pams *does* (URL proxy), how to run it locally in both monolith and 2-domain modes, and how to deploy to Railway. The dashboard / `dashboard.{$DOMAIN}` references in deployment sections are removed.
- [ ] **CONFIG-01**: `.env.example` documents `ROLE`, `CONTENT_ORIGIN`, and `APPLY_SECURITY_HEADERS` with example values for each deployment mode.
- [ ] **CONFIG-02**: `app.set('trust proxy', 1)` is gated behind a runtime check (Railway/Caddy detected) so direct-Node deployments don't trust an attacker-supplied `X-Forwarded-For`.

### Tests

- [ ] **TEST-01**: Playwright tests cover each new HARDEN-* behaviour: timeout, body-size cap, redirect-follow, rate limit, UA opt-in.
- [ ] **TEST-02**: Playwright tests cover NAV-* behaviour: clicking a link inside a proxied page navigates to the proxied form of the new URL; assets resolve.

## v2 Requirements

Tracked, not in this milestone's roadmap.

### URL bar / shareability

- **UX-01**: Custom content domain (own eTLD+1, e.g. `2pams-content.app`) instead of `*.up.railway.app` for nicer share-URLs while keeping the same-site separation.

### Observability

- **OBS-01**: Per-request structured logs (status, upstream host, bytes, duration) sent to Highlight.io with PII scrubbing.
- **OBS-02**: A minimal `/stats` endpoint (admin-gated) for traffic shape.

### Reach

- **REACH-01**: Optional residential-egress mode (paid proxy) for upstreams that block datacenter IPs. Off by default; user opt-in only.

## Out of Scope

| Feature | Reason |
|---------|--------|
| User accounts / login | Breaks the "no first-party state on shell" security model. |
| Persistent history / bookmarks | Same as accounts. |
| Bypassing authenticated paywalls / DRM / botwalls | Out of scope ethically and practically. Some upstreams will simply not be readable from cloud egress. |
| Full reader-mode / content extraction | Different product. The proxy preserves upstream HTML; it doesn't reformat. |
| Headless-browser rendering | Different (much heavier) product. The value here is "lightweight HTML proxy". |
| Multi-region / global edge | Personal-scale traffic, single Railway region is fine. |

## Traceability

Populated by the roadmapper.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HARDEN-01 | Phase 1 | Pending |
| HARDEN-02 | Phase 1 | Pending |
| HARDEN-03 | Phase 1 | Pending |
| HARDEN-04 | Phase 1 | Pending |
| HARDEN-05 | Phase 1 | Pending |
| HARDEN-06 | Phase 1 | Pending |
| NAV-01 | Phase 2 | Pending |
| NAV-02 | Phase 2 | Pending |
| NAV-03 | Phase 2 | Pending |
| DOCS-01 | Phase 3 | Pending |
| DOCS-02 | Phase 3 | Pending |
| CONFIG-01 | Phase 3 | Pending |
| CONFIG-02 | Phase 1 | Pending |
| TEST-01 | Phase 1 | Pending |
| TEST-02 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15 ✓
- Unmapped: 0

**Notes on cluster splits:**
- `TEST-01` is mapped to Phase 1 (travels with the HARDEN-* behaviours it covers); `TEST-02` is mapped to Phase 2 (travels with NAV-*).
- `CONFIG-02` (`trust proxy` runtime gating) is mapped to Phase 1 because it is a security prerequisite for `HARDEN-05` (per-IP rate limiter relying on `req.ip`).

---
*Requirements defined: 2026-04-30*
*Last updated: 2026-04-30 — traceability populated by roadmapper*
