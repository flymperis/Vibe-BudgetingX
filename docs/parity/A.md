# Phase 2 — agent A: income, categories, accounts / credit cards, transfers, recurring

Old code ported: `routes/income.py`, `routes/categories.py`, `routes/accounts.py` (accounts +
transfers), `routes/recurring.py`, and the read side in `routes/dashboard.py::index` for the
Income, Transfer, Recurring and Settings (banks, expense categories, income categories) panels.

New files: `vbx/api/routers/{income,categories,accounts,transfers,recurring}.py`,
`vbx/api/schemas/{income,categories,accounts,transfers,recurring}.py`, `tests/helpers_accounts.py`,
`tests/test_{income,categories,accounts,transfers,recurring}.py`. Extended: `tests/test_core_flows.py`,
`tests/test_db_locking_and_category_delete.py`, `tests/test_credit_cards.py`,
`tests/test_recurring_intervals.py`.

## 1. Old test -> new test (assigned files)

| Old test | New test | Notes |
| --- | --- | --- |
| `test_core_flows.py::test_register_and_dashboard_load` | `tests/test_core_flows.py::test_register_and_bootstrap_load` | already ported (Phase 1) |
| `test_core_flows.py::test_logout_requires_csrf_then_succeeds` | `tests/test_core_flows.py::test_logout_requires_csrf_then_succeeds` | already ported |
| `test_core_flows.py::test_login_cookie_survives_closing_the_app` | `tests/test_core_flows.py::test_login_cookie_survives_closing_the_app` | already ported |
| `test_core_flows.py::test_dashboard_loads_every_panel` | `tests/test_core_flows.py::test_domain_a_endpoints_load_for_a_new_user` | PARTIAL: income, recurring, transfer and settings banks / expense / income category panels (GET /api/income, /categories, /income-categories, /accounts, /transfers, /recurring). Other panels belong to the other domains' "loads for a new user" tests |
| `test_core_flows.py::test_add_edit_delete_expense` | `tests/test_core_flows.py::test_add_edit_delete_expense` | already ported |
| `test_core_flows.py::test_add_income_entry` | `tests/test_core_flows.py::test_add_income_entry` | via POST /api/income; ids from /api/bootstrap instead of the HTML select |
| `test_core_flows.py::test_add_expense_and_income_with_chosen_date` | `tests/test_core_flows.py::test_add_expense_with_chosen_date` + `tests/test_core_flows.py::test_add_income_with_chosen_date` | now complete (income half added). The "form has a date field" HTML check is frontend-only: the add-income sheet must offer a date input (`received_at`) defaulting to today |
| `test_core_flows.py::test_add_account_and_category` | `tests/test_core_flows.py::test_add_account_and_category` | "name appears in the page" -> name appears in GET /api/accounts and /api/categories |
| `test_credit_cards.py::test_statement_close_and_due_dates` | `tests/test_credit_cards.py::test_statement_close_and_due_dates` | already ported (pure) |
| `test_credit_cards.py::test_add_card_stores_owed_opening_balance_as_negative` | `tests/test_credit_cards.py::test_add_card_stores_owed_opening_balance_as_negative` | + asserts `opening_balance_input` (300) in the response |
| `test_credit_cards.py::test_card_fields_are_validated` | `tests/test_credit_cards.py::test_card_fields_are_validated` | flash text -> 400 `detail` |
| `test_credit_cards.py::test_statement_follows_spending_and_payments` | `tests/test_credit_cards.py::test_statement_follows_spending_and_payments` | same finance assertions; also checks the card block of GET /api/accounts?month=2026-03, and the second payment goes through POST /api/transfers |
| `test_credit_cards.py::test_home_splits_totals_and_pay_link_prefills_transfer` | `tests/test_credit_cards.py::test_home_splits_totals_and_pay_link_prefills_transfer` | "Net / Credit cards" -> `has_cards` + `totals`; "600,00 € available of 1.000,00 €" -> `card.available`/`card.limit`; pay link -> `can_pay`; preselected options with data-balance -> `GET /api/transfers?pay_card=` defaults + balances from /api/accounts (also asserts the amount pre-fill 400) |
| `test_credit_cards.py::test_card_settings_survive_export_import` | PENDING | excel import/export domain (needs /api/export/excel + /api/import/excel) |
| `test_db_locking_and_category_delete.py::test_busy_timeout_is_actually_applied` | same name | already ported |
| `test_db_locking_and_category_delete.py::test_foreign_keys_stay_on` | same name | already ported |
| `test_db_locking_and_category_delete.py::test_journal_mode_is_wal_or_a_working_fallback` | same name | already ported |
| `test_db_locking_and_category_delete.py::test_deleting_category_with_expenses_is_refused_not_a_500` | `tests/test_db_locking_and_category_delete.py::test_deleting_category_with_expenses_is_refused_not_a_500` | old: 200 page with flash-error; new: 400 with the old message as `detail` (asserted in full) |
| `test_db_locking_and_category_delete.py::test_deleting_income_category_with_entries_is_refused` | same name | 400 `detail` |
| `test_db_locking_and_category_delete.py::test_unused_category_still_deletes` | same name | 200 |
| `test_db_locking_and_category_delete.py::test_recurring_rule_blocks_delete_even_though_it_has_no_foreign_key` | same name | 400 `detail` |
| `test_db_locking_and_category_delete.py::test_refused_delete_does_not_leave_the_database_locked` | same name | refused delete is 400, the next write succeeds |
| `test_db_locking_and_category_delete.py::test_concurrent_writers_do_not_deadlock` | same name | already ported |
| `test_db_locking_and_category_delete.py::test_a_leaked_transaction_blocks_writers_in_every_journal_mode` | same name | already ported |
| `test_recurring_intervals.py::test_weekly_occurrences_step_by_whole_weeks` | same name | already ported (pure) |
| `test_recurring_intervals.py::test_monthly_occurrences_clamp_to_short_months` | same name | already ported (pure) |
| `test_recurring_intervals.py::test_every_three_months_and_times_cap` | same name | already ported (pure) |
| `test_recurring_intervals.py::test_yearly_on_leap_day_falls_back_to_feb_28` | same name | already ported (pure) |
| `test_recurring_intervals.py::test_weekly_rule_catches_up_from_a_past_first_date_once` | `tests/test_recurring_intervals.py::test_weekly_rule_catches_up_from_a_past_first_date_once` | `client.get("/")` -> GET /api/bootstrap (also asserts `posted_recurring` 3 then 0) |
| `test_recurring_intervals.py::test_every_two_weeks_and_every_three_months` | same name | via POST /api/recurring + /api/bootstrap |
| `test_recurring_intervals.py::test_future_first_date_posts_nothing_yet` | same name | |
| `test_recurring_intervals.py::test_invalid_interval_is_rejected` | same name | + asserts 400 and each old message |
| `test_recurring_intervals.py::test_form_without_first_date_keeps_the_old_monthly_behaviour` | same name | "no start_date field" = key left out of the JSON body |
| `test_recurring_intervals.py::test_migrated_monthly_rules_post_exactly_as_before` | same name | |
| `test_recurring_intervals.py::test_backfill_leaves_rules_with_a_start_date_alone` | same name | core only |
| `test_recurring_intervals.py::test_switching_monthly_to_weekly_does_not_repost_the_past` | same name | via PUT /api/recurring/{id} |
| `test_recurring_intervals.py::test_editing_only_the_amount_keeps_the_schedule` | same name | + asserts the response `message`/`rule` |
| `test_recurring_intervals.py::test_unchanged_first_date_keeps_a_day_past_the_month_end` | same name | |
| `test_recurring_intervals.py::test_interval_round_trips_through_export_and_import` | PENDING | excel import/export domain |
| `test_recurring_intervals.py::test_workbook_without_interval_columns_imports_as_monthly` | PENDING | excel import/export domain |

