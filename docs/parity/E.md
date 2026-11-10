# Parity E: settings & integrations, Telegram bot, Excel export/import, background jobs

Files: `backend/vbx/api/routers/settings.py`, `backend/vbx/api/schemas/settings.py`,
`backend/vbx/api/routers/data_io.py`, `backend/vbx/jobs.py`; tests `tests/helpers_telegram.py`,
`tests/test_telegram_bot.py`, `tests/test_telegram_notify.py`, `tests/test_telegram_tags.py`,
`tests/test_settings_and_export.py`, `tests/test_export_import_roundtrip.py`, `tests/test_settings_api.py`,
`tests/test_data_io.py`, `tests/test_jobs.py`.

Counts: 59 old test functions in scope (34 telegram_bot + 9 telegram_notify + 5 settings_and_export +
4 export_import_roundtrip + 3 pwa_manifest + 4 Telegram tests of test_tags.py). **56 ported, 3
frontend-only, 0 pending.** New tests without an old counterpart: 1 in test_telegram_bot.py, 12
functions (19 cases) in test_settings_api.py, 10 in test_data_io.py, 6 in test_jobs.py.
`pytest -q` (whole suite, other agents' files included at the time of the run): 390 passed.

## 1. Old test -> new test

Network: the old suite's fakes are kept (`FakeTelegram` replaces `telegram_bot._telegram_api`,
`fake_ai` replaces `integrations.ollama_chat`). In addition `tests/helpers_telegram.py` replaces
`urlopen` in `vbx.core.telegram_bot` and `vbx.core.integrations` with a function that raises, for the
whole session, so any un-stubbed call fails loudly.

### test_telegram_bot.py -> tests/test_telegram_bot.py (same names, 1:1)

| Old test | New test | Notes |
| --- | --- | --- |
| test_amounts_skip_dates_times_units_and_percentages | same | 1:1 (pure) |
| test_dates_from_words_and_numbers | same | 1:1 (pure) |
| test_account_detection_handles_greek_greeklish_and_generic_words (9 cases) | same | 1:1, same 9 cases |
| test_basic_parser_splits_several_transactions_and_finds_income | same | 1:1 |
| test_history_beats_the_ai_and_keywords | same | 1:1 |
| test_ai_transactions_are_capped_to_the_amounts_written | same | 1:1 |
| test_unusable_ai_answer_falls_back_to_the_basic_parser | same | 1:1 |
| test_receipt_total_and_date_come_from_the_text | same | 1:1 |
| test_questions_are_told_apart_from_entries | same | 1:1 |
| test_text_without_ai_records_with_the_named_account | same | 1:1 via `telegram_bot.handle_update` |
| test_buttons_change_category_account_and_date_then_undo | same | 1:1 |
| test_undo_never_touches_entries_made_on_the_web | same | 1:1 (web row via SQL, as before); plus new `test_undo_never_touches_entries_made_through_the_api` (row created with POST /api/expenses) |
| test_several_transactions_in_one_message_with_ai | same | 1:1 |
| test_past_choices_are_offered_to_the_ai_and_override_it | same | the old test's first message (`efood 10`, AI on) really tried to reach `http://ollama` and fell back to the basic parser on the URLError; now a fake AI with no answer gives the same fallback offline |
| test_shared_bill_from_telegram_splits_and_books_my_share | same | group made with `shared.create_group/find_or_create_person/add_member` (what old POST /shared/groups/add did with `new_members`) instead of the shared router |
| test_questions_are_answered_from_the_database | same | 1:1 |
| test_receipt_photo_is_read_and_recorded | same | 1:1 |
| test_receipts_need_an_ocr_model | same | 1:1 |
| test_default_account_command | same | 1:1 |
| test_other_chats_cannot_press_my_buttons | same | second user via a fresh `TestClient(app)` |
| test_edited_messages_are_ignored | same | 1:1 |
| test_ocr_model_is_saved_from_settings | same | PUT /api/settings/integrations/ai; the old "settings page has an ai_ocr_model field" became `GET /api/settings/integrations` -> `ai.ai_ocr_model == "glm-ocr"` |
| test_categories_match_whatever_the_user_named_them (7 cases) | same | 1:1 |
| test_a_category_written_in_the_message_is_used | same | 1:1 |
| test_catch_all_is_the_users_own | same | 1:1 |
| test_bot_uses_renamed_categories_and_creates_none | same | 1:1 |
| test_counts_of_months_or_times_are_not_amounts | same | 1:1 |
| test_the_ais_repeat_is_kept_only_when_it_makes_sense | same | 1:1 |
| test_a_repeating_entry_may_start_later_but_a_one_off_may_not | same | 1:1 |
| test_recurring_message_creates_a_rule_and_its_first_entry | same | 1:1 |
| test_recurring_income_without_end_starting_next_month | same | 1:1 |
| test_shared_bills_cannot_repeat | same | group via core functions (see above) |
| test_old_telegram_entries_table_gains_the_recurring_kind | same | 1:1 |
| test_the_amount_written_beats_the_ais_reading_of_it | same | 1:1 |

