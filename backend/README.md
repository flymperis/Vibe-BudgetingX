# Vibe Budgeting X backend

FastAPI + raw sqlite3. Domain logic lives in `vbx/core` (copied from the old app, see
`vbx/core/PORTING_NOTES.md`); the JSON API lives in `vbx/api`. Rules: `../docs/ARCHITECTURE.md`.

## Setup (Windows, Python 3.12)

```
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
```

## Tests and lint

```
.venv\Scripts\python -m pytest -q
.venv\Scripts\ruff check vbx tests
.venv\Scripts\ruff format vbx tests    # vbx/core is excluded on purpose
```

## Run the server

```
set DATABASE_PATH=C:\path\outside\the\repo\database.db
set FLASK_SECRET_KEY=some-long-random-string
.venv\Scripts\python -m uvicorn vbx.api.main:app --port 5001
```

Environment (same names as the old app where they existed):

- `DATABASE_PATH` (or `VB_DATABASE_PATH`): SQLite file, default `database.db` in the working directory.
- `FLASK_SECRET_KEY`: session signing key; without it a random key is persisted in `secret_key`
  next to the database.
- `VB_SECURE_COOKIES=true`: mark the session cookie Secure (only behind HTTPS).
- `ALLOW_REGISTRATION` (default true), `FINNHUB_API_KEY`, `TELEGRAM_BOT_TOKEN`, `VB_BACKUP_*`.
- `VBX_STATIC_DIR`: built SPA to serve (default `../frontend/dist`, or `/app/static` when it exists).
- `VBX_ENABLE_JOBS=true`: clear the Telegram webhook at boot and start background jobs
  (`vbx/jobs.py`, currently a stub). Off by default so dev servers and tests stay offline.

Manual backup snapshot: `.venv\Scripts\python -m vbx.core.backup --label predeploy`.
