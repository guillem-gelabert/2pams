# Railway deployment

The proxy supports a two-service deployment. `2pa.ms` serves the landing page and redirects `/<upstream-url>` to a content service on a separate `*.up.railway.app` hostname. Only the content service fetches upstream pages. The separate hostname keeps proxied JavaScript away from the `2pa.ms` origin.

## Services

| Service | Source | Variables | Domain |
| --- | --- | --- | --- |
| Shell | This repo, current Railpack build | `ROLE=shell`, `CONTENT_ORIGIN=https://<content>.up.railway.app` | `2pa.ms` |
| Content | This repo, config file `/railway.browser.toml` | `ROLE=content`, optionally `BROWSER_FALLBACK_HOSTS=<host>` | Generated Railway domain |

Create the content service in the existing Railway project and set its **Railway Config File** path to `/railway.browser.toml`. That file selects `Dockerfile.browser`; the repository's default `railway.toml` selects the ordinary Dockerfile and would otherwise override service build settings. Generate the content service's Railway domain, then set `CONTENT_ORIGIN` on the shell to that exact HTTPS origin (no trailing slash). Set the shell role only after the content service passes `/health`. Both services use the same source and `/health` path. Railway injects `PORT`; do not set it manually. If the app is exposed directly without Railway's injected variables, set `APPLY_SECURITY_HEADERS=1`.

The content service needs a browser-capable image. `Dockerfile.browser` uses Node 24 on Debian because Playwright's Chromium build does not support Alpine. A 500 MB memory limit is unlikely to leave room for Chromium; allocate enough memory before enabling the fallback. The ordinary fetch path does not launch a browser.

`BROWSER_FALLBACK_HOSTS` is a comma-separated allowlist. Leave it empty to disable browser rendering. When an allowlisted upstream returns a recognized DataDome challenge, the content service launches one short-lived browser context, waits up to roughly 30 seconds, and serves a script-free HTML snapshot if the challenge clears. No upstream cookie is forwarded to the visitor or retained between requests. Only one browser fallback runs per service instance at a time. If the challenge persists, the proxy returns 403. This is an experiment; it does not guarantee access to sites that detect Playwright or demand a human CAPTCHA.

The original `Dockerfile` and Docker Compose setup remain the legacy single-origin self-hosted path. It does not run the browser fallback. To self-host with separate origins, run shell and content processes on different registrable domains and configure the same variables and headers.

## Verify

1. `https://<content>.up.railway.app/health` returns 200.
2. `https://2pa.ms/https://example.com/` redirects to `https://<content>.up.railway.app/https://example.com/`.
3. The final page displays example.com's documentation-domain notice.
4. `https://<content>.up.railway.app/` does not serve the shell landing page.

Never use real news or media sites as automated test targets. Manually inspect any allowlisted article in your own browser after deployment.
