# vbx/core porting notes

Source: `<old app repo>\<module>.py` (read-only). Every module was copied
byte for byte (original line endings kept: `banks`, `excel_io`, `finance`, `helpers`, `prices`,
`telegram_bot`, `telegram_parse` are CRLF in the old repo and stay CRLF; the others are LF). Then:

**Import rewrite (all modules).** Only lines that import one of the 16 copied modules changed:
`import x` -> `from . import x`, `import x as y` -> `from . import x as y`,
`from x import ...` -> `from .x import ...`. Nothing else was touched by the rewrite. Standard
library and third-party imports (werkzeug, openpyxl, markupsafe, yfinance) are unchanged.

Verify with: `diff <old>/<m>.py vbx/core/<m>.py` (the only `<`/`>` lines are the ones listed below).

| Module | Changes beyond import rewrites |
| --- | --- |
| config.py | none (byte-identical) |
| shared.py | none (byte-identical; it imports no local module) |
| tags.py | none (byte-identical). Still uses `markupsafe` (Markup/escape) for `linkify`; markupsafe is pinned in requirements.txt (werkzeug depends on it anyway). Flask is not needed. |
| integrations.py | none (byte-identical) |
| budget.py | none |
| finance.py | none |
| prices.py | none. The module-level price caches and locks (`_price_cache`, `_stock_price_cache`, `_fx_usd_cache`, `_coingecko_history_last_at`) and `FINNHUB_API_KEY` read at import keep their per-process semantics. |
| excel_io.py | none |
| telegram_bot.py | none. `TELEGRAM_BOT_TOKEN` is still read from the environment at import. |
| telegram_parse.py | none |
| telegram_ask.py | none |
| telegram_notify.py | none |
| backup.py | none besides the function-local import in `main()`: `from db import DB_PATH` -> `from .db import DB_PATH`. The command line becomes `python -m vbx.core.backup --label predeploy` (was `python -m backup`); the docstring still says the old form. |
| db.py | 1. `get_connection()` -> `get_connection(check_same_thread=True)`, passed through to `sqlite3.connect(DB_PATH, timeout=30.0, check_same_thread=check_same_thread)`. Default is the old behaviour; only `vbx.api.deps.get_db` passes `False`, because FastAPI may open the per-request connection, run the endpoint and close it on different threadpool threads (the connection is still used by one request at a time). PRAGMAs, WAL attempt, busy timeout and error text are unchanged. 2. `DB_PATH` is still computed once at import from `DATABASE_PATH` / `VB_DATABASE_PATH` / `"database.db"` (relative to the working directory, as before), so the env var must be set before `vbx.core.db` is first imported (tests/conftest.py does this). `_wal_attempted` stays a per-process flag. `init_db()` and every `migrate_*` function are unchanged. |
| banks.py | `_LOGO_DIR` now points one directory up: `os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "banks")`, i.e. `backend/vbx/static/banks/`, where the 12 logo files from the old `static/banks/` were copied unchanged. `_logo_url()` still returns `/static/banks/<slug>.<ext>`; `vbx/api/main.py` mounts that folder at `/static/banks`. |
| helpers.py | See below. |

## helpers.py

Removed: `from flask import flash, redirect, request, session, url_for`.

Changed signatures (same body otherwise):

- `get_csrf_token()` -> `get_csrf_token(session)`: takes the session mapping (Starlette's
  `request.session`) instead of Flask's global `session`. Same logic: reuse `_csrf_token` or store a
  new `secrets.token_urlsafe(32)`.
- `resolve_month_filter_from_request()` -> `resolve_month_filter_from_request(args)`: every
  `request.args.get(...)` became `args.get(...)` (3 places). Pass `request.query_params` or a dict.
- `resolve_list_month_filter(legacy_key, year_key, month_key)` ->
  `resolve_list_month_filter(args, legacy_key, year_key, month_key)`: every `request.args.get(...)`
  became `args.get(...)` (5 places).

