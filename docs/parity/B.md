# Phase 2 — agent B: budgets, Home, Summary (Consolidated), Yearly

Old sources: `routes/budget.py`, `budget.py` (already `vbx.core.budget`), the budget / month /
balance / yearly parts of `routes/dashboard.py::index`, templates `panels/_home.html`,
`_summary.html`, `_yearly.html`, `_budget.html`, macros `account_balances_list` and
`shell_month_year_row` in `_macros.html`.

New files: `vbx/api/routers/{budget,home,summary,yearly}.py`, `vbx/api/schemas/{budget,home,summary,yearly}.py`,
`vbx/api/services/{budget,home}.py` (+ `vbx/api/services/__init__.py`, a one-line docstring, created because the
folder did not exist yet), `tests/test_budget.py`, `tests/test_home_summary_yearly.py`, `tests/helpers_budget.py`.

## 1. Old test -> new test (tests/test_budget.py: 58/58 ported, 0 pending)

| Old test | New test | How |
| --- | --- | --- |
| `test_budget.py::test_toggle_enables_and_disables` | `tests/test_budget.py::test_toggle_enables_and_disables` | API |
| `test_budget.py::test_default_and_override_drive_the_month` | `tests/test_budget.py::test_default_and_override_drive_the_month` | API |
| `test_budget.py::test_negative_amount_is_rejected_without_partial_save` | `tests/test_budget.py::test_negative_amount_is_rejected_without_partial_save` | API |
| `test_budget.py::test_cannot_budget_someone_elses_category` | `tests/test_budget.py::test_cannot_budget_someone_elses_category` | API |
| `test_budget.py::test_deleting_a_category_drops_its_budgets` | `tests/test_budget.py::test_deleting_a_category_drops_its_budgets` | API for budgets; category add/delete via direct SQL (helpers_budget), FK cascade checked |
| `test_budget.py::test_home_and_consolidated_show_budget_when_enabled` | `tests/test_budget.py::test_home_and_consolidated_show_budget_when_enabled` | API |
| `test_budget.py::test_budgets_survive_export_import` | `tests/test_budget.py::test_budgets_survive_export_import` | API for the budget writes; export/import through vbx.core.excel_io (_build_export_workbook/_run_import_workbook, what the old routes called). `[] == errors` ↔ no "Import failed" |
| `test_budget.py::test_spending_history_average_window_and_refunds` | `tests/test_budget.py::test_spending_history_average_window_and_refunds` | core function (same as old) + API where the old test used routes |
| `test_budget.py::test_spending_history_refunds_reduce_average_and_clamp_at_zero` | `tests/test_budget.py::test_spending_history_refunds_reduce_average_and_clamp_at_zero` | core function (same as old) + API where the old test used routes |
| `test_budget.py::test_spending_history_new_user_divides_by_months_actually_lived` | `tests/test_budget.py::test_spending_history_new_user_divides_by_months_actually_lived` | core function (same as old) + API where the old test used routes |
| `test_budget.py::test_spending_history_suggested_rounds_up_to_multiple_of_five` | `tests/test_budget.py::test_spending_history_suggested_rounds_up_to_multiple_of_five` | core function (same as old) + API where the old test used routes |
| `test_budget.py::test_spending_history_active_flags` | `tests/test_budget.py::test_spending_history_active_flags` | core function (same as old) + API where the old test used routes |
| `test_budget.py::test_other_amount_set_reflected_in_totals_and_over` | `tests/test_budget.py::test_other_amount_set_reflected_in_totals_and_over` | API |
| `test_budget.py::test_other_amount_cleared_by_blank` | `tests/test_budget.py::test_other_amount_cleared_by_blank` | API |
| `test_budget.py::test_other_amount_negative_rejected_without_partial_save` | `tests/test_budget.py::test_other_amount_negative_rejected_without_partial_save` | API |
| `test_budget.py::test_other_amount_works_without_prior_budget_settings_row` | `tests/test_budget.py::test_other_amount_works_without_prior_budget_settings_row` | API |
| `test_budget.py::test_dashboard_budget_panel_renders_form_controls_and_order` | `tests/test_budget.py::test_dashboard_budget_panel_renders_form_controls_and_order` | HTML form controls -> GET /api/budget form_rows/other_amount (see Frontend-only) |
| `test_budget.py::test_other_amount_survives_export_import_round_trip` | `tests/test_budget.py::test_other_amount_survives_export_import_round_trip` | API for the budget writes; export/import through vbx.core.excel_io (_build_export_workbook/_run_import_workbook, what the old routes called). `[] == errors` ↔ no "Import failed" |
| `test_budget.py::test_old_workbook_without_other_amount_meta_key_does_not_clear_it` | `tests/test_budget.py::test_old_workbook_without_other_amount_meta_key_does_not_clear_it` | API for the budget writes; export/import through vbx.core.excel_io (_build_export_workbook/_run_import_workbook, what the old routes called). `[] == errors` ↔ no "Import failed" |
| `test_budget.py::test_spending_history_active_when_only_spending_is_in_selected_month` | `tests/test_budget.py::test_spending_history_active_when_only_spending_is_in_selected_month` | core function (same as old) + API where the old test used routes |
| `test_budget.py::test_budget_for_month_float_rounding_avoids_false_over` | `tests/test_budget.py::test_budget_for_month_float_rounding_avoids_false_over` | API |
| `test_budget.py::test_parse_amount_rejects_non_finite_and_over_ceiling` | `tests/test_budget.py::test_parse_amount_rejects_non_finite_and_over_ceiling` | 1:1 (pure) |
| `test_budget.py::test_defaults_route_rejects_junk_amounts_without_partial_write` | `tests/test_budget.py::test_defaults_route_rejects_junk_amounts_without_partial_write` | API |
| `test_budget.py::test_override_route_rejects_junk_amounts` | `tests/test_budget.py::test_override_route_rejects_junk_amounts` | API |
| `test_budget.py::test_import_without_budgets_sheet_keeps_existing_budgets` | `tests/test_budget.py::test_import_without_budgets_sheet_keeps_existing_budgets` | API for the budget writes; export/import through vbx.core.excel_io (_build_export_workbook/_run_import_workbook, what the old routes called). `[] == errors` ↔ no "Import failed" |
| `test_budget.py::test_import_with_budgets_sheet_replaces_existing_budgets` | `tests/test_budget.py::test_import_with_budgets_sheet_replaces_existing_budgets` | API for the budget writes; export/import through vbx.core.excel_io (_build_export_workbook/_run_import_workbook, what the old routes called). `[] == errors` ↔ no "Import failed" |
| `test_budget.py::test_spending_history_today_param_limits_window_to_past_months` | `tests/test_budget.py::test_spending_history_today_param_limits_window_to_past_months` | core function (same as old) + API where the old test used routes |
| `test_budget.py::test_total_pct_is_100_when_all_budgets_zero_and_spending_exists` | `tests/test_budget.py::test_total_pct_is_100_when_all_budgets_zero_and_spending_exists` | API |
| `test_budget.py::test_override_route_rejects_invalid_month` | `tests/test_budget.py::test_override_route_rejects_invalid_month` | API |
| `test_budget.py::test_home_card_renders_with_only_other_amount_set` | `tests/test_budget.py::test_home_card_renders_with_only_other_amount_set` | API |
| `test_budget.py::test_fixed_flag_persists_clears_and_is_untouched_when_amount_field_absent` | `tests/test_budget.py::test_fixed_flag_persists_clears_and_is_untouched_when_amount_field_absent` | API |
| `test_budget.py::test_fixed_flag_all_or_nothing_on_invalid_amount` | `tests/test_budget.py::test_fixed_flag_all_or_nothing_on_invalid_amount` | API |
| `test_budget.py::test_fixed_flag_ignores_other_users_category` | `tests/test_budget.py::test_fixed_flag_ignores_other_users_category` | API |
| `test_budget.py::test_deleting_category_cascades_fixed_flag` | `tests/test_budget.py::test_deleting_category_cascades_fixed_flag` | API for budgets; category add/delete via direct SQL (helpers_budget), FK cascade checked |
| `test_budget.py::test_budget_form_rows_expose_fixed_and_checkbox_is_checked` | `tests/test_budget.py::test_budget_form_rows_expose_fixed_and_checkbox_is_checked` | HTML form controls -> GET /api/budget form_rows/other_amount (see Frontend-only) |
| `test_budget.py::test_excel_round_trip_preserves_fixed_flag_with_no_default_amount` | `tests/test_budget.py::test_excel_round_trip_preserves_fixed_flag_with_no_default_amount` | API for the budget writes; export/import through vbx.core.excel_io (_build_export_workbook/_run_import_workbook, what the old routes called). `[] == errors` ↔ no "Import failed" |
| `test_budget.py::test_import_replace_mode_with_budgets_sheet_replaces_fixed_flag` | `tests/test_budget.py::test_import_replace_mode_with_budgets_sheet_replaces_fixed_flag` | API for the budget writes; export/import through vbx.core.excel_io (_build_export_workbook/_run_import_workbook, what the old routes called). `[] == errors` ↔ no "Import failed" |
| `test_budget.py::test_import_merge_mode_budgets_sheet_without_fixed_column_leaves_existing_flags` | `tests/test_budget.py::test_import_merge_mode_budgets_sheet_without_fixed_column_leaves_existing_flags` | API for the budget writes; export/import through vbx.core.excel_io (_build_export_workbook/_run_import_workbook, what the old routes called). `[] == errors` ↔ no "Import failed" |
| `test_budget.py::test_import_blank_amount_default_row_with_fixed_zero_is_an_error` | `tests/test_budget.py::test_import_blank_amount_default_row_with_fixed_zero_is_an_error` | API for the budget writes; export/import through vbx.core.excel_io (_build_export_workbook/_run_import_workbook, what the old routes called). `[] == errors` ↔ no "Import failed" |
| `test_budget.py::test_month_budget_snapshots_newest_first_and_effective_amounts` | `tests/test_budget.py::test_month_budget_snapshots_newest_first_and_effective_amounts` | core function (same as old) + API where the old test used routes |
| `test_budget.py::test_month_budget_snapshots_omits_categories_with_neither` | `tests/test_budget.py::test_month_budget_snapshots_omits_categories_with_neither` | core function (same as old) + API where the old test used routes |
| `test_budget.py::test_month_budget_snapshots_only_months_with_an_override_are_listed` | `tests/test_budget.py::test_month_budget_snapshots_only_months_with_an_override_are_listed` | core function (same as old) + API where the old test used routes |
| `test_budget.py::test_month_budget_snapshots_isolates_other_users` | `tests/test_budget.py::test_month_budget_snapshots_isolates_other_users` | core function (same as old) + API where the old test used routes |
| `test_budget.py::test_month_budget_snapshots_respects_limit` | `tests/test_budget.py::test_month_budget_snapshots_respects_limit` | core function (same as old) + API where the old test used routes |
| `test_budget.py::test_clear_month_hides_defaults_and_other_for_that_month_only` | `tests/test_budget.py::test_clear_month_hides_defaults_and_other_for_that_month_only` | API |
| `test_budget.py::test_clear_month_deletes_that_months_existing_overrides` | `tests/test_budget.py::test_clear_month_deletes_that_months_existing_overrides` | API |
| `test_budget.py::test_override_after_clear_budgets_only_that_category` | `tests/test_budget.py::test_override_after_clear_budgets_only_that_category` | API |
| `test_budget.py::test_reset_to_default_on_cleared_month_removes_the_budget` | `tests/test_budget.py::test_reset_to_default_on_cleared_month_removes_the_budget` | API |
| `test_budget.py::test_restore_month_brings_back_defaults_and_keeps_post_clear_overrides` | `tests/test_budget.py::test_restore_month_brings_back_defaults_and_keeps_post_clear_overrides` | API |
| `test_budget.py::test_clear_and_restore_month_reject_invalid_month_without_write` | `tests/test_budget.py::test_clear_and_restore_month_reject_invalid_month_without_write` | API |
| `test_budget.py::test_clear_month_isolated_per_user` | `tests/test_budget.py::test_clear_month_isolated_per_user` | API |
| `test_budget.py::test_deleting_category_does_not_break_a_cleared_month` | `tests/test_budget.py::test_deleting_category_does_not_break_a_cleared_month` | API for budgets; category add/delete via direct SQL (helpers_budget), FK cascade checked |
| `test_budget.py::test_month_budget_snapshots_for_cleared_month_ignores_defaults` | `tests/test_budget.py::test_month_budget_snapshots_for_cleared_month_ignores_defaults` | core function (same as old) + API where the old test used routes |
| `test_budget.py::test_month_budget_snapshots_skips_cleared_month_with_no_overrides_left` | `tests/test_budget.py::test_month_budget_snapshots_skips_cleared_month_with_no_overrides_left` | core function (same as old) + API where the old test used routes |
| `test_budget.py::test_clear_month_survives_export_import_round_trip` | `tests/test_budget.py::test_clear_month_survives_export_import_round_trip` | API for the budget writes; export/import through vbx.core.excel_io (_build_export_workbook/_run_import_workbook, what the old routes called). `[] == errors` ↔ no "Import failed" |
| `test_budget.py::test_old_workbook_without_budget_cleared_months_key_does_not_clear_anything` | `tests/test_budget.py::test_old_workbook_without_budget_cleared_months_key_does_not_clear_anything` | API for the budget writes; export/import through vbx.core.excel_io (_build_export_workbook/_run_import_workbook, what the old routes called). `[] == errors` ↔ no "Import failed" |
| `test_budget.py::test_import_rejects_junk_in_budget_cleared_months` | `tests/test_budget.py::test_import_rejects_junk_in_budget_cleared_months` | API for the budget writes; export/import through vbx.core.excel_io (_build_export_workbook/_run_import_workbook, what the old routes called). `[] == errors` ↔ no "Import failed" |
| `test_budget.py::test_defaults_form_on_cleared_month_preserves_other_amount` | `tests/test_budget.py::test_defaults_form_on_cleared_month_preserves_other_amount` | API |

