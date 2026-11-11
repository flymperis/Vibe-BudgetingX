# Vibe Budgeting X — architecture and rules

This is the rewrite of Vibe Budgeting. The old app lives in `<old app repo>`
(Flask + Jinja + SQLite) and runs in production. **It is the specification.** The new app must do
everything the old one does, on the same database file, with a native-app-like UI.

## Hard rules (every contributor, human or agent)

1. **Never modify anything under `<old app repo>`.** Read it freely. Do not run
   its app against any database file that lives in that folder. Do not `git` commit/checkout there.
2. **Never touch the production server or any production data.** No SSH, no deploy.
3. **The database schema does not change.** Same tables, same columns, same meaning as the old app.
   A database written by the old app must open in the new app unchanged, and the other way round.
   If a feature seems to need a schema change, stop and report it; do not make it.
4. **Behaviour parity.** Validation rules, rounding, sign conventions, defaults, ownership checks and
   edge cases are ported from the old route/module code, not reinvented. When in doubt, read the old
   code and its tests and do exactly what they do.
5. **Every old test has a new counterpart.** `docs/TEST_PARITY.md` maps each old test function to the
   new test that covers it. No old test may be dropped silently.
6. Work only inside the files/directories your task names. Do not reformat or "improve" other areas.
7. No secrets, tokens or real user data in the repository. Test data is synthetic.
8. Do not commit; the orchestrator commits after reviewing.

## Layout

```
Vibe-BudgetingX/
  docs/                     ARCHITECTURE.md, PLAN.md, TEST_PARITY.md, API notes
  backend/
    requirements.txt        runtime deps (pinned)
    requirements-dev.txt    + pytest, httpx, ruff
    vbx/
      core/                 domain logic copied from the old app (see "Core")
      api/
        main.py             create_app(): middleware, router auto-discovery, static SPA
        deps.py             get_db, current_user, csrf check
        security.py         session cookie, secret key, password hashing
        errors.py           ApiError + handlers
        routers/<domain>.py one APIRouter per domain, variable name `router`
        schemas/<domain>.py Pydantic models per domain
      jobs.py               background jobs (Telegram poller, nightly backup)
    tests/                  pytest; conftest.py has the shared fixtures
  frontend/                 Vite + React + TypeScript SPA
  Dockerfile, docker-compose.yml
```

## Core (`backend/vbx/core/`)

The old top-level modules (`db.py`, `finance.py`, `budget.py`, `shared.py`, `tags.py`, `prices.py`,
`excel_io.py`, `integrations.py`, `telegram_*.py`, `backup.py`, `banks.py`, `config.py`, and the
non-Flask parts of `helpers.py`) are copied into `vbx.core` **with the smallest possible diff**:
imports become package-relative, Flask-specific bits (`request`, `flash`, `g`, `redirect`,
`render_template`) are removed or replaced by plain arguments/return values. SQL statements, maths
and business rules stay byte-for-byte where possible. `db.init_db()` and all `migrate_*` functions
are kept as they are: they are idempotent and are what makes an old database open cleanly.

Database path: `DATABASE_PATH` env var (same as the old app). Raw `sqlite3`, WAL, foreign keys on,
busy timeout — exactly as old `db.get_connection()`.

## API conventions

- Everything under `/api`. JSON in, JSON out. Field names `snake_case`.
- Errors: `{"detail": "<human message>"}` with 400 (validation), 401 (not logged in), 403 (CSRF or
  not allowed), 404 (not found or not owned — never reveal other users' rows). Raise
  `ApiError(status, message)`. Messages that the old app `flash`ed are reused as `detail`.
- Mutations that the old app answered with a flash + redirect return 200 with the affected object
  (or `{"ok": true, "message": "..."}` when there is none).
- Auth: signed session cookie (Starlette `SessionMiddleware`, cookie `vbx_session`, SameSite=Lax,
  HttpOnly, 365 days, `Secure` when `VB_SECURE_COOKIES=true`). Secret key resolution identical to
  the old app (`FLASK_SECRET_KEY` env, else `secret_key` file next to the DB). Passwords use
  werkzeug's `generate_password_hash` / `check_password_hash` so existing users can log in.
- CSRF: every non-GET request needs header `X-CSRF-Token` equal to the token stored in the session.
- Every query is scoped by the session's `user_id`. Ownership checks as in old `helpers.py`.
- Money: numbers as stored (SQLite REAL), sign conventions exactly as the old app stores them.
  Rounding to 2 decimals happens where the old code does it. Dates are `YYYY-MM-DD` strings,
  months `YYYY-MM`. "Today" follows the server's `TZ`, as in the old app.
- Endpoints are plain `def` (sync); one sqlite connection per request via `get_db`, closed always.
- Routers are auto-discovered: any module in `vbx/api/routers/` exposing `router` is mounted under
  `/api`. Do not edit `main.py` to add a router.
- External calls (Finnhub, CoinGecko, yfinance, Ollama, Telegram) go through `vbx.core` functions so
  tests can monkeypatch them. Tests never touch the network.

### Auth contract (fixed)

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | `/api/auth/session` | — | `{"user": {"id", "username"} or null, "csrf_token", "allow_registration"}` (always 200) |
| POST | `/api/auth/login` | `{"username","password"}` | `{"user", "csrf_token"}`; 401 `Invalid username or password.` |
| POST | `/api/auth/register` | `{"username","password","password2"}` | `{"user", "csrf_token"}`; 400/403 as old rules |
| POST | `/api/auth/logout` | — | `{"ok": true}` |
| GET | `/api/bootstrap` | — | reference data every screen needs: user, accounts (with type and current balance), expense and income categories, tag names, budget on/off, server "today" |

## Frontend conventions

- Vite, React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui components (Radix), `vaul` for
  bottom sheets, TanStack Query for server state, React Router, Recharts for charts, lucide icons.
- Mobile first: bottom tab bar (Home, Expenses, +, Reports, More), sheets for forms and details,
  safe-area insets, 44px touch targets. Desktop gets a sidebar layout with the same screens.
- Themes: light/dark plus colour themes via CSS variables (shadcn theme tokens). Stored per device.
- All text through `t()` from `src/i18n`; Greek (`el`, default) and English (`en`).
- Money formatted `1.527,08 €` (el-GR) through one `formatMoney` helper; USD for stock quotes.
- API types are generated from the backend's OpenAPI (`npm run gen:api` → `src/api/schema.d.ts`);
  no hand-written response types. One `api` client wrapper adds the CSRF header and maps errors
  to toasts.
- PWA: manifest + icons like the old app. No service worker in v1 (iOS needs HTTPS for it).
- Tests: Vitest + Testing Library for components/helpers; Playwright for end-to-end flows against
  the real backend with a temporary database.

## Definition of done for a feature

- API endpoints exist with Pydantic schemas, ported validation and ownership checks.
- Every old test for that feature has a passing new counterpart, listed in `docs/TEST_PARITY.md`.
- `pytest -q` is fully green, `ruff check` clean.
- Screen exists, covers every action the old panel offered, works at 390px width and on desktop,
  in light and dark, in Greek and English; `npm run build`, `npm run lint`, `npm test` pass.
