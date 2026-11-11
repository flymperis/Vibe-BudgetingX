# Parity report: old Flask app vs new FastAPI app

The differential harness in `parity/` drives the OLD app (`..\Vibe-Budgeting`, read-only) and the
NEW app (`backend/vbx`) through the same scenarios, each on its own copy of the same starting
database, and compares (a) every table of the two databases, (b) how each app answered every step,
(c) what each app shows on its read screens. This file is the hand-written summary; every run also
writes the full machine report to `parity/out/report.md` (+ `findings.json`, gitignored).

__RESULTS__

## How to run

One-time setup (the old app's own dependencies, in a venv that lives in `parity/`, nothing is
installed into the old repo):

```
python -m venv parity\.venv-old
parity\.venv-old\Scripts\python -m pip install -r ..\Vibe-Budgeting\requirements.txt
```

The new side uses `backend\.venv` (httpx, openpyxl, werkzeug and pytest are already there).

```
backend\.venv\Scripts\python -B parity\run.py                # modes a, b1, b3, b2, c (+ d when VBX_PARITY_REAL_DB is set); ~25 min
backend\.venv\Scripts\python -B parity\run.py --quick        # a, b1, b3 only (~12 min)
backend\.venv\Scripts\python -B parity\run.py --only b2 --only c
backend\.venv\Scripts\python -B -m pytest -q parity\test_parity.py          # = --quick; fails on any undocumented difference
set VBX_PARITY_FULL=1 & backend\.venv\Scripts\python -B -m pytest -q parity\test_parity.py
```

Exit code / pytest result: non-zero when there is any difference that is not in
`parity/allowlist.py`. Output: `parity/out/report.md`, `parity/out/findings.json`; server logs and
the temp databases stay in `%TEMP%\parity-*`.

Mode d (a real database, read side only):

```
set VBX_PARITY_REAL_DB=C:\path\to\a\copy\of\database.db
backend\.venv\Scripts\python -B parity\run.py --only d
```

The file is first snapshotted with the SQLite backup API into a temp folder; both apps run on two
further copies of that snapshot, never on the given file. Passwords are not needed: each launcher has
a test-only, localhost-only route `GET /__parity/login_as/<user id>` (old: a `before_request` hook in
`parity/launch_old.py`; new: two routes inserted in front of the app's routes by
`parity/launch_new.py`; nothing is added to `backend/` or to the old repo). Every user id in the
database is compared. In this mode the report carries no personal data: read differences show only
the field path and numbers (strings become `<str>`), DB differences only table, row position, first
column (the id) and numeric values; names of accounts, tags and groups in step labels are replaced by
`<name#n>`. Do not point it at the production file directly while the production app writes to it:
copy it first (it is opened read-only for the snapshot, but a copy is the safe habit).

## How it works

