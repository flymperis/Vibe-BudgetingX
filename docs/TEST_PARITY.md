# Test parity: old app -> Vibe Budgeting X

Every test function of the old app (`<old app repo>\tests`, found with `grep def test_`) and the new test that covers it. A row is PORTED only when the named new function exists in `backend/tests/` (checked by script when this file was generated). New test files are named like the old ones; the four Telegram-tag tests of the old `test_tags.py` live in `test_telegram_tags.py`.

## Summary

**208 old test functions** (236 collected cases once the 4 parametrised ones are expanded: 12 + 4 + 9 + 7 cases; the new suite collects the same case counts).

| Status | Count |
| --- | --- |
| PORTED | 205 |
| PORTED (frontend) | 3 |
| PARTIAL | 0 |
| FRONTEND-ONLY | 0 |
| MISSING | 0 |

PORTED = a real new backend test asserts the same facts (HTML assertions became JSON assertions, noted per row). PARTIAL = the new test lacks a backend-checkable assertion of the old one. FRONTEND-ONLY = nothing to test in the backend; the frontend must guarantee it. MISSING = no counterpart.

## MISSING and PARTIAL rows

**None at the end of this pass.** Found along the way and fixed (so they now count as PORTED):

- PARTIAL `test_core_flows.py::test_dashboard_loads_every_panel`: only the domain-A subset was covered; now covers all 12 panels.
- PARTIAL `test_investments_and_rules.py::test_dashboard_loads_with_holdings`: no summary/yearly; now loads them.
- PARTIAL `test_price_fetch_gating.py::test_non_investments_panel_does_not_fetch_live_prices`: `/api/home` accepted 404; now must be 200.
- MISSING, now ported: `test_credit_cards.py::test_card_settings_survive_export_import`, `test_recurring_intervals.py::test_interval_round_trips_through_export_and_import`, `test_recurring_intervals.py::test_workbook_without_interval_columns_imports_as_monthly`, `test_investments_and_rules.py::test_recurring_add_edit_delete`, `::test_transfer_between_accounts`, `::test_transfer_rejects_same_account`.

No xfail / parity gap was needed: every newly ported test passed against the backend as it is.

## PORTED rows that leave a frontend obligation

The backend half is tested; the UI half is listed in the Notes column: `test_dashboard_shows_bank_badges`, `test_add_expense_and_income_with_chosen_date`, `test_investments_data_shows_dash_not_zero_when_unloaded`, `test_dashboard_budget_panel_renders_form_controls_and_order`, `test_budget_form_rows_expose_fixed_and_checkbox_is_checked`, `test_legacy_report_section_links_still_resolve`, `test_web_tag_report_adds_up_across_categories`.

## FRONTEND-ONLY rows

None left. The three `test_pwa_manifest.py` rows are now PORTED (frontend): `npm test` runs
`frontend/scripts/pwa-check.mjs`, which builds the SPA into a temporary folder, serves it with the real backend
(throwaway database) and asserts what the old tests asserted on the served output; `frontend/src/test/pwa.test.ts`
checks the source files and `backend/tests/test_app.py::test_pwa_files_are_served_without_login_with_their_types`
the content types.

The backend also has many tests with no old counterpart (auth contract, expense/income/category/account/transfer/recurring validation, bootstrap, SPA serving, jobs, settings API, shared API, extra reports/budget/investments cases, export/import error paths).

## Table

