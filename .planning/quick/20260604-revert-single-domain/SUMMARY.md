---
slug: revert-single-domain
date: 2026-06-04
status: complete
---

# Summary: Revert to Single-Domain Monolith

## What changed

- `src/index.ts` — Removed `ROLE` type, env parsing, `CONTENT_ORIGIN`, and the shell redirect branch. Handler now always calls `runProxy()`.
- `src/security-headers.ts` — Removed `SHELL_CSP`, `CONTENT_CSP`, role parameter. Only `MONOLITH_CSP` remains.
- `package.json` — Removed `dev:shell`, `dev:content`, `dev:2-domains`, `test:e2e:2-domains`, `test:e2e:2-domains:railway` scripts. Removed `concurrently` devDependency.
- Deleted `playwright.2-domains.config.ts` and `tests/e2e-2-domains/`.
- Committed as `e31feb5`.

---

## Security Concerns

Moving from two-domain to single-domain monolith has meaningful security trade-offs. Here's what you're giving up and what remains.

### What you lose

**1. Origin isolation — the most important one**

In the two-domain model, proxied JS ran on `2pams-content-production.up.railway.app` (different eTLD+1 from `2pa.ms`). The browser's same-site / same-origin policy meant:

- Cookies set on `2pa.ms` could not be read by proxied JS.
- `localStorage` and `sessionStorage` on `2pa.ms` were unreachable.
- Service Workers registered by proxied pages were scoped to the content origin, not to `2pa.ms`.
- `document.cookie`, `window.opener`, `postMessage` cross-origin attacks were bounded by the browser.

In monolith mode, proxied JS runs **first-party** on `2pa.ms`. Any cookies, storage, or SW registrations it makes are scoped to `2pa.ms`. If you ever add any first-party state (auth token, preferences, etc.) to `2pa.ms`, proxied pages can read it.

**For now:** the project deliberately has no first-party state, so this is only a theoretical risk — but it's the one to watch.

**2. `javascript:` stripping is defense-in-depth, not containment**

The code strips `javascript:` from `href`/`src`/`action` attributes. But `<script>` tags and `on*` event handlers are **intentionally left intact** (the comment in the code says so). Proxied pages execute inline JS freely. This was always true in monolith mode; the two-domain model was the actual containment.

**3. XSS amplification surface**

A proxied page that injects a script (e.g. via a stored XSS on the upstream site) now runs at the privilege of `2pa.ms` rather than the content sandbox domain. That JS can call `fetch('https://2pa.ms/anything')` with the user's `2pa.ms` cookies (if any existed). In practice: no cookies today = no credential theft. Still, the blast radius of any XSS in proxied content is now first-party, not sandboxed.

**4. Service Worker persistence**

A malicious proxied page could register a Service Worker under `2pa.ms`, intercept future requests to `2pa.ms`, and persist across visits. The CSP (`worker-src 'none'`) blocks this **only when `APPLY_SECURITY_HEADERS=1` or on Railway**. Locally without that flag, SWs are allowed.

### What you keep

- **SSRF guard** — `isSafeUrl()` with `dns.lookup()` still blocks internal-IP targets.
- **`redirect: 'manual'` → 403** — upstream redirects are still rejected (prevents open redirect chains).
- **`Set-Cookie` removal** — `res.removeHeader('Set-Cookie')` still strips cookies from proxied responses; upstream can't set cookies on your domain.
- **`Cache-Control: no-store`** — proxied pages aren't cached.
- **`worker-src 'none'`** — in the CSP (when active), Service Workers from proxied content are blocked.
- **No first-party state** — the project still has no logins, sessions, or stored state, so the elevated-privilege risk is theoretical today.

### Net assessment

For a personal tool with no auth and no first-party state, the monolith is workable. The practical threat is: if you ever add any first-party state to `2pa.ms` (even a preference cookie), proxied JS could read it. Keep that constraint explicit.

If you return to the two-domain model later, the shell/content split is fully deletable/re-addable — the code is straightforward to restore.
