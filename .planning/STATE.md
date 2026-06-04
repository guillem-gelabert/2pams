# Project State: 2pams

## Project Reference

- **What:** URL proxy at `https://2pa.ms` — paste any URL after the slash and the server fetches it from a sandboxed origin so framing/embedding restrictions don't block the view.
- **Core value:** Open any URL even when the upstream refuses to be framed/embedded — without giving the upstream's JavaScript any access to the user's first-party state on `2pa.ms`.
- **Current focus:** Milestone 1 — harden the production proxy, fix in-page navigation, sync docs to the current single-domain monolith.
- **Pointers:** `.planning/PROJECT.md` · `.planning/REQUIREMENTS.md` · `.planning/ROADMAP.md` · `.planning/codebase/`

## Current Position

- **Milestone:** 1 (reverted from 2-domain to single-domain monolith on 2026-06-04).
- **Phase:** Not started — roadmap defined, awaiting `/gsd-plan-phase 1`.
- **Plan:** —
- **Status:** Ready for Phase 1 planning.
- **Progress:** 0 / 3 phases complete · 0 / 15 v1 requirements delivered.

```
[          ] Phase 1  Harden the proxy
[          ] Phase 2  Navigation rewrite
[          ] Phase 3  Document shipped state
```

## Performance Metrics

| Metric | Target | Current |
|--------|--------|---------|
| v1 requirements mapped | 15 / 15 | 15 / 15 ✓ |
| Phases planned | 3 / 3 | 0 / 3 |
| Phases executed | 3 / 3 | 0 / 3 |
| e2e tests passing | All green on Railway + local | Inherited from Validated set (passing) |

## Accumulated Context

### Key Decisions (carried forward from PROJECT.md)

- **2026-06-04:** Reverted to single-domain monolith. ROLE=shell/content split removed. Proxied HTML now served from the same origin as the UI. See `.planning/quick/20260604-revert-single-domain/` for security notes.
- Playwright e2e only — no unit tests. Surface area is small enough that black-box e2e covers more risk per token. Re-evaluate if the rewriter (NAV-*) grows.
- `redirect: 'manual'` → 403 on any 3xx upstream is a known-bad UX, kept until HARDEN-04 ships in Phase 1.
- Hardcoded Bingbot User-Agent is a deliberate temporary state; replaced by HARDEN-06 in Phase 1.

### Open Questions / Decisions Pending

- HARDEN-04 implementation choice (Phase 1): follow redirects server-side with re-checked SSRF per hop, **or** emit a 302 back to the client pointing at the proxied form of the next URL? Decided in `/gsd-plan-phase 1`.
- NAV-03 (Phase 2): does landing-page hardening also fix `public/index.html` being served on the content origin (CONCERNS.md B3), or is that out of scope for this milestone? Decided in `/gsd-plan-phase 2`.

### Active Todos

- None tracked here yet (use `gsd-add-todo` to capture mid-phase ideas).

### Blockers

- None.

### Constraints carried into every phase

- TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Env access via `process.env['NAME']`.
- No first-party state on the shell origin — features must not introduce cookies / `localStorage` / Service Workers.
- Railway and Caddy paths must stay in lockstep — any new security header goes in **both** `src/security-headers.ts` and `Caddyfile.{dev,prod}`.
- Test infra: `npx playwright install` is required after `npm install` on this dev machine (`PLAYWRIGHT_BROWSERS_PATH` is sandbox-redirected).

## Session Continuity

- **Last session:** 2026-04-30 — initialized milestone 1 (PROJECT.md, REQUIREMENTS.md, codebase mapping, this roadmap).
- **Next action:** `/gsd-plan-phase 1` — plan the hardening phase. Dependencies surfaced in `ROADMAP.md` allow internal parallelization across the three plan clusters (SSRF/DNS, fetch bounds + redirects, abuse controls).
- **Files of record:** `.planning/ROADMAP.md` (phase contract) · `.planning/REQUIREMENTS.md` (traceability) · `.planning/codebase/CONCERNS.md` (anchors per requirement).

## Quick Tasks Completed

| Date | Slug | Description |
|------|------|-------------|
| 2026-06-04 | revert-single-domain | Reverted from two-domain shell/content split to single-domain monolith |
| 2026-06-04 | rewrite-relative-urls | Rewrite relative src/href/action/srcset to upstream origin in proxied HTML |

---

*State initialized: 2026-04-30*
