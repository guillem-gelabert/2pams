# Deploy 2pams on [Railway](https://railway.com/)

This app is a **single Node process** (see [`Dockerfile`](../Dockerfile)). Self‑hosted setups use **Caddy** in front for TLS and response headers. On Railway, **HTTPS and routing are handled by Railway**; the app applies the same security headers as Caddy when [Railway’s system variables](https://docs.railway.com/reference/variables#railway-provided-variables) are present (e.g. `RAILWAY_PROJECT_ID`), or when you set `APPLY_SECURITY_HEADERS=1` locally. See [`src/security-headers.ts`](../src/security-headers.ts).

## Prereqs

- GitHub (or GitLab) repo with this project
- A [Railway](https://railway.com/) account
- [Railway CLI](https://docs.railway.com/guides/cli) (optional but recommended): `npm i -g @railway/cli` or [other install methods](https://docs.railway.com/guides/cli#installation)

## CLI workflow

From the repo root (`2pams/`):

```bash
# 1. Log in (opens browser). Headless / CI: railway login --browserless
railway login

# 2. Attach this directory to a Railway project (interactive picker), or pass IDs:
#    railway link -p <project-id> -s <service-id> -e production
railway link

# 3. Deploy the current directory (uses Dockerfile + railway.toml)
railway up

# Useful follow-ups
railway status
railway logs
railway open
railway domain
railway variable set KEY=value
```

- **`railway up`** uploads and deploys from disk ([docs](https://docs.railway.com/guides/cli#deploy)). Use `-d` to detach from the log stream, `-c` / `--ci` in CI for log-only output.
- If you use **GitHub → Railway** instead, pushes deploy automatically; you still use **`railway link`** locally so `status`, `logs`, and `variable` target the right service.

This machine’s CLI is not logged into your account, so **`railway whoami`** / **`railway status`** only work after you run **`railway login`** on your machine.

## One-time setup (dashboard)

1. In Railway: **New project** → **Deploy from GitHub** → select the `2pams` repo.
2. Railway will detect the **Dockerfile** (see [`railway.toml`](../railway.toml)) and run `npm run build` + `npm run start`.
3. After the first successful deploy, open **Settings** → **Networking** → **Generate domain** (or attach a custom domain). Railway provides HTTPS automatically ([docs](https://docs.railway.com/guides/public-networking)).
4. Optional: under **Variables**, set:
   - `DEPLOYMENT_TIMESTAMP` — ISO string or any build id (baked at **build** time if you pass a [build arg](https://docs.railway.com/reference/build-and-start-commands) in the dashboard; the Dockerfile already supports `ARG DEPLOYMENT_TIMESTAMP`).

## Health check

Railway uses `GET /health` as the healthcheck path (configured in `railway.toml`). The service should return `200` with JSON.

## Environment variables

| Variable | When |
| -------- | ---- |
| `PORT` | **Injected by Railway** — do not set manually. The app reads `process.env.PORT` ([`src/index.ts`](../src/index.ts)). |
| `NODE_ENV` | Set to `production` in the Dockerfile. |
| `RAILWAY_PROJECT_ID` / `RAILWAY_SERVICE_ID` / `RAILWAY_PUBLIC_DOMAIN` | **Set by Railway** — presence triggers in-app security headers to match Caddy. |
| `APPLY_SECURITY_HEADERS=1` | Use only if you need the same headers outside Railway (e.g. a raw Node test). |
| `DEPLOYMENT_TIMESTAMP` | Optional; shown in the proxied HTML meta tag. |

## What you are *not* running on Railway

- **Caddy** and **goaccess** from [`docker-compose.prod.yml`](../docker-compose.prod.yml) are for a VPS-style stack. Railway does not use that compose file by default; you only need the **app** service.

## Verify after deploy

```bash
curl -sS "https://<your-railway-domain>/health"
curl -sI "https://<your-railway-domain>/" | grep -iE 'content-security|strict-transport'
```

## Further reading

- [Railway: CLI](https://docs.railway.com/guides/cli)
- [Railway: Deployments](https://docs.railway.com/guides/services)
- [Railway: Dockerfile deploys](https://docs.railway.com/reference/dockerfiles)
- [Railway: Config as code (`railway.toml`)](https://docs.railway.com/guides/config-as-code)