Counts for the four assigned files (40 old tests): 14 were already ported before this task and
1 was partial (`test_add_expense_and_income_with_chosen_date`, now completed); this task ported
**22** (one of them, `test_dashboard_loads_every_panel`, is PARTIAL for this domain). **3** remain
PENDING (all excel import/export).

New tests with no old counterpart (validation branches and ownership checks):
`tests/test_income.py` (5), `tests/test_categories.py` (5 functions, 3 parametrised x2 -> 8
cases), `tests/test_accounts.py` (6), `tests/test_transfers.py` (5), `tests/test_recurring.py` (5).

Other old test files that exercise these routers (not assigned to me, still PENDING in
`docs/TEST_PARITY.md`): `test_investments_and_rules.py::test_recurring_add_edit_delete`,
`::test_transfer_between_accounts`, `::test_transfer_rejects_same_account` — the endpoints they
need now exist.

## 2. Endpoints

All under `/api`, logged in, CSRF header on writes, scoped by the session user.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/income?month=YYYY-MM&category_id=&page=` | Income list as the old panel: same SQL, month/category filters (invalid or not-owned = no filter), `LIST_PAGE_SIZE` pages clamped, newest first. Returns items + page/pages/total/page_size + the filters in effect |
| POST | `/income` | Add (`notes`, `amount`, `category_id`, `account_id`, `received_at`); amount `abs`, junk -> 0; blank date -> today |
| PUT | `/income/{id}` | Edit, same rules; 404 `Income entry not found.` |
| DELETE | `/income/{id}` | Delete; 404 when not the user's |
| GET | `/categories`, `/income-categories` | Categories ordered by name, each with `entry_count`, `rule_count`, `can_delete` (the delete-refusal counts) |
| POST | `/categories`, `/income-categories` | Add `{name}` (stripped) |
| PUT | `/categories/{id}`, `/income-categories/{id}` | Rename |
| DELETE | `/categories/{id}`, `/income-categories/{id}` | Delete; 400 with the old "“X” still has N expenses and M recurring rules. Reassign or delete them first." when referenced |
| GET | `/accounts?month=YYYY-MM` | Accounts ordered by name with `current_balance` (through today for the current month, else through the month end), stored and form-shown opening balance, card settings, bank badge, `card` status (owed/available/limit/used_pct/used_level/statement) as of `balance_as_of`, `can_pay`; plus `totals` (cash/cards/net), `has_cards`, `month`, `balance_as_of`, `through_today` |
| POST | `/accounts` | Add (`name`, `account_type` bank/credit, `opening_balance` = owed for a card, `credit_limit`, `statement_day`, `due_day`), old validation |
| PUT | `/accounts/{id}` | Edit, same validation |
| DELETE | `/accounts/{id}` | Delete; 400 when still referenced; 404 when not the user's |
| GET | `/transfers?pay_card=&month=` | Last `TRANSFER_LOG_LIMIT` transfers (date desc, id desc) + `limit` + form `defaults` (from/to account, amount, today). `pay_card=<card id>` gives the old "Pay card" pre-fill |
| POST | `/transfers` | Record (`from_account_id`, `to_account_id`, `amount` abs, `transferred_at`, `notes`) -> `{transfer, message: "Transfer recorded."}` |
| DELETE | `/transfers/{id}` | Delete; 404 `Transfer not found.` |
| GET | `/recurring` | Rules ordered by day_of_month, id, with every field the panel shows + `category_choice`, names |
| POST | `/recurring` | Add (old form fields, see `RecurringIn`) -> `{rule, message: "Recurring rule added."}` |
| PUT | `/recurring/{id}` | Edit with the old schedule-change floor logic -> `{rule, message: "Recurring rule updated."}`; 404 `Rule not found.` |
| DELETE | `/recurring/{id}` | `{ok, message: "Recurring rule removed."}`; 404 `Rule not found.` |

There is no PUT for transfers: the old app had no transfer edit.

## 3. Core changes

None. `vbx/core` is untouched. The two old route-local functions that read `request.form`
(`routes/accounts.py::_account_fields_from_form`, `routes/recurring.py::_read_rule_form`) were
copied into the routers with `request.form` replaced by a `form` mapping built from the JSON body.
`routes/categories.py::_count_references`/`_describe_blockers` were copied unchanged.

## 4. Deviations from old behaviour

- **Recurring posting** happens on GET /api/bootstrap only (it already calls
  `apply_recurring_entries`, like the old index). My GET endpoints do not post; the frontend must
  load bootstrap on app start/refresh as the old dashboard load did.
- **Silent no-ops became 400s** (new messages): blank category/account on income
  (`Choose a category and an account.`, same as expenses), blank name on category/account
  (`Enter a name.`), blank from/to account on a transfer (`Choose the two accounts.`).
- **Duplicates**: adding a category/account whose name exists was an `INSERT OR IGNORE` no-op that
  looked like success; now 400 `A category with that name already exists.` /
  `An account with that name already exists.`. Renaming onto an existing name was a 500 (unhandled
  IntegrityError); now the same 400s.
- **Account delete while referenced** was a 500; now 400 `That account is still in use, so it was
  not deleted. Reassign or delete its entries first.` (new message; nothing is deleted, as before).
- **Not found / not owned**: edit/delete of income, categories (edit), accounts, recurring (delete)
  silently did nothing (recurring delete even flashed success); now 404 with `Income entry not
  found.`, `Category not found.`, `Account not found.`, `Rule not found.`. Category delete and
  transfer delete already flashed `Category not found.` / `Transfer not found.`, now 404.
- Category delete refusal: flash-error -> 400 with the identical message.
- Transfer form pre-fill amount: old form value string `f"{remaining:.2f}"`; now a number
  `round(remaining, 2)` or null.
- Recurring `enabled` on PUT: ported exactly — left out (or false/"") pauses the rule, like the old
  unchecked box. `indefinitely`/`enabled` accept true/"1"; `start_date` left out or null means "no
  first-date field" (old pre-interval behaviour).
- Lists filters use plain `month`, `category_id`, `page` (old `inc_month`/`inc_cal_year`+
  `inc_cal_month`, `inc_category`, `inc_page`), like the expenses router.
- New read-only fields with no old display: category `entry_count`/`rule_count`/`can_delete`,
  account `opening_balance_input`, `can_pay`, `has_cards`, `balance_as_of`, `through_today`,
  transfer `from_account_id`/`to_account_id`, recurring `category_choice`.

## 5. Requests / open questions

- None for bootstrap. Note that `/api/bootstrap.accounts` and `/api/accounts` overlap (bootstrap is
  always "through today"; `/api/accounts` follows `?month=` like the old Settings/Transfer panels).
  The schema classes `BankBadge`, `CardStatus`, `BalanceTotals` are imported from
  `schemas/bootstrap.py` (read-only reuse); please keep them stable.
- The 3 excel tests above should be ported by the excel import/export owner (the router
  `data_io.py` now exists); they need POST /api/accounts and POST /api/recurring from this domain.

## 6. Suspected old bugs (ported unchanged unless listed as a deviation)

- `routes/accounts.py::delete_account`, `edit_account` and `routes/categories.py` edit: an
  IntegrityError (still-referenced account; name collision) escaped the route **without closing
  the connection** — the same leaked-write-lock bug that `_delete_category` was fixed for. Fixed by
  construction in the API (400 + rollback; `get_db` always closes).
- `amount` "nan" on a transfer or recurring rule: `abs(float("nan")) <= 0` is False, so it passes
  validation and the INSERT fails on `NOT NULL`/CHECK (NaN binds as NULL) -> 500. "inf" is
  accepted and stored. Same for `opening_balance`/`credit_limit` "nan" on accounts (opening balance
  NOT NULL -> 500; credit limit NaN stored as NULL). Ported unchanged (the API answers 500; the
  connection is still closed). Read from the code, not exercised by a test.
- `delete_recurring` flashed "Recurring rule removed." even when nothing matched (now 404).
- `add_income`/`edit_income`/category and account add/edit returned success for silently ignored
  input (see deviations).
