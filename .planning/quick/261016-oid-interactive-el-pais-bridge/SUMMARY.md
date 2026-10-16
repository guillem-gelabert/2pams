---
slug: interactive-el-pais-bridge
date: 2026-10-16
status: incomplete
---

# Summary

Added an unpacked Manifest V3 Chrome extension for El País URLs opened through the Railway content origin. It embeds the live upstream article in a cross-origin iframe, allowing interactive controls to run on the upstream origin. A narrowly scoped network rule removes framing headers only from El País subframe responses initiated by the content origin. The trusted `2pa.ms` shell and server cookie policy are unchanged.

The extension passed a controlled local browser test: an article fixture with both `X-Frame-Options: DENY` and `frame-ancestors 'none'` loaded in the frame and its button remained interactive. No automated request to El País or another news site was made.

The user must load the extension in the same Chrome profile as Bypass Paywalls Clean and manually verify the exact article. Third-party cookie policy or site behavior may still prevent the page from working in a frame. No Railway or Cloudflare settings were changed for this task.
