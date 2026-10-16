# Railway deployment

The proxy supports a two-service deployment. `2pa.ms` serves the landing page and redirects `/<upstream-url>` to a content service on a separate `*.up.railway.app` hostname. Only the content service fetches upstream pages. The separate hostname keeps proxied JavaScript away from the `2pa.ms` origin.

## Services

| Service | Source | Variables | Domain |
| --- | --- | --- | --- |
| Shell | This repo, current Railpack build | `ROLE=shell`, `CONTENT_ORIGIN=https://<content>.up.railway.app` | `2pa.ms` |
| Content | This repo, Dockerfile path `Dockerfile.browser` | `ROLE=content`, optionally `BROWSER_FALLBACK_HOSTS=<host>` or `LIVE_BROWSER_HOSTS=<host>` | Generated Railway domain |

Create the content service in the existing Railway project and set its Dockerfile path to `Dockerfile.browser` (or set `RAILWAY_DOCKERFILE_PATH=Dockerfile.browser`). The root `railway.toml` was removed because its default Dockerfile setting overrode the content service's build settings. Set `/health` as the Railway healthcheck path for both services. Generate the content service's Railway domain, then set `CONTENT_ORIGIN` on the shell to that exact HTTPS origin (no trailing slash). Set the shell role only after the content service passes `/health`. Railway injects `PORT`; do not set it manually. If the app is exposed directly without Railway's injected variables, set `APPLY_SECURITY_HEADERS=1`.

The content service needs a browser-capable image. `Dockerfile.browser` uses Node 24 on Debian because Playwright's Chromium build does not support Alpine. A 500 MB memory limit is unlikely to leave room for Chromium; allocate enough memory before enabling the fallback. The ordinary fetch path does not launch a browser.

`BROWSER_FALLBACK_HOSTS` is a comma-separated allowlist. Leave it empty to disable browser rendering. When an allowlisted upstream returns a recognized DataDome challenge, the content service launches one short-lived browser context, waits up to roughly 30 seconds, and serves a script-free HTML snapshot if the challenge clears. No upstream cookie is forwarded to the visitor or retained between requests. Only one browser fallback runs per service instance at a time. If the challenge persists, the proxy returns 403. This is an experiment; it does not guarantee access to sites that detect Playwright or demand a human CAPTCHA.

`LIVE_BROWSER_HOSTS` is a separate comma-separated allowlist for interactive pages. For these HTTPS hosts, the content service starts Chromium immediately and sends screenshots to a viewer while forwarding mouse, scroll, and keyboard input. The publisher's scripts and challenge cookies stay inside the short-lived Railway browser context; they do not run in the viewer or on `2pa.ms`. The viewer has no account, cookies, or local storage. One session runs per content-service instance, closes after two idle minutes or ten total minutes, and caps upstream requests at 1,500. Requests for other hosts continue through the ordinary proxy. A Railway browser may still be rejected by upstream verification, even when the reader can interact with a challenge; enabling this mode does not guarantee article access.

The original `Dockerfile` and Docker Compose setup remain the legacy single-origin self-hosted path. It does not run the browser fallback. To self-host with separate origins, run shell and content processes on different registrable domains and configure the same variables and headers.

## Verify

1. `https://<content>.up.railway.app/health` returns 200.
2. `https://2pa.ms/https://example.com/` redirects to `https://<content>.up.railway.app/https://example.com/`.
3. The final page displays example.com's documentation-domain notice.
4. `https://<content>.up.railway.app/` does not serve the shell landing page.
5. With `LIVE_BROWSER_HOSTS=example.com` in a test environment, `https://2pa.ms/https://example.com/` shows the live viewer, and its Reload link starts a new session. Remove `example.com` from the allowlist after testing if it is not needed.

Never use real news or media sites as automated test targets. Manually inspect any allowlisted article in your own browser after deployment.
