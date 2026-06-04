---
slug: rewrite-relative-urls
date: 2026-06-04
status: complete
---

# Summary: Rewrite relative URLs in proxied HTML

## What changed

- `src/index.ts` — replaced the old partial stylesheet-only rewrite and the `javascript:` stripping loop with two helpers:
  - `resolveAttr(el, attrName)` — resolves `src`, `href`, `action` against upstream origin; still strips `javascript:`; leaves `data:`, `blob:`, `//` as-is
  - `resolveSrcset(el)` — resolves each URL token in `srcset` (comma-separated, with optional width/density descriptors)
- `tests/e2e/proxy.spec.ts` — added assertion that no bare relative URLs survive the rewriter on a proxied example.com page
- Committed as `ceca979`

## Why

Relative URLs in proxied HTML were resolving against `2pa.ms` instead of the upstream origin, causing 404s for favicons, images, scripts, and stylesheets. Form `action` attributes with relative paths were also broken, preventing bot-challenge forms from submitting back to the upstream.
