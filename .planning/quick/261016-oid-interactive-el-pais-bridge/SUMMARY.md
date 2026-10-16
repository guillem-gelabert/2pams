---
slug: interactive-el-pais-bridge
date: 2026-10-16
status: incomplete
---

# Summary

The first Manifest V3 extension framed El País inside the Railway content origin. The user confirmed its header appeared but the article did not. Their console showed El País scripts running, cookie errors, and a blocked cross-origin parent-frame read. The iframe approach therefore failed in the user's Chrome profile.

The user approved a top-level redirect from `2pa.ms/https://elpais.com/...` to the live El País page. The extension now uses a narrowly scoped main-frame redirect rule and no longer removes response headers or injects a content script. A controlled local browser test confirms that it redirects before contacting the entry server, preserves the path and query, leaves other targets alone, and keeps a button interactive on the destination page. No automated request to El País or another news site was made.

The user must reload the unpacked extension in the same Chrome profile as Bypass Paywalls Clean and manually verify the exact article. The final address bar will show `elpais.com`. No Railway or Cloudflare settings were changed for this task.