No test in the old file is about Telegram budget alerts (those live in `test_telegram_notify.py`,
agent E), so nothing is handed over.

Extra new tests (validation / ownership branches the old suite did not cover), in `tests/test_budget.py`:
`test_toggle_accepts_the_old_form_value_and_anything_else_disables`,
`test_budget_panel_full_shape_and_template_values`, `test_budget_endpoints_require_login_and_csrf`,
`test_defaults_accept_numbers_commas_and_ignore_unknown_keys`, `test_override_route_rejects_bad_category_id`,
`test_override_blank_amount_drops_the_override_like_the_old_form`, `test_home_card_hidden_when_enabled_but_no_budget_rows`;
and all 10 tests in `tests/test_home_summary_yearly.py` (month totals with refunds, ?month /
?cal_year+cal_month / ?year fallbacks, balance scope through month end vs through today, card
statement judged on the last covered day, summary breakdown ordering and the Net Balance card,
budget table with unbudgeted + "Everything else", per-user isolation, yearly rows/totals/balances).

### Frontend-only (what the screen must guarantee instead of the HTML assertions)

- `test_dashboard_budget_panel_renders_form_controls_and_order`: the data part (form_rows order, the
  other_amount field) is ported. The screen must offer the Distribute tool (split a total by
  `avg`; fixed rows keep their amount), the "Everything else" input, and one collapsible
  "Set budgets manually" section, open initially when `has_any_default` is false and `other_amount`
  is null.
