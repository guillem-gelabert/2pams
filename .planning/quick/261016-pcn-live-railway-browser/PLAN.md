---
slug: live-railway-browser
date: 2026-10-16
status: in-progress
---

# Extension-free interactive article

The user requires `2pa.ms/<article-url>` to remain interactive with no browser extension. The Railway fetch and browser snapshot fail on El País verification; AMP is incomplete. The user requires Railway alone, with no home service or paid proxy. Build a bounded live Chromium viewer on the isolated content service. The visitor can interact with the remote browser and manually complete any upstream challenge.

## Tasks

1. Add a live-browser route for operator-allowlisted hosts on the content role only. Keep short-lived context state in Railway memory, no first-party cookies or storage, one active session, a strict lifetime, and an SSRF guard for browser requests.
2. Stream browser frames to a viewer on the content origin and forward mouse, scroll, and keyboard input. Keep upstream scripts in the remote browser.
3. Test redirect, rendering, and input with a controlled local fixture. Never automate requests to El País or another news site.
4. Deploy to Railway if local checks pass, then request manual verification of the exact article. Document limitations honestly; DataDome may hard-block the Railway browser even with human interaction.