### test_telegram_notify.py -> tests/test_telegram_notify.py (same names)

| Old test | New test | Notes |
| --- | --- | --- |
| test_budget_alerts_once_per_threshold_and_not_at_night | same | 1:1 |
| test_no_budget_alerts_when_budgets_are_off_or_alerts_disabled | same | 1:1 |
| test_bot_entry_that_crosses_a_budget_gets_an_alert_right_away | same | 1:1 |
| test_card_reminders_before_on_and_after_the_due_day_until_paid | same | 1:1 |
| test_bill_reminder_the_day_before_with_a_shortfall_warning | same | 1:1 |
| test_weekly_summary_only_on_sunday_evening | same | 1:1 |
| test_monthly_summary_on_the_first_with_catch_up | same | 1:1 |
| test_notifications_command_toggles_each_kind | same | 1:1 |
| test_notification_settings_form | same | PUT /api/settings/telegram/notifications (old 302 -> 200 with the saved prefs); same prefs assertion; "page shows notify_weekly + card_days=5 once a bot exists" -> `GET /api/settings/integrations`: `telegram.enabled`, `"weekly"` in `notify_kinds`, `notify_prefs.card_days == 5` |

### test_settings_and_export.py -> tests/test_settings_and_export.py (same names)

| Old test | New test | Notes |
| --- | --- | --- |
| test_settings_sections_load | same | old: each `?panel=settings&settings_section=` page 200. New: the data of each section answers 200: bootstrap, `/api/accounts` (banks), `/api/categories` (expenses), `/api/income-categories` (income), `/api/settings/integrations`, both downloads (export, migration). `general` is client-only (theme). |
| test_income_category_add_edit_delete | same | through the categories agent's `/api/income-categories` POST/PUT/DELETE; DB assertions unchanged |
| test_account_edit_and_delete | same | through the accounts agent's `/api/accounts` POST/PUT/DELETE; DB assertions unchanged |
| test_integrations_save | same | PUT /api/settings/integrations/ai |
| test_excel_export_downloads | same | `/api/export/excel` (spreadsheetml, `PK`), `/api/export/migration-template` (`PK`) |

### test_export_import_roundtrip.py -> tests/test_export_import_roundtrip.py (same names)

Seeding uses the SQL the old routes ran (accounts, expenses, income, transfers, stocks, crypto, a
recurring rule with `legacy_recurring_start`), and "load the dashboard" is
`finance.apply_recurring_entries` + commit, exactly what old `GET /` did. Export/import go through
the new API (multipart upload).

| Old test | New test | Notes |
| --- | --- | --- |
| test_export_covers_every_sheet | same | 1:1 assertions |
| test_export_import_round_trip_preserves_everything | same | `"Import failed" not in resp.text` + status 200 |
| test_restored_recurring_rule_does_not_repost | same | 1:1 |
| test_version_1_workbook_still_imports | same | 1:1 |

### test_tags.py (Telegram half) -> tests/test_telegram_tags.py

| Old test | New test | Notes |
| --- | --- | --- |
| test_tags.py::test_telegram_keeps_tags_and_still_finds_the_category | tests/test_telegram_tags.py::test_telegram_keeps_tags_and_still_finds_the_category | 1:1 |
| test_tags.py::test_tag_mode_tags_every_entry_until_turned_off | tests/test_telegram_tags.py::test_tag_mode_tags_every_entry_until_turned_off | 1:1 |
| test_tags.py::test_questions_and_tags_command | tests/test_telegram_tags.py::test_questions_and_tags_command | 1:1 |
| test_tags.py::test_shared_bill_keeps_its_tag_in_my_share | tests/test_telegram_tags.py::test_shared_bill_keeps_its_tag_in_my_share | group via core functions |

### Frontend-only: test_pwa_manifest.py

