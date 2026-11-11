# Parity report: old Flask app vs new FastAPI app

The differential harness in `parity/` drives the OLD app (`..\Vibe-Budgeting`, read-only) and the
NEW app (`backend/vbx`) through the same scenarios, each on its own copy of the same starting
database, and compares (a) every table of the two databases, (b) how each app answered every step,
(c) what each app shows on its read screens. This file is the hand-written summary; every run also
writes the full machine report to `parity/out/report.md` (+ `findings.json`, gitignored).

## Result of the last full run (2026-11-11, modes a, b1, b3, b2, c1, c2)

| | count |
| --- | --- |
| scenarios | 9 (a; b1; 4 x b3; b2; c1; c2) |
| steps (one user action, executed on both apps) | 919 |
| full-database comparisons (all tables + schema, both DBs) | 567 |
| read screens / endpoints compared | 971 |
| individual read values compared exactly (old render context vs new JSON) | 99,754 |
| values read back from the old rendered HTML and compared | 2,348 |
| allow-listed (documented) response differences hit | 35 (+16 DB rows of the old lock bug in b3) |
| **undocumented differences** | **23 findings, all from 3 root causes (NB-1, NB-2, NB-3 below)** |

Everything else is identical: every stored row (ids, amounts as stored, dates, recurring postings,
shared splits/links, budgets, month prices written by the reports), every number on Home,
Consolidated, Yearly, Budget, the lists, Recurring, Transfers, Shared, Investments and Reports, the
Excel export cell by cell, and the result of importing that export. Modes c1 and c2 (a database
written only by one app, opened by the other) found no difference at all. The harness is sensitive:
its first runs found more than 1,500 differences, all traced to harness problems or to the old
app's leaked write lock (now isolated in b3); see "Harness problems found and fixed".

`parity/test_parity.py` therefore currently FAILS, by design, on NB-1..NB-3: they are real and are
not allow-listed.

Mode d (real database) was not run: `VBX_PARITY_REAL_DB` is not set. Its mechanism was smoke-tested
once on the synthetic b2 database (3 users, 326 screens, 47,633 values, output redacted). That run
showed one harness bug (an unaccepted group invitation was reported although both apps agreed),
fixed afterwards; mode d was not re-run after the fix.

## How to run

One-time setup (the old app's own dependencies, in a venv that lives in `parity/`, nothing is
installed into the old repo):

```
python -m venv parity\.venv-old
parity\.venv-old\Scripts\python -m pip install -r ..\Vibe-Budgeting\requirements.txt
```

The new side uses `backend\.venv` (httpx, openpyxl, werkzeug and pytest are already there).