- `test_budget_form_rows_expose_fixed_and_checkbox_is_checked`: the Fixed checkbox per row is checked
  from `form_rows[].fixed`; saving sends every row in `amounts` and `fixed[id]=true` for checked ones
  (the old form always posted every row, so an unchecked box cleared the flag).
- `test_defaults_form_on_cleared_month_preserves_other_amount`: the form's "Everything else" value
  must come from `other_amount`, never from `summary.other` (null on a cleared month).
- Home card / Summary columns: show the budget card only when `budget_card` is not null; the Summary
  Expenses column shows `budget.rows`, then `budget.unbudgeted` (budget/left "—"), then
  `budget.other` when `budget` is not null, else `expense_breakdown`.

## 2. Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/budget?month=` (or `cal_year`+`cal_month`) | Budget panel: `enabled`; when on, `summary` (budget_for_month: rows, unbudgeted, other, totals, pct, status, over, cleared), `form_rows` (default, 3-month avg, active, fixed; old sort order), saved `other_amount`, `defaults_total` (the form's live total), `has_any_default`, `can_clear_month`, `cleared_total_spent`, `month_snapshots`. |
| POST | `/api/budget/toggle` | `{enabled}`; true/1/"1" enables, anything else disables. Message "Budgeting enabled." / "Budgeting disabled." |
| POST | `/api/budget/defaults` | `{amounts: {"<cat id>": amount or ""/null}, fixed: {"<cat id>": true}, other_amount?}`; all-or-nothing; 400 "Budget amounts must be numbers of zero or more."; "Monthly budgets saved." |
| POST | `/api/budget/override` | `{month, category_id, amount, clear}`; 400 "Invalid month." / "Invalid budget amount."; 404 "Category not found."; messages "Budget for this month saved." / "Budget for this month removed." (cleared month) / "Budget for this month reset to the default." |
| POST | `/api/budget/clear-month` | `{month}`; 400 "Invalid month."; "Cleared the budget for May 2026." |
| POST | `/api/budget/restore-month` | `{month}`; 400 "Invalid month."; "Restored the monthly budgets for May 2026." |
| GET | `/api/home?month=` | `total_income` / `total_expenses` / `net` for the month; balances as of the month (`balance_scope` today/month_end, `balance_cutoff`, `balance_as_of`, accounts with bank badge and card status, `cash_total`/`cards_total`/`net_total`, `has_cards`); `budget_enabled`, `budget_card` (or null). |
| GET | `/api/summary?month=` | Consolidated: the month totals, `income_breakdown`, `expense_breakdown`, the same balances block (Net Balance card = `net_total`), `budget_enabled`, `budget` (BudgetSummary) when budgeting is on. |
| GET | `/api/yearly?year=` | 12 rows (month 1..12, income, expenses, delta, total_balance) + total_income / total_expenses / total_delta. |