| Old test | Domain | New test | Status | Notes |
| --- | --- | --- | --- | --- |
| `test_backup.py::test_backup_is_a_complete_checked_copy_even_while_the_app_writes` | backup | `test_backup.py::test_backup_is_a_complete_checked_copy_even_while_the_app_writes` | PORTED | 1:1 |
| `test_backup.py::test_rotation_keeps_14_days_and_one_per_month_and_nothing_else_is_touched` | backup | `test_backup.py::test_rotation_keeps_14_days_and_one_per_month_and_nothing_else_is_touched` | PORTED | 1:1 |
| `test_backup.py::test_schedule` | backup | `test_backup.py::test_schedule` | PORTED | 1:1 |
| `test_backup.py::test_run_if_due_and_switch_off` | backup | `test_backup.py::test_run_if_due_and_switch_off` | PORTED | 1:1 |
| `test_backup.py::test_command_line_snapshot` | backup | `test_backup.py::test_command_line_snapshot` | PORTED | 1:1 |
| `test_backup.py::test_sleeps_until_the_nightly_time_but_at_most_an_hour` | backup | `test_backup.py::test_sleeps_until_the_nightly_time_but_at_most_an_hour` | PORTED | 1:1 |
| `test_banks.py::test_detect_bank_from_account_name` (12 cases) | banks | `test_banks.py::test_detect_bank_from_account_name` | PORTED | same 12 parametrised cases |
| `test_banks.py::test_unknown_names_have_no_bank` (4 cases) | banks | `test_banks.py::test_unknown_names_have_no_bank` | PORTED | same 4 parametrised cases |
| `test_banks.py::test_dashboard_shows_bank_badges` | banks | `test_banks.py::test_bootstrap_shows_bank_badges` | PORTED | HTML badge + #bank-badges JSON -> `/api/bootstrap` `accounts[].bank` (slug, name, logo path); a non-bank account has `bank: null`. Accounts are inserted by SQL, not through the accounts API. Frontend must render the badge from `bank.logo`. |
| `test_banks.py::test_every_shipped_logo_is_served` | banks | `test_banks.py::test_every_shipped_logo_is_served` | PORTED | 1:1 |
| `test_budget.py::test_toggle_enables_and_disables` | budget | `test_budget.py::test_toggle_enables_and_disables` | PORTED | 1:1 |
| `test_budget.py::test_default_and_override_drive_the_month` | budget | `test_budget.py::test_default_and_override_drive_the_month` | PORTED | 1:1 |
| `test_budget.py::test_negative_amount_is_rejected_without_partial_save` | budget | `test_budget.py::test_negative_amount_is_rejected_without_partial_save` | PORTED | 1:1 |
| `test_budget.py::test_cannot_budget_someone_elses_category` | budget | `test_budget.py::test_cannot_budget_someone_elses_category` | PORTED | 1:1 |
| `test_budget.py::test_deleting_a_category_drops_its_budgets` | budget | `test_budget.py::test_deleting_a_category_drops_its_budgets` | PORTED | 1:1 |
| `test_budget.py::test_home_and_consolidated_show_budget_when_enabled` | budget | `test_budget.py::test_home_and_consolidated_show_budget_when_enabled` | PORTED | "home-budget-card" / "Over budget: General" / Budget+Left columns -> `/api/home` `budget_card` (`over`, totals) and `/api/summary` `budget.rows`. |
| `test_budget.py::test_budgets_survive_export_import` | budget | `test_budget.py::test_budgets_survive_export_import` | PORTED | 1:1 |
| `test_budget.py::test_spending_history_average_window_and_refunds` | budget | `test_budget.py::test_spending_history_average_window_and_refunds` | PORTED | 1:1 |
| `test_budget.py::test_spending_history_refunds_reduce_average_and_clamp_at_zero` | budget | `test_budget.py::test_spending_history_refunds_reduce_average_and_clamp_at_zero` | PORTED | 1:1 |
| `test_budget.py::test_spending_history_new_user_divides_by_months_actually_lived` | budget | `test_budget.py::test_spending_history_new_user_divides_by_months_actually_lived` | PORTED | 1:1 |
| `test_budget.py::test_spending_history_suggested_rounds_up_to_multiple_of_five` | budget | `test_budget.py::test_spending_history_suggested_rounds_up_to_multiple_of_five` | PORTED | 1:1 |
| `test_budget.py::test_spending_history_active_flags` | budget | `test_budget.py::test_spending_history_active_flags` | PORTED | 1:1 |
| `test_budget.py::test_other_amount_set_reflected_in_totals_and_over` | budget | `test_budget.py::test_other_amount_set_reflected_in_totals_and_over` | PORTED | 1:1 |
| `test_budget.py::test_other_amount_cleared_by_blank` | budget | `test_budget.py::test_other_amount_cleared_by_blank` | PORTED | 1:1 |
| `test_budget.py::test_other_amount_negative_rejected_without_partial_save` | budget | `test_budget.py::test_other_amount_negative_rejected_without_partial_save` | PORTED | 1:1 |
| `test_budget.py::test_other_amount_works_without_prior_budget_settings_row` | budget | `test_budget.py::test_other_amount_works_without_prior_budget_settings_row` | PORTED | 1:1 |
| `test_budget.py::test_dashboard_budget_panel_renders_form_controls_and_order` | budget | `test_budget.py::test_dashboard_budget_panel_renders_form_controls_and_order` | PORTED | Order and activity are asserted on `form_rows` (active first) and the `other_amount` key. FRONTEND must guarantee: a "distribute" button, an "everything else" amount input, and one collapsible manual section holding all categories (no separate inactive section). |
| `test_budget.py::test_other_amount_survives_export_import_round_trip` | budget | `test_budget.py::test_other_amount_survives_export_import_round_trip` | PORTED | 1:1 |
| `test_budget.py::test_old_workbook_without_other_amount_meta_key_does_not_clear_it` | budget | `test_budget.py::test_old_workbook_without_other_amount_meta_key_does_not_clear_it` | PORTED | 1:1 |
| `test_budget.py::test_spending_history_active_when_only_spending_is_in_selected_month` | budget | `test_budget.py::test_spending_history_active_when_only_spending_is_in_selected_month` | PORTED | 1:1 |
| `test_budget.py::test_budget_for_month_float_rounding_avoids_false_over` | budget | `test_budget.py::test_budget_for_month_float_rounding_avoids_false_over` | PORTED | 1:1 |
| `test_budget.py::test_parse_amount_rejects_non_finite_and_over_ceiling` | budget | `test_budget.py::test_parse_amount_rejects_non_finite_and_over_ceiling` | PORTED | 1:1 |
| `test_budget.py::test_defaults_route_rejects_junk_amounts_without_partial_write` | budget | `test_budget.py::test_defaults_route_rejects_junk_amounts_without_partial_write` | PORTED | 1:1 |
| `test_budget.py::test_override_route_rejects_junk_amounts` | budget | `test_budget.py::test_override_route_rejects_junk_amounts` | PORTED | 1:1 |
| `test_budget.py::test_import_without_budgets_sheet_keeps_existing_budgets` | budget | `test_budget.py::test_import_without_budgets_sheet_keeps_existing_budgets` | PORTED | 1:1 |
| `test_budget.py::test_import_with_budgets_sheet_replaces_existing_budgets` | budget | `test_budget.py::test_import_with_budgets_sheet_replaces_existing_budgets` | PORTED | 1:1 |
| `test_budget.py::test_spending_history_today_param_limits_window_to_past_months` | budget | `test_budget.py::test_spending_history_today_param_limits_window_to_past_months` | PORTED | 1:1 |
| `test_budget.py::test_total_pct_is_100_when_all_budgets_zero_and_spending_exists` | budget | `test_budget.py::test_total_pct_is_100_when_all_budgets_zero_and_spending_exists` | PORTED | 1:1 |
| `test_budget.py::test_override_route_rejects_invalid_month` | budget | `test_budget.py::test_override_route_rejects_invalid_month` | PORTED | 1:1 |
| `test_budget.py::test_home_card_renders_with_only_other_amount_set` | budget | `test_budget.py::test_home_card_renders_with_only_other_amount_set` | PORTED | home-budget-card -> `budget_card` not null with `total_budget` 40. |
| `test_budget.py::test_fixed_flag_persists_clears_and_is_untouched_when_amount_field_absent` | budget | `test_budget.py::test_fixed_flag_persists_clears_and_is_untouched_when_amount_field_absent` | PORTED | 1:1 |
| `test_budget.py::test_fixed_flag_all_or_nothing_on_invalid_amount` | budget | `test_budget.py::test_fixed_flag_all_or_nothing_on_invalid_amount` | PORTED | 1:1 |
| `test_budget.py::test_fixed_flag_ignores_other_users_category` | budget | `test_budget.py::test_fixed_flag_ignores_other_users_category` | PORTED | 1:1 |
| `test_budget.py::test_deleting_category_cascades_fixed_flag` | budget | `test_budget.py::test_deleting_category_cascades_fixed_flag` | PORTED | 1:1 |
| `test_budget.py::test_budget_form_rows_expose_fixed_and_checkbox_is_checked` | budget | `test_budget.py::test_budget_form_rows_expose_fixed_and_checkbox_is_checked` | PORTED | Checked checkbox -> `form_rows[].fixed`. FRONTEND must render the fixed checkbox from it. |
| `test_budget.py::test_excel_round_trip_preserves_fixed_flag_with_no_default_amount` | budget | `test_budget.py::test_excel_round_trip_preserves_fixed_flag_with_no_default_amount` | PORTED | 1:1 |
| `test_budget.py::test_import_replace_mode_with_budgets_sheet_replaces_fixed_flag` | budget | `test_budget.py::test_import_replace_mode_with_budgets_sheet_replaces_fixed_flag` | PORTED | 1:1 |
| `test_budget.py::test_import_merge_mode_budgets_sheet_without_fixed_column_leaves_existing_flags` | budget | `test_budget.py::test_import_merge_mode_budgets_sheet_without_fixed_column_leaves_existing_flags` | PORTED | 1:1 |
| `test_budget.py::test_import_blank_amount_default_row_with_fixed_zero_is_an_error` | budget | `test_budget.py::test_import_blank_amount_default_row_with_fixed_zero_is_an_error` | PORTED | 1:1 |
| `test_budget.py::test_month_budget_snapshots_newest_first_and_effective_amounts` | budget | `test_budget.py::test_month_budget_snapshots_newest_first_and_effective_amounts` | PORTED | 1:1 |
| `test_budget.py::test_month_budget_snapshots_omits_categories_with_neither` | budget | `test_budget.py::test_month_budget_snapshots_omits_categories_with_neither` | PORTED | 1:1 |
| `test_budget.py::test_month_budget_snapshots_only_months_with_an_override_are_listed` | budget | `test_budget.py::test_month_budget_snapshots_only_months_with_an_override_are_listed` | PORTED | 1:1 |
| `test_budget.py::test_month_budget_snapshots_isolates_other_users` | budget | `test_budget.py::test_month_budget_snapshots_isolates_other_users` | PORTED | 1:1 |
| `test_budget.py::test_month_budget_snapshots_respects_limit` | budget | `test_budget.py::test_month_budget_snapshots_respects_limit` | PORTED | 1:1 |
| `test_budget.py::test_clear_month_hides_defaults_and_other_for_that_month_only` | budget | `test_budget.py::test_clear_month_hides_defaults_and_other_for_that_month_only` | PORTED | 1:1 |
| `test_budget.py::test_clear_month_deletes_that_months_existing_overrides` | budget | `test_budget.py::test_clear_month_deletes_that_months_existing_overrides` | PORTED | 1:1 |
| `test_budget.py::test_override_after_clear_budgets_only_that_category` | budget | `test_budget.py::test_override_after_clear_budgets_only_that_category` | PORTED | 1:1 |
| `test_budget.py::test_reset_to_default_on_cleared_month_removes_the_budget` | budget | `test_budget.py::test_reset_to_default_on_cleared_month_removes_the_budget` | PORTED | 1:1 |
| `test_budget.py::test_restore_month_brings_back_defaults_and_keeps_post_clear_overrides` | budget | `test_budget.py::test_restore_month_brings_back_defaults_and_keeps_post_clear_overrides` | PORTED | 1:1 |
| `test_budget.py::test_clear_and_restore_month_reject_invalid_month_without_write` | budget | `test_budget.py::test_clear_and_restore_month_reject_invalid_month_without_write` | PORTED | 1:1 |
| `test_budget.py::test_clear_month_isolated_per_user` | budget | `test_budget.py::test_clear_month_isolated_per_user` | PORTED | 1:1 |
| `test_budget.py::test_deleting_category_does_not_break_a_cleared_month` | budget | `test_budget.py::test_deleting_category_does_not_break_a_cleared_month` | PORTED | 1:1 |
| `test_budget.py::test_month_budget_snapshots_for_cleared_month_ignores_defaults` | budget | `test_budget.py::test_month_budget_snapshots_for_cleared_month_ignores_defaults` | PORTED | 1:1 |
| `test_budget.py::test_month_budget_snapshots_skips_cleared_month_with_no_overrides_left` | budget | `test_budget.py::test_month_budget_snapshots_skips_cleared_month_with_no_overrides_left` | PORTED | 1:1 |
| `test_budget.py::test_clear_month_survives_export_import_round_trip` | budget | `test_budget.py::test_clear_month_survives_export_import_round_trip` | PORTED | 1:1 |
| `test_budget.py::test_old_workbook_without_budget_cleared_months_key_does_not_clear_anything` | budget | `test_budget.py::test_old_workbook_without_budget_cleared_months_key_does_not_clear_anything` | PORTED | 1:1 |
| `test_budget.py::test_import_rejects_junk_in_budget_cleared_months` | budget | `test_budget.py::test_import_rejects_junk_in_budget_cleared_months` | PORTED | 1:1 |
| `test_budget.py::test_defaults_form_on_cleared_month_preserves_other_amount` | budget | `test_budget.py::test_defaults_form_on_cleared_month_preserves_other_amount` | PORTED | 1:1 |
| `test_core_flows.py::test_register_and_dashboard_load` | core flows | `test_core_flows.py::test_register_and_bootstrap_load` | PORTED | GET / -> GET /api/bootstrap (also asserts the username). |
| `test_core_flows.py::test_logout_requires_csrf_then_succeeds` | core flows | `test_core_flows.py::test_logout_requires_csrf_then_succeeds` | PORTED | Missing CSRF is 403 (old: 400); logged out is 401 (old: redirect to /login). |
| `test_core_flows.py::test_login_cookie_survives_closing_the_app` | core flows | `test_core_flows.py::test_login_cookie_survives_closing_the_app` | PORTED | Cookie `vbx_session` carries Max-Age (365 days) instead of Expires. |
| `test_core_flows.py::test_dashboard_loads_every_panel` | core flows | `test_core_flows.py::test_dashboard_loads_every_panel` | PORTED | Completed in this pass: one new-user test hits the data endpoint(s) of all 12 old panels (home, expenses, income, recurring, transfer, summary, budget, shared, yearly, reports, investments, settings sections). The `general` settings section is client-only. Before: only the domain-A subset was covered. |
| `test_core_flows.py::test_add_edit_delete_expense` | core flows | `test_core_flows.py::test_add_edit_delete_expense` | PORTED | 1:1 |
| `test_core_flows.py::test_add_income_entry` | core flows | `test_core_flows.py::test_add_income_entry` | PORTED | 1:1 |
| `test_core_flows.py::test_add_expense_and_income_with_chosen_date` | core flows | `test_core_flows.py::test_add_expense_with_chosen_date` + `test_core_flows.py::test_add_income_with_chosen_date` | PORTED | Split into an expense test and an income test. FRONTEND must guarantee: the add-expense and add-income forms offer a date input (`spent_at` / `received_at`) defaulting to today. |
| `test_core_flows.py::test_add_account_and_category` | core flows | `test_core_flows.py::test_add_account_and_category` | PORTED | "name appears in the page" -> name appears in GET /api/accounts and /api/categories. |
| `test_credit_cards.py::test_statement_close_and_due_dates` | credit cards | `test_credit_cards.py::test_statement_close_and_due_dates` | PORTED | 1:1 |
| `test_credit_cards.py::test_add_card_stores_owed_opening_balance_as_negative` | credit cards | `test_credit_cards.py::test_add_card_stores_owed_opening_balance_as_negative` | PORTED | 1:1 |
| `test_credit_cards.py::test_card_fields_are_validated` | credit cards | `test_credit_cards.py::test_card_fields_are_validated` | PORTED | 1:1 |
| `test_credit_cards.py::test_statement_follows_spending_and_payments` | credit cards | `test_credit_cards.py::test_statement_follows_spending_and_payments` | PORTED | 1:1 |
| `test_credit_cards.py::test_home_splits_totals_and_pay_link_prefills_transfer` | credit cards | `test_credit_cards.py::test_home_splits_totals_and_pay_link_prefills_transfer` | PORTED | 1:1 |
| `test_credit_cards.py::test_card_settings_survive_export_import` | credit cards | `test_credit_cards.py::test_card_settings_survive_export_import` | PORTED | Ported in this pass via /api/export/excel + /api/import/excel; same four assertions. |
| `test_db_locking_and_category_delete.py::test_busy_timeout_is_actually_applied` | db / categories | `test_db_locking_and_category_delete.py::test_busy_timeout_is_actually_applied` | PORTED | 1:1 |
| `test_db_locking_and_category_delete.py::test_foreign_keys_stay_on` | db / categories | `test_db_locking_and_category_delete.py::test_foreign_keys_stay_on` | PORTED | 1:1 |
| `test_db_locking_and_category_delete.py::test_journal_mode_is_wal_or_a_working_fallback` | db / categories | `test_db_locking_and_category_delete.py::test_journal_mode_is_wal_or_a_working_fallback` | PORTED | 1:1 |
| `test_db_locking_and_category_delete.py::test_deleting_category_with_expenses_is_refused_not_a_500` | db / categories | `test_db_locking_and_category_delete.py::test_deleting_category_with_expenses_is_refused_not_a_500` | PORTED | Flash-error page 200 -> 400 with the same message as `detail`. |
| `test_db_locking_and_category_delete.py::test_deleting_income_category_with_entries_is_refused` | db / categories | `test_db_locking_and_category_delete.py::test_deleting_income_category_with_entries_is_refused` | PORTED | 400 `detail`. |
| `test_db_locking_and_category_delete.py::test_unused_category_still_deletes` | db / categories | `test_db_locking_and_category_delete.py::test_unused_category_still_deletes` | PORTED | 1:1 |
| `test_db_locking_and_category_delete.py::test_recurring_rule_blocks_delete_even_though_it_has_no_foreign_key` | db / categories | `test_db_locking_and_category_delete.py::test_recurring_rule_blocks_delete_even_though_it_has_no_foreign_key` | PORTED | 400 `detail`. |
| `test_db_locking_and_category_delete.py::test_refused_delete_does_not_leave_the_database_locked` | db / categories | `test_db_locking_and_category_delete.py::test_refused_delete_does_not_leave_the_database_locked` | PORTED | Refused delete is 400; the next write succeeds. |
| `test_db_locking_and_category_delete.py::test_concurrent_writers_do_not_deadlock` | db / categories | `test_db_locking_and_category_delete.py::test_concurrent_writers_do_not_deadlock` | PORTED | 1:1 |
| `test_db_locking_and_category_delete.py::test_a_leaked_transaction_blocks_writers_in_every_journal_mode` | db / categories | `test_db_locking_and_category_delete.py::test_a_leaked_transaction_blocks_writers_in_every_journal_mode` | PORTED | 1:1 |
| `test_export_import_roundtrip.py::test_export_covers_every_sheet` | excel import/export | `test_export_import_roundtrip.py::test_export_covers_every_sheet` | PORTED | 1:1 |
| `test_export_import_roundtrip.py::test_export_import_round_trip_preserves_everything` | excel import/export | `test_export_import_roundtrip.py::test_export_import_round_trip_preserves_everything` | PORTED | 1:1 |
| `test_export_import_roundtrip.py::test_restored_recurring_rule_does_not_repost` | excel import/export | `test_export_import_roundtrip.py::test_restored_recurring_rule_does_not_repost` | PORTED | 1:1 |
| `test_export_import_roundtrip.py::test_version_1_workbook_still_imports` | excel import/export | `test_export_import_roundtrip.py::test_version_1_workbook_still_imports` | PORTED | 1:1 |
| `test_investments_and_rules.py::test_stock_add_edit_delete` | investments / recurring / transfers | `test_investments_and_rules.py::test_stock_add_edit_delete` | PORTED | Via /api/investments/stocks; test data in helpers_investments.py. |
| `test_investments_and_rules.py::test_crypto_add_edit_delete` | investments / recurring / transfers | `test_investments_and_rules.py::test_crypto_add_edit_delete` | PORTED | Via /api/investments/crypto; test data in helpers_investments.py. |
| `test_investments_and_rules.py::test_dashboard_loads_with_holdings` | investments / recurring / transfers | `test_investments_and_rules.py::test_dashboard_loads_with_holdings` | PORTED | Completed in this pass: now also loads /api/summary, /api/yearly and /api/home with holdings (the old test loaded the summary and yearly panels). Legacy report sections go through `/api/reports/section`. |
| `test_investments_and_rules.py::test_recurring_add_edit_delete` | investments / recurring / transfers | `test_investments_and_rules.py::test_recurring_add_edit_delete` | PORTED | Ported in this pass (kept in `test_investments_and_rules.py`, as in the old file) via POST/PUT/DELETE /api/recurring; same assertions (day_of_month 5 -> 10, months_to_run None -> 6, amount 50 -> 75, row deleted). |
| `test_investments_and_rules.py::test_transfer_between_accounts` | investments / recurring / transfers | `test_investments_and_rules.py::test_transfer_between_accounts` | PORTED | Ported in this pass via /api/accounts and /api/transfers (create, DB row amount 200, delete). |
| `test_investments_and_rules.py::test_transfer_rejects_same_account` | investments / recurring / transfers | `test_investments_and_rules.py::test_transfer_rejects_same_account` | PORTED | Ported in this pass; additionally asserts the 400. |
| `test_price_fetch_gating.py::test_non_investments_panel_does_not_fetch_live_prices` | investments (prices) | `test_price_fetch_gating.py::test_non_investments_panel_does_not_fetch_live_prices` | PORTED | Stubs also count calls made inside core (stricter than old). Tightened in this pass: `/api/home` must be 200 (was `in (200, 404)`). |
| `test_price_fetch_gating.py::test_investments_panel_fetches_live_prices` | investments (prices) | `test_price_fetch_gating.py::test_investments_panel_fetches_live_prices` | PORTED | GET /api/investments (live by default); also asserts the exact call arguments (cache allowed). |
| `test_price_fetch_gating.py::test_refresh_param_fetches_live_prices_on_other_panels` | investments (prices) | `test_price_fetch_gating.py::test_refresh_param_fetches_live_prices_on_other_panels` | PORTED | `refresh_prices` links -> `?live=false&refresh_crypto=true&refresh_stocks=true`; asserts the force-past-cache flag. |
| `test_price_fetch_gating.py::test_investments_data_shows_dash_not_zero_when_unloaded` | investments (prices) | `test_price_fetch_gating.py::test_investments_data_shows_dash_not_zero_when_unloaded` | PORTED | HTML dash and `data-prices-loaded="0"` -> `prices_loaded: false` and null value/P&L fields; `total_invested` still returned (20010.0 / 1501.5). FRONTEND must show a dash for null values and force a live reload when `prices_loaded` is false. |
| `test_pwa_manifest.py::test_manifest_served_without_login` | frontend (PWA) | `frontend/scripts/pwa-check.mjs` ("manifest is served without login", "Content-Type is application/manifest+json") + `backend/tests/test_app.py::test_pwa_files_are_served_without_login_with_their_types` | PORTED (frontend) | Built SPA served by the real backend (temp build + temp DB, run by `npm test`): GET `/manifest.webmanifest` without a session -> 200, `application/manifest+json`. The backend test pins the type registration (also on Windows). |
| `test_pwa_manifest.py::test_manifest_is_valid_standalone_manifest_with_icons_on_disk` | frontend (PWA) | `frontend/scripts/pwa-check.mjs` ("manifest display/name/icons" checks) + `frontend/src/test/pwa.test.ts` | PORTED (frontend) | Served manifest parses as JSON: `display: "standalone"`, `name: "Vibe Budgeting"`, non-empty `icons`; every `icons[].src` exists in the build and is served as `image/png`. |
| `test_pwa_manifest.py::test_login_page_links_manifest_and_apple_touch_icon` | frontend (PWA) | `frontend/scripts/pwa-check.mjs` ("/ and /login link rel=manifest / apple-touch-icon") + `frontend/src/test/pwa.test.ts` | PORTED (frontend) | Served `/` and `/login` (the SPA's index.html) link `rel="manifest"` -> `/manifest.webmanifest` and `rel="apple-touch-icon"` -> `/icons/apple-touch-icon.png`, which is served. |
| `test_recurring_intervals.py::test_weekly_occurrences_step_by_whole_weeks` | recurring | `test_recurring_intervals.py::test_weekly_occurrences_step_by_whole_weeks` | PORTED | 1:1 |
| `test_recurring_intervals.py::test_monthly_occurrences_clamp_to_short_months` | recurring | `test_recurring_intervals.py::test_monthly_occurrences_clamp_to_short_months` | PORTED | 1:1 |
| `test_recurring_intervals.py::test_every_three_months_and_times_cap` | recurring | `test_recurring_intervals.py::test_every_three_months_and_times_cap` | PORTED | 1:1 |
| `test_recurring_intervals.py::test_yearly_on_leap_day_falls_back_to_feb_28` | recurring | `test_recurring_intervals.py::test_yearly_on_leap_day_falls_back_to_feb_28` | PORTED | 1:1 |
| `test_recurring_intervals.py::test_weekly_rule_catches_up_from_a_past_first_date_once` | recurring | `test_recurring_intervals.py::test_weekly_rule_catches_up_from_a_past_first_date_once` | PORTED | GET / -> GET /api/bootstrap (also asserts `posted_recurring` 3 then 0). |
| `test_recurring_intervals.py::test_every_two_weeks_and_every_three_months` | recurring | `test_recurring_intervals.py::test_every_two_weeks_and_every_three_months` | PORTED | 1:1 |
| `test_recurring_intervals.py::test_future_first_date_posts_nothing_yet` | recurring | `test_recurring_intervals.py::test_future_first_date_posts_nothing_yet` | PORTED | 1:1 |
| `test_recurring_intervals.py::test_invalid_interval_is_rejected` | recurring | `test_recurring_intervals.py::test_invalid_interval_is_rejected` | PORTED | 1:1 |
| `test_recurring_intervals.py::test_form_without_first_date_keeps_the_old_monthly_behaviour` | recurring | `test_recurring_intervals.py::test_form_without_first_date_keeps_the_old_monthly_behaviour` | PORTED | 1:1 |
| `test_recurring_intervals.py::test_migrated_monthly_rules_post_exactly_as_before` | recurring | `test_recurring_intervals.py::test_migrated_monthly_rules_post_exactly_as_before` | PORTED | 1:1 |
| `test_recurring_intervals.py::test_backfill_leaves_rules_with_a_start_date_alone` | recurring | `test_recurring_intervals.py::test_backfill_leaves_rules_with_a_start_date_alone` | PORTED | 1:1 |
| `test_recurring_intervals.py::test_switching_monthly_to_weekly_does_not_repost_the_past` | recurring | `test_recurring_intervals.py::test_switching_monthly_to_weekly_does_not_repost_the_past` | PORTED | 1:1 |
| `test_recurring_intervals.py::test_editing_only_the_amount_keeps_the_schedule` | recurring | `test_recurring_intervals.py::test_editing_only_the_amount_keeps_the_schedule` | PORTED | 1:1 |
| `test_recurring_intervals.py::test_unchanged_first_date_keeps_a_day_past_the_month_end` | recurring | `test_recurring_intervals.py::test_unchanged_first_date_keeps_a_day_past_the_month_end` | PORTED | 1:1 |
| `test_recurring_intervals.py::test_interval_round_trips_through_export_and_import` | recurring | `test_recurring_intervals.py::test_interval_round_trips_through_export_and_import` | PORTED | Ported in this pass; /api/bootstrap replaces GET /. |
| `test_recurring_intervals.py::test_workbook_without_interval_columns_imports_as_monthly` | recurring | `test_recurring_intervals.py::test_workbook_without_interval_columns_imports_as_monthly` | PORTED | Ported in this pass; same v3-workbook surgery with openpyxl. |
| `test_reports.py::test_cash_flow_nets_income_against_signed_expenses` | reports | `test_reports.py::test_cash_flow_nets_income_against_signed_expenses` | PORTED | 1:1 |
| `test_reports.py::test_savings_rate_and_month_extremes` | reports | `test_reports.py::test_savings_rate_and_month_extremes` | PORTED | 1:1 |
| `test_reports.py::test_savings_rate_is_none_without_income` | reports | `test_reports.py::test_savings_rate_is_none_without_income` | PORTED | 1:1 |
| `test_reports.py::test_category_ranking_orders_by_outflow_with_shares_and_deltas` | reports | `test_reports.py::test_category_ranking_orders_by_outflow_with_shares_and_deltas` | PORTED | 1:1 |
| `test_reports.py::test_refund_only_category_does_not_distort_shares` | reports | `test_reports.py::test_refund_only_category_does_not_distort_shares` | PORTED | 1:1 |
| `test_reports.py::test_chart_only_plots_months_that_happened` | reports | `test_reports.py::test_chart_only_plots_months_that_happened` | PORTED | 1:1 |
| `test_reports.py::test_chart_spec_handles_an_empty_year` | reports | `test_reports.py::test_chart_spec_handles_an_empty_year` | PORTED | 1:1 |
| `test_reports.py::test_legacy_report_section_links_still_resolve` | reports | `test_reports.py::test_legacy_report_section_links_still_resolve` | PORTED | DOM `active` class -> `GET /api/reports/section` returns the normalised section. FRONTEND must map old `?panel=reports&reports_section=` URLs through it. |
| `test_settings_and_export.py::test_settings_sections_load` | settings / export | `test_settings_and_export.py::test_settings_sections_load` | PORTED | Each section's data endpoint answers 200 (`general` is client-only). |
| `test_settings_and_export.py::test_income_category_add_edit_delete` | settings / export | `test_settings_and_export.py::test_income_category_add_edit_delete` | PORTED | 1:1 |
| `test_settings_and_export.py::test_account_edit_and_delete` | settings / export | `test_settings_and_export.py::test_account_edit_and_delete` | PORTED | 1:1 |
| `test_settings_and_export.py::test_integrations_save` | settings / export | `test_settings_and_export.py::test_integrations_save` | PORTED | 1:1 |
| `test_settings_and_export.py::test_excel_export_downloads` | settings / export | `test_settings_and_export.py::test_excel_export_downloads` | PORTED | 1:1 |
| `test_shared.py::test_allocate_adds_up_and_spreads_leftover_cents` | shared expenses | `test_shared.py::test_allocate_adds_up_and_spreads_leftover_cents` | PORTED | 1:1 |
| `test_shared.py::test_parse_cents_accepts_comma_and_rejects_garbage` | shared expenses | `test_shared.py::test_parse_cents_accepts_comma_and_rejects_garbage` | PORTED | 1:1 |
| `test_shared.py::test_compute_splits_every_method` | shared expenses | `test_shared.py::test_compute_splits_every_method` | PORTED | 1:1 |
| `test_shared.py::test_simplify_debts_needs_at_most_n_minus_one_payments` | shared expenses | `test_shared.py::test_simplify_debts_needs_at_most_n_minus_one_payments` | PORTED | 1:1 |
| `test_shared.py::test_paying_a_shared_bill_books_only_my_share_as_spending` | shared expenses | `test_shared.py::test_paying_a_shared_bill_books_only_my_share_as_spending` | PORTED | "Suggested payments"/"Dinner" in the page -> `suggestions` and activity fields. |
| `test_shared.py::test_someone_else_paying_books_my_share_against_shared_balances` | shared expenses | `test_shared.py::test_someone_else_paying_books_my_share_against_shared_balances` | PORTED | 1:1 |
| `test_shared.py::test_editing_and_deleting_rebuild_the_linked_rows` | shared expenses | `test_shared.py::test_editing_and_deleting_rebuild_the_linked_rows` | PORTED | 1:1 |
| `test_shared.py::test_unrecorded_bills_leave_my_accounts_alone` | shared expenses | `test_shared.py::test_unrecorded_bills_leave_my_accounts_alone` | PORTED | 1:1 |
| `test_shared.py::test_bad_split_is_rejected_without_saving` | shared expenses | `test_shared.py::test_bad_split_is_rejected_without_saving` | PORTED | 1:1 |
| `test_shared.py::test_member_with_history_cannot_be_removed` | shared expenses | `test_shared.py::test_member_with_history_cannot_be_removed` | PORTED | 1:1 |
| `test_shared.py::test_deleting_a_group_removes_its_personal_rows` | shared expenses | `test_shared.py::test_deleting_a_group_removes_its_personal_rows` | PORTED | 1:1 |
| `test_shared.py::test_groups_are_private_to_their_owner` | shared expenses | `test_shared.py::test_groups_are_private_to_their_owner` | PORTED | 1:1 |
| `test_shared.py::test_invited_user_sees_group_only_after_joining` | shared expenses | `test_shared.py::test_invited_user_sees_group_only_after_joining` | PORTED | "invited you to" / "All groups" / "created by" -> `/api/shared` `invitations`, group detail `is_owner` / `owner_name`; error page -> 404 "Group not found." |
| `test_shared.py::test_each_member_records_their_own_side` | shared expenses | `test_shared.py::test_each_member_records_their_own_side` | PORTED | "Not in your budget yet" -> bill `involved` and not `recorded`. |
| `test_shared.py::test_only_the_creator_can_delete_and_members_can_leave` | shared expenses | `test_shared.py::test_only_the_creator_can_delete_and_members_can_leave` | PORTED | 1:1 |
| `test_shared.py::test_declined_member_stays_a_name_without_access` | shared expenses | `test_shared.py::test_declined_member_stays_a_name_without_access` | PORTED | "declined" text -> member `status == "declined"`. |
| `test_shared.py::test_friend_balance_adds_up_across_groups_by_login` | shared expenses | `test_shared.py::test_friend_balance_adds_up_across_groups_by_login` | PORTED | 1:1 |
| `test_shared.py::test_linking_a_contact_invites_them_to_existing_groups` | shared expenses | `test_shared.py::test_linking_a_contact_invites_them_to_existing_groups` | PORTED | "invited you to" -> `invitations` list. |
| `test_tags.py::test_tags_are_found_in_any_script_and_compared_without_case_or_accents` | tags | `test_tags.py::test_tags_are_found_in_any_script_and_compared_without_case_or_accents` | PORTED | 1:1 |
| `test_tags.py::test_linkify_escapes_html_and_links_tags` | tags | `test_tags.py::test_linkify_escapes_html_and_links_tags` | PORTED | linkify kept in core; the SPA may not use it. |
| `test_tags.py::test_tag_numbers_are_not_amounts` | tags | `test_tags.py::test_tag_numbers_are_not_amounts` | PORTED | 1:1 |
| `test_tags.py::test_web_tag_report_adds_up_across_categories` | tags | `test_tags.py::test_tag_totals_add_up_across_categories` | PORTED | Core maths + `/api/reports/tags` (list and single tag, totals 425.50 / -405.50, Hotel first, refund row). The income row is inserted by SQL. FRONTEND must guarantee: tags in the expense list link to the tag report, a `#` suggestion box, chips only for recent tags (data in bootstrap `tag_names` / `recent_tags`). |
| `test_tags.py::test_telegram_keeps_tags_and_still_finds_the_category` | tags | `test_telegram_tags.py::test_telegram_keeps_tags_and_still_finds_the_category` | PORTED | 1:1 |
| `test_tags.py::test_tag_mode_tags_every_entry_until_turned_off` | tags | `test_telegram_tags.py::test_tag_mode_tags_every_entry_until_turned_off` | PORTED | 1:1 |
| `test_tags.py::test_questions_and_tags_command` | tags | `test_telegram_tags.py::test_questions_and_tags_command` | PORTED | 1:1 |
| `test_tags.py::test_shared_bill_keeps_its_tag_in_my_share` | tags | `test_telegram_tags.py::test_shared_bill_keeps_its_tag_in_my_share` | PORTED | 1:1 |
| `test_tags.py::test_chips_offer_only_a_few_recently_used_tags` | tags | `test_tags.py::test_chips_offer_only_a_few_recently_used_tags` | PORTED | 1:1 |
| `test_telegram_bot.py::test_amounts_skip_dates_times_units_and_percentages` | telegram | `test_telegram_bot.py::test_amounts_skip_dates_times_units_and_percentages` | PORTED | 1:1 |
| `test_telegram_bot.py::test_dates_from_words_and_numbers` | telegram | `test_telegram_bot.py::test_dates_from_words_and_numbers` | PORTED | 1:1 |
| `test_telegram_bot.py::test_account_detection_handles_greek_greeklish_and_generic_words` (9 cases) | telegram | `test_telegram_bot.py::test_account_detection_handles_greek_greeklish_and_generic_words` | PORTED | same 9 parametrised cases |
| `test_telegram_bot.py::test_basic_parser_splits_several_transactions_and_finds_income` | telegram | `test_telegram_bot.py::test_basic_parser_splits_several_transactions_and_finds_income` | PORTED | 1:1 |
| `test_telegram_bot.py::test_history_beats_the_ai_and_keywords` | telegram | `test_telegram_bot.py::test_history_beats_the_ai_and_keywords` | PORTED | 1:1 |
| `test_telegram_bot.py::test_ai_transactions_are_capped_to_the_amounts_written` | telegram | `test_telegram_bot.py::test_ai_transactions_are_capped_to_the_amounts_written` | PORTED | 1:1 |
| `test_telegram_bot.py::test_unusable_ai_answer_falls_back_to_the_basic_parser` | telegram | `test_telegram_bot.py::test_unusable_ai_answer_falls_back_to_the_basic_parser` | PORTED | 1:1 |
| `test_telegram_bot.py::test_receipt_total_and_date_come_from_the_text` | telegram | `test_telegram_bot.py::test_receipt_total_and_date_come_from_the_text` | PORTED | 1:1 |
| `test_telegram_bot.py::test_questions_are_told_apart_from_entries` | telegram | `test_telegram_bot.py::test_questions_are_told_apart_from_entries` | PORTED | 1:1 |
| `test_telegram_bot.py::test_text_without_ai_records_with_the_named_account` | telegram | `test_telegram_bot.py::test_text_without_ai_records_with_the_named_account` | PORTED | 1:1 |
| `test_telegram_bot.py::test_buttons_change_category_account_and_date_then_undo` | telegram | `test_telegram_bot.py::test_buttons_change_category_account_and_date_then_undo` | PORTED | 1:1 |
| `test_telegram_bot.py::test_undo_never_touches_entries_made_on_the_web` | telegram | `test_telegram_bot.py::test_undo_never_touches_entries_made_on_the_web` | PORTED | 1:1 |
| `test_telegram_bot.py::test_several_transactions_in_one_message_with_ai` | telegram | `test_telegram_bot.py::test_several_transactions_in_one_message_with_ai` | PORTED | 1:1 |
| `test_telegram_bot.py::test_past_choices_are_offered_to_the_ai_and_override_it` | telegram | `test_telegram_bot.py::test_past_choices_are_offered_to_the_ai_and_override_it` | PORTED | 1:1 |
| `test_telegram_bot.py::test_shared_bill_from_telegram_splits_and_books_my_share` | telegram | `test_telegram_bot.py::test_shared_bill_from_telegram_splits_and_books_my_share` | PORTED | 1:1 |
| `test_telegram_bot.py::test_questions_are_answered_from_the_database` | telegram | `test_telegram_bot.py::test_questions_are_answered_from_the_database` | PORTED | 1:1 |
| `test_telegram_bot.py::test_receipt_photo_is_read_and_recorded` | telegram | `test_telegram_bot.py::test_receipt_photo_is_read_and_recorded` | PORTED | 1:1 |
| `test_telegram_bot.py::test_receipts_need_an_ocr_model` | telegram | `test_telegram_bot.py::test_receipts_need_an_ocr_model` | PORTED | 1:1 |
| `test_telegram_bot.py::test_default_account_command` | telegram | `test_telegram_bot.py::test_default_account_command` | PORTED | 1:1 |
| `test_telegram_bot.py::test_other_chats_cannot_press_my_buttons` | telegram | `test_telegram_bot.py::test_other_chats_cannot_press_my_buttons` | PORTED | 1:1 |
| `test_telegram_bot.py::test_edited_messages_are_ignored` | telegram | `test_telegram_bot.py::test_edited_messages_are_ignored` | PORTED | 1:1 |
| `test_telegram_bot.py::test_ocr_model_is_saved_from_settings` | telegram | `test_telegram_bot.py::test_ocr_model_is_saved_from_settings` | PORTED | Form -> PUT /api/settings/integrations/ai; the page field -> `ai.ai_ocr_model`. |
| `test_telegram_bot.py::test_categories_match_whatever_the_user_named_them` (7 cases) | telegram | `test_telegram_bot.py::test_categories_match_whatever_the_user_named_them` | PORTED | same 7 parametrised cases |
| `test_telegram_bot.py::test_a_category_written_in_the_message_is_used` | telegram | `test_telegram_bot.py::test_a_category_written_in_the_message_is_used` | PORTED | 1:1 |
| `test_telegram_bot.py::test_catch_all_is_the_users_own` | telegram | `test_telegram_bot.py::test_catch_all_is_the_users_own` | PORTED | 1:1 |
| `test_telegram_bot.py::test_bot_uses_renamed_categories_and_creates_none` | telegram | `test_telegram_bot.py::test_bot_uses_renamed_categories_and_creates_none` | PORTED | 1:1 |
| `test_telegram_bot.py::test_counts_of_months_or_times_are_not_amounts` | telegram | `test_telegram_bot.py::test_counts_of_months_or_times_are_not_amounts` | PORTED | 1:1 |
| `test_telegram_bot.py::test_the_ais_repeat_is_kept_only_when_it_makes_sense` | telegram | `test_telegram_bot.py::test_the_ais_repeat_is_kept_only_when_it_makes_sense` | PORTED | 1:1 |
| `test_telegram_bot.py::test_a_repeating_entry_may_start_later_but_a_one_off_may_not` | telegram | `test_telegram_bot.py::test_a_repeating_entry_may_start_later_but_a_one_off_may_not` | PORTED | 1:1 |
| `test_telegram_bot.py::test_recurring_message_creates_a_rule_and_its_first_entry` | telegram | `test_telegram_bot.py::test_recurring_message_creates_a_rule_and_its_first_entry` | PORTED | 1:1 |
| `test_telegram_bot.py::test_recurring_income_without_end_starting_next_month` | telegram | `test_telegram_bot.py::test_recurring_income_without_end_starting_next_month` | PORTED | 1:1 |
| `test_telegram_bot.py::test_shared_bills_cannot_repeat` | telegram | `test_telegram_bot.py::test_shared_bills_cannot_repeat` | PORTED | 1:1 |
| `test_telegram_bot.py::test_old_telegram_entries_table_gains_the_recurring_kind` | telegram | `test_telegram_bot.py::test_old_telegram_entries_table_gains_the_recurring_kind` | PORTED | 1:1 |
| `test_telegram_bot.py::test_the_amount_written_beats_the_ais_reading_of_it` | telegram | `test_telegram_bot.py::test_the_amount_written_beats_the_ais_reading_of_it` | PORTED | 1:1 |
| `test_telegram_notify.py::test_budget_alerts_once_per_threshold_and_not_at_night` | telegram notifications | `test_telegram_notify.py::test_budget_alerts_once_per_threshold_and_not_at_night` | PORTED | 1:1 |
| `test_telegram_notify.py::test_no_budget_alerts_when_budgets_are_off_or_alerts_disabled` | telegram notifications | `test_telegram_notify.py::test_no_budget_alerts_when_budgets_are_off_or_alerts_disabled` | PORTED | 1:1 |
| `test_telegram_notify.py::test_bot_entry_that_crosses_a_budget_gets_an_alert_right_away` | telegram notifications | `test_telegram_notify.py::test_bot_entry_that_crosses_a_budget_gets_an_alert_right_away` | PORTED | 1:1 |
| `test_telegram_notify.py::test_card_reminders_before_on_and_after_the_due_day_until_paid` | telegram notifications | `test_telegram_notify.py::test_card_reminders_before_on_and_after_the_due_day_until_paid` | PORTED | 1:1 |
| `test_telegram_notify.py::test_bill_reminder_the_day_before_with_a_shortfall_warning` | telegram notifications | `test_telegram_notify.py::test_bill_reminder_the_day_before_with_a_shortfall_warning` | PORTED | 1:1 |
| `test_telegram_notify.py::test_weekly_summary_only_on_sunday_evening` | telegram notifications | `test_telegram_notify.py::test_weekly_summary_only_on_sunday_evening` | PORTED | 1:1 |
| `test_telegram_notify.py::test_monthly_summary_on_the_first_with_catch_up` | telegram notifications | `test_telegram_notify.py::test_monthly_summary_on_the_first_with_catch_up` | PORTED | 1:1 |
| `test_telegram_notify.py::test_notifications_command_toggles_each_kind` | telegram notifications | `test_telegram_notify.py::test_notifications_command_toggles_each_kind` | PORTED | 1:1 |
| `test_telegram_notify.py::test_notification_settings_form` | telegram notifications | `test_telegram_notify.py::test_notification_settings_form` | PORTED | Form POST 302 -> PUT /api/settings/telegram/notifications 200; settings page fields -> `/api/settings/integrations` (`notify_kinds` includes weekly, `card_days` 5). |