| Old test | What the frontend must guarantee |
| --- | --- |
| test_manifest_served_without_login | The built SPA ships `manifest.webmanifest`; it is served without login with `Content-Type: application/manifest+json` (main.py already registers the `.webmanifest` type and serves dist files without auth; a Playwright/HTTP check against the built dist should assert both). |
| test_manifest_is_valid_standalone_manifest_with_icons_on_disk | The manifest parses as JSON with `display: "standalone"`, `name: "Vibe Budgeting"` (or the agreed new name, decided by the orchestrator), a non-empty `icons` list, and every `icons[].src` exists in the built dist. |
| test_login_page_links_manifest_and_apple_touch_icon | `index.html` (the login screen is the SPA) contains `rel="manifest"` pointing at `manifest.webmanifest` and `rel="apple-touch-icon"` pointing at `apple-touch-icon.png`, which exists in dist. |

### Excel-related rows of other domains (not mine, not ported here)

`test_budget.py` export/import rows, `test_credit_cards.py::test_card_settings_survive_export_import`,
`test_recurring_intervals.py::test_interval_round_trips_through_export_and_import` and
`::test_workbook_without_interval_columns_imports_as_monthly` belong to the budget / credit-card /
recurring agents. They can use `GET /api/export/excel` and `POST /api/import/excel`
(multipart `file`, `replace_movements=1`, `sync_opening_balances=1`) described below; the multipart
call pattern is `api.post("/api/import/excel", files={"file": (name, bytes, XLSX)}, data={...})`.

## 2. Endpoints