Dropped (no meaning in a JSON API):

- `resolve_active_panel()` (panel from `?panel=`, `next_panel` form field or the Referer).
- `redirect_home(panel=None, settings_section=None)` (flash + redirect back to the dashboard).
- `_stock_redirect()` (a `redirect_home` shortcut).
- `_integrations_from_request()`: it wrapped `integrations.parse_integration_form(request.form)` and
  `flash`ed the `ValueError`. Routers call `integrations.parse_integration_form(mapping)` directly
  and turn the `ValueError` into `ApiError(400, str(exc))`.

Unchanged and still present: every other function, including the `request.form`-free ones that
already took a `form` argument (`_parse_recurring_duration(form)`, `_parse_recurring_schedule(form)`;
they only use `form.get(...)` and `"start_date" in form`, so a dict works). The now-unused imports
`urlparse`, `quote`, `timezone` and `from . import integrations` were left in place to keep the diff
minimal (ruff does not lint vbx/core).

## Behaviour notes for router authors (not changes)

- `db.init_db()` on a brand-new database runs `migrate_users_multitenancy`, which creates a user
  `admin` with password `VB_LEGACY_ADMIN_PASSWORD` (default `changeme`) and gives it the
  pre-multi-user "General"/"Main" rows. This is old-app behaviour, unchanged. First registered user
  therefore gets id 2 on a fresh database.
- On a very old single-user database that still has expense rows, `migrate_users_multitenancy`
  fails with `FOREIGN KEY constraint failed` at `DROP TABLE categories` (foreign keys are on and the
  rebuilt `expenses` table references `categories`). Unchanged old behaviour; production databases
  are already past this migration.

## Old route behaviour changed in the API (documented per router)

### routers/auth.py (old routes/auth.py)

- Login, register and logout require the `X-CSRF-Token` header like every non-GET `/api` request
  (old: `_csrf_token` form field or the same header). A failed check is 403
  `Invalid or missing CSRF token.` (old: 400 with the same text).
- Login while already logged in: the old route redirected without checking anything; the API always
  checks the credentials and switches the session to the user who logged in.
- Register while already logged in: old redirected to the dashboard without creating an account; the
  API answers 400 `Already logged in. Log out to create another account.`
- Registration disabled: 403 `Registration is disabled.` (old: flash + redirect to login).
- Validation messages are the old flash texts, as 400. Duplicate username: 400
  `That username is already taken.` Wrong credentials: 401 `Invalid username or password.`
- Logout when not logged in: 200 `{"ok": true}` (old: redirect to login by `_require_login`).
- Session cookie is `vbx_session` (Starlette, itsdangerous-signed) instead of Flask's `session`
  cookie, so sessions from the old app do not carry over: users log in once. Expiry is `Max-Age`
  365 days, refreshed on every response that touches the session.
- Not logged in on a protected endpoint: 401 `Not logged in.` (old: redirect to `/login`).

### routers/expenses.py (old routes/expenses.py + expenses list in routes/dashboard.py)

- Missing `category_id` or `account_id` (blank): old route silently redirected and saved nothing;
  the API answers 400 `Choose a category and an account.` (new message).
- Non-integer ids, or a category/account the user does not own: 400 `Invalid category or account.`
  (old flash text).
- PUT/DELETE of an expense that does not exist or is not the user's: 404 `Expense not found.` (old:
  the UPDATE/DELETE matched no row and the redirect looked like success).
- Amount: `normalize_expense_amount` as before (stored signed as sent; unparsable -> 0.0); notes
  stripped; `spent_at` through `normalize_txn_day_from_form` (blank -> today).
- List: same SQL, filters and `LIST_PAGE_SIZE` pagination as the old panel; filters are plain
  `month`, `category_id`, `page` query parameters (old: `exp_month` or `exp_cal_year`+`exp_cal_month`,
  `exp_category`, `exp_page`). The old panel showed no month total, so none is returned.