```
backend\.venv\Scripts\python -B parity\run.py                # modes a, b1, b3, b2, c (+ d when VBX_PARITY_REAL_DB is set); about 30-45 min
backend\.venv\Scripts\python -B parity\run.py --quick        # a, b1, b3 only (about 15 min)
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

### Compared

| Area | How | Where |
| --- | --- | --- |
| Database | `sqlite_master` (DDL, whitespace-normalised) and every table, every column, ordered by primary key, values and SQLite storage types exact; normalisations listed above | after every step in a, b1, b3; every 25 steps and at the end in b2; on open and after the reads in c1/c2 |
| Responses | accepted vs rejected (old: redirect without an error flash; new: 2xx), 5xx on either side, old flash text vs new `detail`/`message` | every step |
| Invalid input | each side's DB dumped before/after every step marked "reject" and checked unchanged | about 70 invalid steps in b1/b3/import |
| Bootstrap | categories, income categories, accounts with balances and card status, totals, tag names, recent tag chips, budget flag | per user |
| Home | income/expenses/net, every account balance and card status (owed, credit, limit, available, used %, level, statement amount/paid/remaining/closed/due/state), cash/cards/net totals, balance scope, has_cards, budget card | 6-10 months incl. current, past, future and a month before any data; **also read from the HTML** (hero, pills, balance rows, card "available of", subtotals) |
| Consolidated (summary) | totals, income and expense breakdowns, budget table (rows, unbudgeted, "everything else"), balances | same months; **also from the HTML** (3 cards, 3 tables) |
| Yearly | all 12 rows (income, expenses, delta, total balance) and totals | 2-3 years incl. an empty year; **also from the HTML** |
| Budget | enabled, summary (rows, unbudgeted, other, totals, %, status, over, cleared), form rows (order, default, 3-month avg, active, fixed), other_amount, month snapshots, and the template arithmetic recomputed with the template's own formulas (defaults total, has-any-default, can-clear-month, cleared-month spent) | same months |
| Accounts (Settings > banks) | every account incl. card settings, balance for the month, card status, totals | same months |
| Categories | both lists, order | per user |
| Expense / income lists | rows (all columns), order, total, pages, page, month and category filter in effect | 6 month filters (incl. far future and garbage) x 4 category filters (incl. a foreign id), pages 1/2/99 |
| Recurring | every rule field | per user |
| Transfers | log (limit 10), form defaults, "Pay card" pre-fill for every card | per user and card |
| Shared | overview (contacts, invitations, groups, friend balances, owed/owe/net, ledger account, split methods) and every group the user sees (members, suggestions, activity with splits/effects/record state/edit payload, totals, addable contacts) | per user and group |
| Investments | crypto and stock holdings (qty, cost, avg, price, 24h, value, P&L), totals, prices_loaded, transaction history, Finnhub flag | per user, deterministic fake quotes |
| Reports | overview (cash-flow table and KPIs, bank balance, crypto/stock value, account label); bank-balance and cash-flow charts by regenerating the old SVG geometry (dots, points, bars, titles, ticks) from the new series and range; spending ranking and category x month pivot; tags (all, every tag's detail, a missing tag); investment charts | 2-3 years, plus up to 3 account filters per year |
| Settings > Integrations | AI settings; Telegram enabled / token set / bot name / link / default account / active link-code expiry / notification prefs | per user |
| Excel | export workbook cell by cell (values and types; `created_at` with the timestamp tolerance; workbook properties ignored), migration template, the old export imported into a third user (merge, merge again, replace + sync opening balances) and 4 invalid uploads | b1, b2 |
| Cross-opening | DB written by one app only, opened by the other (init_db/migrations), all the screens above | c1, c2 |

### Not compared (gaps)

1. **Telegram bot and AI**: message parsing, receipts/OCR, the `/link` flow, budget/card/bill/
   weekly/monthly notifications, `telegram_entries`. These need Telegram/Ollama; the core modules
   are byte-identical copies, but nothing here drives them. Also not driven: saving/testing the bot
   token, AI "test connection", the Ollama model list (`raw_sql` creates the linked chat instead).
2. **Search endpoints** (`/stocks/search`, `/crypto/search`): external services.
3. **Background jobs**: poller, nightly backup, `python -m backup`.
4. **Price refresh / cache behaviour**: `refresh_prices=1` / `refresh_stock_prices=1` vs
   `refresh_crypto` / `refresh_stocks`, the cache-only view (`live=false`, old non-investment
   panels), the "prices age" text, TTL expiry. Only the live view with deterministic quotes is
   compared.
5. **Fields present on one side only** (every run lists them under "Read-side fields present on one
   side only"): new-only `accounts.bank/can_pay/is_credit_card/opening_balance_input`,
   `budget.summary.other/over[].category_id/default/override`, investment transaction `total`,
   recurring `category_choice`, cash-flow `active`, shared `own_accounts`, group
   `expense_defaults`/`settlement_defaults`, transfer `from/to_account_id`. On Home, Summary and
   Bootstrap the comparison is projected onto the old keys, so the new-only `bank` badge,
   `is_credit_card`, `balance_cutoff`, `balance_as_of`, `through_today` and `opening_balance` are not
   compared there either. Old-only: `budget.summary.by_category` (same data as `rows`).
6. **HTML**: only Home, Consolidated and Yearly are parsed from the rendered page. Every other screen
   is compared through the exact values the template received (render context), so template-only
   wording, month names, bank logos, English hints and the € / $ formatting are not compared there.
   The new frontend is out of scope: a rendering mistake in `frontend/` would not be caught.
7. **Old query-parameter variants**: `cal_year`/`cal_month`, `exp_cal_*`/`inc_cal_*`, legacy panel
   and report-section names (`/api/reports/section`), `?panel=export|migration`.
8. **Auth mechanics**: cookie lifetime, CSRF failures, `next` redirects, login while logged in.
9. **Inputs that make either app 500**, other than the 4 IntegrityError cases of b3: NaN/inf
   amounts, year 0000/99999 (A.md §6, B.md §6, D.md §6; ported unchanged, not exercised).
10. **Time**: both clocks frozen at 2026-11-10 12:00 UTC. Other "today"s (the 1st, the 31st,
    31 December, a leap day) are only exercised through data dates, not through a different clock.
11. **Concurrency** (parallel writers, several workers) and large uploads.
12. **Very old databases** (pre-multi-user schema): c1/c2 only open databases written by the current
    versions; the legacy migration path is not exercised.
13. **Mode d** has not been run on a real database (see above).

## Allow-list (documented intentional deviations)

Only response behaviour (accepted vs rejected, message wording) is ever allow-listed; DB tables and
read-side numbers are never allow-listed, with the single exception noted for scenario b3 (an OLD bug).
Steps that hit an entry are still DB-compared: in every case below both databases stayed equal.

| Id | Actions | Reason | Source |
| --- | --- | --- | --- |
| `blank-category-or-account-400` | expense/income add/edit | Old silently redirected, new 400 "Choose a category and an account."; nothing saved on either side | PORTING_NOTES.md (routers/expenses.py); A.md §4 |
| `not-found-404` | edit/delete of expenses, income, categories, accounts, recurring, stock/crypto | Missing or foreign row: old matched nothing and redirected, new 404; DBs unchanged | PORTING_NOTES.md; A.md §4; D.md §4 |
| `blank-name-400` | category / income category / account add, edit | Old silent no-op, new 400 "Enter a name." | A.md §4 |
| `duplicate-name-400` | same | Old INSERT OR IGNORE no-op (add) or 500 (rename), new 400 | A.md §4 |
| `account-in-use-400` | account delete | Old 500, new 400; nothing deleted | A.md §4 |
| `blank-transfer-accounts-400` | transfer add | Old silent no-op, new 400 | A.md §4 |
| `success-object-instead-of-flash` | any | Old success flash vs a 2xx body with the object and no message | ARCHITECTURE.md, API conventions |
| `random-link-code` | link code | Messages equal once the random 8-character code is masked | E.md §2 |
| `register-already-logged-in` | register | Old redirect, new 400; no account on either side | PORTING_NOTES.md (routers/auth.py) |
| `old-leaked-write-lock` (+ its DB rows, scenario b3 only) | the write after an old 500 | OLD bug: the old route leaks its write lock after the IntegrityError, so the next write of that process fails; the new app is correct | A.md §6 |

Every entry is in `parity/allowlist.py` with its matching rule. None matches a DB table (except the
b3 old-bug rows) or a read-side number.

## Real parity bugs found in the new app

Three, all minor. None changes a money amount.

### NB-1: the user's own "You" person is not created on app load

- Scenario a, step 6 (`alice: load`); also b1 step 6, b2 (user carol after the import), b3.
- Old: the first dashboard load inserts `shared_people (id 1, user 2, 'You', is_self 1,
  linked_user_id 2)`. New: no row until `GET /api/shared` or a shared mutation, so `shared_people`
  and `sqlite_sequence` differ from then on. In b1, before the Shared screen was opened first, every
  shared id (members, splits, payers, settlements) differed as a consequence. The scenarios now open
  Shared once right after registering, so the shared logic itself stays comparable.
- Old code: `routes/dashboard.py::index` calls `shared.panel_context(conn, uid, ...)` on every page,
  which calls `shared.ensure_self` (shared.py:1029) and commits.
- New code: `backend/vbx/api/routers/bootstrap.py::bootstrap` does not. Only
  `routers/shared.py::overview`/`group_detail` and the shared mutations reach `ensure_self`.
- Effect: different `shared_people` ids and order for the same history. This is cosmetic in the UI,
  but a contact typed before the self row exists gets a lower id, and a contact literally named "You"
  is later adopted as the self row by `ensure_self`'s clash branch. Fix: call
  `shared.ensure_self(conn, uid)` in bootstrap (it already commits).

### NB-2: `cleared_total_spent` is set on cleared months that still have overrides

- Scenario b1, read budget 2026-09 [alice]: old `None`, new `9.99`. Scenario b2, read budget
  2025-12 [alice]: old `None`, new `2309.68`.
- Old: `templates/panels/_budget.html` lines 43-44 compute and show the "No budget for <month>" hero
  only when `budget_summary.cleared and not budget_summary.rows`.
- New: `backend/vbx/api/services/budget.py::budget_panel` sets it whenever `cleared` (`if cleared:`);
  it is missing `and not budget_summary["rows"]`.
- Effect: a frontend that shows the cleared-month hero when `cleared_total_spent` is not null would
  show it for a cleared month that has per-month overrides, where the old page showed the normal
  budget table. The numbers in `summary` are identical.

### NB-3: import with an empty file field gives a raw validation error

- Scenario b1 step 239 and b2 step 626 (`carol: import_excel` with a file part whose filename is
  empty, which is what a browser sends when the form is submitted without choosing a file).
- Old: flash "Choose an Excel file (.xlsx).". New: 400 `file: Value error, Expected UploadFile,
  received: <class 'str'>`. Nothing is imported on either side.
- New code: `backend/vbx/api/routers/data_io.py::import_excel` declares
  `file: UploadFile | None = File(None)`. Starlette turns a part with an empty filename into a plain
  string field, so FastAPI's validation rejects it before the handler's own
  `(file.filename or "").strip() == ""` check. docs/parity/E.md §4 says this case gives the old
  message. Fix: accept `UploadFile | str | None` and treat a string as "no file".

## Old-app bugs confirmed (ported or fixed, not parity bugs)

- Leaked write lock after an unhandled IntegrityError (account rename onto an existing name,
  category and income-category rename onto an existing name, deleting a referenced account). The old
  process answers 500, and its next write fails with "database is locked" after the 30 s busy
  timeout (scenario b3: all 4 cases reproduced). New: 400, and the connection is always closed.
- Budget override with a blank amount drops the override (B.md §6): both apps, identical.
- Editing a shared bill without `record_personal` removes the editor's own recording (C.md §6):
  both apps, identical (b1 "Taxi").
- Holdings fed newest-first (D.md §6): both apps, identical numbers.

## Harness problems found and fixed during the runs

- The old app's lock leak (above) poisoned every later write of the first feature run (more than
  1,500 cascading differences). Those inputs now run isolated in b3.
- `from __future__ import annotations` made FastAPI treat the `Request` of the new launcher's
  test-only login route as a query parameter (400), so mode c could not log in. Fixed.
- Comparator fixes: `created_at` tolerance in lists and in the Excel export; old register while
  logged in (no page with a CSRF token); "both apps show no group" for an unaccepted invitation; two
  scenario expectations (linking a contact to one's own login, or to a login already linked, is
  rejected by both apps).