| Piece | File | What it does |
| --- | --- | --- |
| Old launcher | `parity/launch_old.py` | Runs the old app in `parity/.venv-old` with `-B` (no bytecode written into the old repo), cwd = a temp dir, `DATABASE_PATH` = temp copy (refuses any path inside the old repo), fixed `FLASK_SECRET_KEY`, `TZ=UTC`, werkzeug single-threaded server. `app.arm_background_jobs()` is never called (only gunicorn's `post_fork` and `python app.py` call it), so no Telegram poller and no backup scheduler. Captures the keyword arguments of the dashboard's `render_template` (`/__parity/context`). |
| New launcher | `parity/launch_new.py` | Runs `vbx.api.main.app` with uvicorn from `backend/.venv`, `VBX_ENABLE_JOBS=false`, no SPA, same env. |
| Shared fakes | `parity/fakeenv.py` | Applied identically in both processes: network guard (non-loopback `connect`/`getaddrinfo` raise, dead proxy, fake `yfinance` module); deterministic prices (CoinGecko simple/price + history through `urlopen`, Finnhub off, yfinance last price / month close, FX) as pure functions of (symbol, date) under the apps' unchanged caching code; offline Telegram `_telegram_api` / Ollama; **frozen clock**: `datetime`/`date` names in every app module are swapped for subclasses whose `now()/today()` return 2026-11-10 12:00 (override `VBX_PARITY_NOW`). |
| Clients | `parity/clients.py` | Old: browser-style form posts with the `_csrf_token` scraped from the HTML (as old `tests/conftest.py`), redirects not followed, flashes decoded from the session cookie. New: JSON with `X-CSRF-Token`. |
| DSL | `parity/actions.py`, `parity/scenarios.py` | One step = one user action, mapped to the old form POST and the new API call. Ids are symbolic (`cat("Food")`, `acc("Visa")`, `last("expenses")`, ...) and resolved against each side's own DB. `load` = old dashboard GET / new `GET /api/bootstrap` (both post due recurring entries). `raw_sql` applies the same SQL to both DBs (only used to create a linked Telegram chat, which no UI can do offline). |
| DB compare | `parity/dbdump.py` | `sqlite_master` (normalised whitespace) + every table ordered by primary key, every column, values and storage types exact (`1` vs `1.0` is a difference). |
| Read compare | `parity/readside.py`, `parity/run.py` | Old side twice: the exact render context and the rendered HTML (money filter parsed back, for Home, Consolidated and Yearly). New side: the endpoint JSON. |
| Allow-list | `parity/allowlist.py` | Documented deviations, response behaviour only (see below). |

Volatile values normalised in the DB comparison (and nowhere else): SQLite `CURRENT_TIMESTAMP`
columns (`created_at`, `updated_at`, `linked_at`, `fetched_at`, `sent_at`) compared within 300 s
(real wall clock, the apps write them moments apart); `users.password_hash` masked (salted; instead
each scenario user's hash is verified with `check_password_hash` on both sides);
`telegram_link_codes.code` masked and that table ordered by `(user_id, expires_at)` (random code).
The same timestamp tolerance applies to `created_at` in read lists and in the Excel export.

## Scenarios

| Mode | Scenario | Content |
| --- | --- | --- |
| a | empty DB | Freshly initialised databases compared (schema + legacy `admin` seed), then register (valid and 4 invalid), login/logout, default seeding, read side. |
| b1 | feature coverage | Every mutation both apps offer, valid and invalid, two/three users: accounts incl. credit cards (all card validation branches), categories and income categories (rename, duplicate, delete rules incl. "only a recurring rule"), expenses/income (junk amount, comma, bad/blank date, foreign ids, blank ids, refunds, abs), transfers, recurring rules of every interval type incl. the legacy form without `start_date`, posting on load, schedule edits, pause, delete; budgets (toggle, defaults with fixed/other, all-or-nothing rejects, overrides, clear/restore month, reset); shared (contacts, rename, link/unlink, groups, invite accept/decline, bills with each split method, record/unrecord, edit without record, settlements with/without recording, record by a non-party, member add/remove rules, group delete rules); investments (crypto/stock buy/sell/edit/delete, EUR/GBP listings, a coin without a price, invalid input, foreign ids); settings (AI save + 3 invalid, Telegram default account incl. foreign/junk/unlinked, notification prefs incl. invalid, link code, unlink). Then the read side for alice and bob (6 months, 2 years), Excel export compared cell by cell, migration template, and the old export imported into a third user on both sides (merge, merge again, replace + sync opening balances, 4 invalid uploads). DB compared after every step. |
| b3 | old 500 paths | The four inputs where the old route crashed with an IntegrityError and leaked its write lock, each in fresh processes, followed by one ordinary write. |
| b2 | rich random | Seeded (20261110) ~600 steps over 21 months: 6 accounts incl. 2 cards (statement day 31), 11 categories, 8 recurring rules (week/2 weeks/month/2 months/3 months/year/legacy), budgets with overrides and a cleared month, a shared group with a second user and ~10 bills of all split methods, 20+ investment transactions, edits/deletes. DB compared every 25 steps and at the end; read side for 10 months and 3 years; Excel round trip. |
| c1 | old-written DB opened by new | The b2 database written only by the old app, copied; the new app opens the copy, the old app keeps the original; DB compared on open, read side compared. |
| c2 | new-written DB opened by old | The same the other way round with the b2 database written by the new app. |
| d | real DB | Only with `VBX_PARITY_REAL_DB` (not set for the run below). |

## Coverage

__COVERAGE__

## Allow-list (documented intentional deviations)

Only response behaviour (accepted vs rejected, message wording) is ever allow-listed; DB tables and
read-side numbers are never allow-listed, with the single exception noted for scenario b3 (an OLD bug).
Steps that hit an entry are still DB-compared: in every case below both databases stayed equal.

__ALLOW__

## Real parity bugs found in the new app

__BUGS__

## Old-app bugs confirmed (ported or fixed, not parity bugs)

__OLDBUGS__