Balance-scope hints (old English text; the frontend translates): `today` -> "Account balances use
opening balance plus movements through today (only while this month is selected)."; `month_end` ->
"Account balances are through the end of <Month YYYY> (opening balance plus movements up to then)."

## 3. Core changes

None. `vbx/core` is untouched.

## 4. Deviations from old behaviour

- Mutations answer JSON instead of flash + redirect: errors are 400 (validation) / 404
  ("Category not found." for an override on a missing or someone else's category; old: error flash);
  success is `{"ok": true, "message": <old flash text>}`.
- Form fields become JSON: `amount_<id>` -> `amounts["<id>"]`, `fixed_<id>` -> `fixed["<id>"]`;
  "present in the form" is "key present in the JSON" (also for `other_amount`). JSON numbers are
  accepted besides strings (`parse_amount(str(value))`, so 12.345 -> 12.35 as before); JSON `true` for
  `clear` / `enabled` / `fixed` counts like "1". Pydantic turns JSON `true` into 1 for `category_id`
  and amounts (an amount `true` is 1; `category_id: true` is id 1 -> 404 unless owned). The defaults
  form's hidden `month` field is accepted and ignored, as before. Ids in `amounts` that are not the
  user's categories (or not numbers) are ignored, as the old loop over the user's categories did.
- `budget_summary.by_category` is not returned (it is `rows` keyed by id). The "Everything else"
  line and `over` entries use the row model with `category_id: null`.
- Template arithmetic is done server-side: `defaults_total`, `has_any_default`, `can_clear_month`,
  `cleared_total_spent` (total_spent + sum of unbudgeted spent; only on a cleared month), `net`,
  and the home card's `over` names.
- Month names / headings are not returned (frontend i18n): `month` is YYYY-MM, yearly rows carry
  the month number.
- The old index posted due recurring entries (`apply_recurring_entries`) on every panel load. These
  read endpoints do not (GETs stay read-only, and two parallel GETs could race on
  `recurring_applied`); `/api/bootstrap` still does it. See Requests.
- `/api/home` and `/api/summary` return the same account balance block as the old Home list
  (including card status); the old Summary "Balances" column only printed name + balance.

## 5. Requests / open questions

- Frontend: (re)load `/api/bootstrap`, which posts recurring entries, before Home / Summary /
  Yearly / Budget on app start and on a new day, so their totals include today's recurring postings
  as the old page did. If the orchestrator prefers exact parity, the read endpoints could call
  `apply_recurring_entries` too (needs a guard against the parallel-request race).
- The Excel round-trip tests use `vbx.core.excel_io` directly (what the old routes called), not the
  agent-E HTTP routes; agent E may add API-level variants.
- `docs/TEST_PARITY.md` rows for `test_budget.py::*` can point to `tests/test_budget.py::<same name>`.

## 6. Suspected old bugs (ported unchanged)

- `normalize_month` accepts any integer year, so `?month=0000-05` or `?month=99999-01` passes and
  then `datetime(...)` / `month_bounds_dates` raise -> 500 (the old dashboard 500s too). `/api/home`,
  `/api/summary` and `/api/budget` behave the same. Not tested.
- `POST /budget/override` with a blank `amount` and no `clear` drops the override (parse_amount returns
  None) and reports "reset to the default" / "removed" instead of rejecting the blank. Ported as is
  (`test_override_blank_amount_drops_the_override_like_the_old_form`).
- Summary breakdowns group by category *name* (`GROUP BY c.name`), so two categories with the same
  name would be merged; names are unique per user in practice (INSERT OR IGNORE on add).
