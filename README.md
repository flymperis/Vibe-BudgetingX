# Vibe Budgeting X

The rewrite of [Vibe Budgeting](../Vibe-Budgeting): a FastAPI backend (`backend/`) and a React SPA with a
native-app feel (`frontend/`), on **the same SQLite database** as the old app. The schema does not change: a
database written by the old app opens here unchanged and the other way round. Rules for contributors are in
`docs/ARCHITECTURE.md`, the frontend contract in `docs/FRONTEND.md`.

## Run with Docker

```bash
mkdir -p budget-data
docker compose up --build -d
```

Open **http://localhost:5001**. Data is stored in `./budget-data` on the host (`database.db`, `secret_key`,
`backups/`). The container runs as uid 1000; on Linux make the folder writable for it
(`sudo chown 1000:1000 budget-data`, not needed with rootless Podman / Docker Desktop).

One image, two stages: Node builds the SPA, then `python:3.12-slim` runs uvicorn with **one worker** (the price
caches, the Telegram poller and the backup scheduler live in the process) and serves the SPA from `/app/static`.
Health check: `GET /api/auth/session`.

Environment variables (set them under `environment:` in `docker-compose.yml`; same names as the old app):

| Variable | Purpose |
| --- | --- |
| `TZ` | Time zone such as `Europe/Athens`: what "today" is for new entries and recurring postings, when Telegram reminders and backups run. Default UTC. |
| `FLASK_SECRET_KEY` | Session signing key. If unset, one is generated on first boot and kept next to the database as `secret_key` (the old app's file works). |
| `VB_SECURE_COOKIES` | `true` marks the session cookie `Secure` (only behind HTTPS). |
| `ALLOW_REGISTRATION` | `true` / `false`: allow creating accounts (default true). |
| `FINNHUB_API_KEY` | Free key from finnhub.io: stock symbol search in Investments → Stocks (prices come from Yahoo without it). |
| `TELEGRAM_BOT_TOKEN` | Fallback bot token when Settings → Integrations has none. |
| `VB_BACKUP_DIR`, `VB_BACKUP_KEEP_DAYS`, `VB_BACKUP_KEEP_MONTHS`, `VB_BACKUP_TIME` | Nightly backups, as in the old app (only with jobs on, see below). |
| `VBX_ENABLE_JOBS` | `true` starts the background jobs: Telegram bot polling and the nightly backup. **Default false.** |
| `DATABASE_PATH` | Default `/app/data/database.db`. |
| `VBX_PORT` | Host port in `docker-compose.yml` (default 5001). |

A backup by hand (keeps the newest 5 per label):

```bash
docker compose exec vibe-budgeting-x python -m vbx.core.backup --label predeploy
```

## Try the new app on a COPY of the old database

Never point the new app at the database the old app is using. Copy it (with the old app stopped, or take one of
its nightly backups, which are consistent snapshots):

```bash
mkdir -p budget-data
cp ../Vibe-Budgeting/budget-data/backups/vibe-budgeting-2026-11-10.db budget-data/database.db
cp ../Vibe-Budgeting/budget-data/secret_key budget-data/ 2>/dev/null || true   # optional: same sessions key
docker compose up --build -d
```

Log in with your usual username and password (password hashes are compatible). Old bookmarks and home-screen
links (`/?panel=reports&reports_section=tags&tag=…`, `/?panel=settings&settings_section=banks`, …) are
redirected to the matching new screens.

## What is deliberately not enabled yet

- **Background jobs are off** (`VBX_ENABLE_JOBS=false`): the old app still runs the Telegram bot and the nightly
  backups. Two pollers on the same bot would steal each other's messages and record entries twice. Turn the jobs
  on only after the old app is stopped for good.
- No service worker / offline mode (iOS needs HTTPS for it); the app is an installable PWA (manifest + icons).
- The Telegram bot token and the AI settings are server-wide, as in the old app (any logged-in user can change
  them; see `docs/parity/E.md`).

## Development

Backend (Python 3.12):

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt      # .venv/bin/python on Linux/macOS
DATABASE_PATH=/tmp/vbx-dev/database.db .venv/Scripts/python -m uvicorn vbx.api.main:app --port 5001
```

Frontend (Node 22):

```bash
cd frontend
npm ci
npm run dev          # Vite on :5173, /api and /static proxied to :5001 (VBX_API_TARGET to change)
```

Demo data for looking around (only against a throwaway database):

```bash
node frontend/e2e/seed/seed.mjs http://127.0.0.1:5001 demo   # user "demo", password in the script
```

Production-style without Docker: `npm run build`, then start the backend with `VBX_STATIC_DIR=../frontend/dist`;
it serves the SPA (with the index.html fallback for every client-side route) and the API on one port.

## Tests

```bash
cd backend
.venv/Scripts/python -m pytest -q
.venv/Scripts/ruff check vbx tests

cd frontend
npm run build
npm run lint
npm test            # Vitest, then scripts/pwa-check.mjs (builds into a temp dir and serves it with the backend)
npx playwright test # e2e: starts Vite on :5174 against the backend on :5001
VBX_E2E_BASE=http://127.0.0.1:5002 npx playwright test      # or against any running app (e.g. production build)
```

Every old test has a counterpart: `docs/TEST_PARITY.md`. The integration review (findings and fixes) is in
`docs/INTEGRATION_REVIEW.md`.
