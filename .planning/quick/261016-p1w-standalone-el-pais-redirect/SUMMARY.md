---
slug: standalone-el-pais-redirect
date: 2026-10-16
status: incomplete
---

# Summary

The Chrome extension now handles El País without Bypass Paywalls Clean. It keeps the approved top-level redirect from the 2pa.ms entry URL and adds two narrowly scoped subscription-script blocking rules and an El País ad style. The blocking patterns and selectors were adapted from the supplied Bypass Paywalls Clean zip; its MIT license is included.

The controlled Playwright test runs with only this extension. It verifies the redirect, query preservation, blocking of both subscription-script fixtures, hidden ad fixture, and usable interactive button. Build and lint pass, with four pre-existing console warnings in `src/index.ts`. No automated request to El País or any other news site was made.

The user's manual check of the exact interactive article with Bypass Paywalls Clean disabled is pending. No Railway or Cloudflare configuration changed.