All need login (401 `Not logged in.`) and, for non-GET, the CSRF header (403).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/settings/integrations` | Settings -> Integrations: `ai` (enabled, provider, base URL, model, timeout, OCR model), `telegram` (`bot_token_set`, `enabled`, `bot_username` via getMe when enabled, `linked`, `link` {telegram_username, linked_at, default_account_id/name}, active `link_code` {code, expires_at}, `notify_prefs`, `notify_kinds` [{kind,label}] in display order). The bot token is never returned. |
| PUT | `/api/settings/integrations/ai` | Save AI settings (`integrations.parse_integration_form` rules). 200 `{ok, message: "Integration settings saved.", settings}`; 400 with the old ValueError text. |
| POST | `/api/settings/integrations/ai/test` | Test the typed settings (nothing saved). 200 `{ok, message}` with `ok=false` when the connection test fails; 400 for an invalid form. |
| GET | `/api/settings/integrations/ai/models?base_url=` | Ollama model list `{models: [...]}`. 400 `Base URL is required.` / scheme error; 502 `Ollama responded with HTTP n.` / `Could not reach Ollama: ...` / `Connection failed: ...`. |
| PUT | `/api/settings/telegram/server` | Save the bot token (blank keeps the saved one; none at all -> 400 `Bot token is required`), then clear the webhook. 200 `{ok, message, webhook_ok, webhook_message, bot_token_set}`. |
| POST | `/api/settings/telegram/test` | getMe with the typed (or saved) token. 200 `{ok, message}` (`Connected to @name` or Telegram's error). |
| POST | `/api/settings/telegram/link-code` | New 8-char link code (replaces any previous one), 15 min. 200 `{ok, message, code, expires_at}`; 400 `Configure the Telegram bot below first.` when no bot. |
| POST | `/api/settings/telegram/unlink` | Remove the link and any codes. `{ok, message: "Telegram unlinked."}` |
| PUT | `/api/settings/telegram/default-account` | `{default_account_id}` (null/blank = first account). 400 `Could not update default account.` for junk ids, another user's account, or no linked chat. |
| PUT | `/api/settings/telegram/notifications` | `{budget, cards, bills, weekly, monthly, card_days}`; a kind is on only when `true`/`"1"`; card_days 1..14 (omitted = 3). 200 `{ok, message, prefs}`; 400 with the old messages. |
| GET | `/api/export/excel` | Workbook download `budget-export-YYYYMMDD-HHMM.xlsx` (attachment, `no-cache, max-age=0`). |
| GET | `/api/export/migration-template` | Empty import template `budget-migration-template.xlsx`. |
| POST | `/api/import/excel` | multipart `file` + optional `replace_movements=1`, `sync_opening_balances=1`. 200 `{ok, message}` (old success text, merge or replace variant); 400 `Choose an Excel file (.xlsx).`, `The uploaded file is empty.`, `Could not read the Excel file: ...`, `Import failed. <first 8 errors>; ... (+N more)`. All or nothing (core `_run_import_workbook`, its own connection and transaction). |

Background jobs: `vbx.jobs.start_background_jobs()` (called by the existing lifespan hook when
`VBX_ENABLE_JOBS=true`) starts `telegram_bot.start_poller(db.get_connection,
finance.fetch_account_balances_through, <db dir>/telegram_poll.lock)` once per process (double-checked
lock as the old `arm_telegram_poller`) and `backup.start_scheduler(DB_PATH)` (own once-per-process
guard; off with `VB_BACKUP_KEEP_DAYS=0`). It also checks the flag itself (returns False when off).
`python -m vbx.core.backup --label X` works (tested as a subprocess).

## 3. Core changes

None. `telegram_bot`, `telegram_parse`, `telegram_ask`, `telegram_notify`, `integrations`,
`excel_io`, `backup` are used unchanged. I checked the bot code for Flask dependencies: there are none
(it never called routes or the app object; it only takes `get_connection` and the balance function as
arguments, which `jobs.py` passes like old `app.py` did). Its user-facing texts still say
"Settings → Integrations", which is still where the new UI should put these settings.

## 4. Deviations from old behaviour

- Old form posts + flash + redirect became JSON endpoints (paths above). Flash messages are kept
  verbatim as `message`/`detail`.
- "Test connection" (AI and Telegram): the old route flashed the result as success or error; the API
  answers 200 `{ok: false, message}` for a failed test (the request itself was fine) and keeps 400
  for an invalid form.
- Models endpoint: errors are `{"detail": ...}` (old `{"error": ...}`), same status codes (400/502)
  and texts.
- Saving the bot token answered with two flashes; now one object with `message` + `webhook_ok` /
  `webhook_message`.
- Link code: also returns `code` and `expires_at` separately (old: only inside the flash text).
- JSON bodies: checkboxes accept `true` or `"1"` (old: `"1"` only); any other value is "off", as an
  unticked box was.
- Import: errors are 400 (old: flash + redirect, 302). A `file` part with a blank filename and a
  missing part both give `Choose an Excel file (.xlsx).` as before.
- `GET /api/settings/integrations` calls Telegram getMe whenever a bot is configured, as the old
  dashboard did when the integrations section was opened (this endpoint is that section).
- Bot usernames etc. are not HTML-escaped (JSON); `linked_at` is returned whole (the page showed
  the first 10 characters) and `expires_at` whole (the page showed 16 with `T` -> space).

## 5. Requests / open questions

- `main.py`: no change needed. The lifespan hook (`if jobs.jobs_enabled(): jobs.start_background_jobs()`)
  is sufficient; `start_background_jobs` is idempotent and re-checks the flag.
- Deployment (Dockerfile/compose, whoever owns them): run a **single uvicorn worker** (old: gunicorn
  `-w 1 --worker-class gthread --threads 4 --preload`) because price caches and the job threads are
  per process; set `VBX_ENABLE_JOBS=true`; the database directory must be writable (poll lock file,
  `backups/`). With several workers only one would poll (fcntl lock) but each would run a backup
  scheduler, as in the old app.
- `tests/test_settings_and_export.py::test_income_category_add_edit_delete` and
  `::test_account_edit_and_delete` call the categories/accounts agents' endpoints (POST/PUT/DELETE
  `/api/income-categories`, `/api/accounts`, body `{"name", "opening_balance"}`). If those contracts
  change, these two tests need the same change.
- The owner of `tests/test_tags.py` should not port the four Telegram tests again (they are in
  `tests/test_telegram_tags.py`).
- Orchestrator: update `docs/TEST_PARITY.md` rows from section 1 (I did not edit it).

## 6. Suspected old bugs (ported unchanged)

- **The Telegram bot token is server-wide, but any logged-in user can replace it, test it, or clear
  its webhook** (`PUT /api/settings/telegram/server`, `POST /api/settings/telegram/test`). With
  registration open, another user can hijack the bot. Same as the old app.
- Without `fcntl` (Windows), the poll lock is an `O_EXCL` file that `_poll_loop` never deletes, so
  after the first run the poller never starts again until `telegram_poll.lock` is removed by hand.
  Production runs on Linux (fcntl), so this only affects running the jobs on Windows.
- `_run_import_workbook` builds "Missing sheets: ..." from a set, so with several sheets missing the
  order of names varies between runs.
- The old `test_past_choices_are_offered_to_the_ai_and_override_it` silently depended on
  `http://ollama` being unreachable (it made a real network attempt). Fixed in the test only.
- The integrations page said "Save bot token and public URL above" although there is no public URL
  field any more (polling mode). Text only; the new frontend should not copy it.

## Unverified

- Nothing talks to the real Telegram API or an Ollama server; the poller loop itself is only
  exercised for the "lock already taken" back-off (on Windows through the O_EXCL branch; the fcntl
  branch is exercised by the same test only when run on Linux).
- Large uploads (multi-MB workbooks) were not tried.
