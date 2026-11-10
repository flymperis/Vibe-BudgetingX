# Test parity: old app -> Vibe Budgeting X

Every test function of the old app (`C:\Users\fotis\code\Vibe-Budgeting\tests`) and the new
test that covers it. Rule (ARCHITECTURE.md): no old test is dropped silently. When you port one,
replace PENDING with `tests/<file>.py::<name>` and say in Notes what changed (status codes, HTML
assertions that became JSON assertions, ...). New test files are named like the old file they port,
so a domain task extends the file that already exists (e.g. `tests/test_shared.py` already holds
the four pure split tests).

Counts: **208 old test functions** (236 collected test cases once parametrisation is
expanded). Ported: **34**, partially ported: **2**, PENDING: **172**.

The backend also has tests with no old counterpart (auth contract, expenses API rules, bootstrap,
SPA serving, error format, migrations): `tests/test_auth.py`, `tests/test_expenses.py`,
`tests/test_bootstrap.py`, `tests/test_app.py`, plus
`tests/test_db_locking_and_category_delete.py::test_request_connection_has_the_same_settings_and_is_always_closed`.

| Old test | Domain | New test | Notes |
| --- | --- | --- | --- |
| `test_backup.py::test_backup_is_a_complete_checked_copy_even_while_the_app_writes` | backup | `tests/test_backup.py::test_backup_is_a_complete_checked_copy_even_while_the_app_writes` | 1:1 |
| `test_backup.py::test_rotation_keeps_14_days_and_one_per_month_and_nothing_else_is_touched` | backup | `tests/test_backup.py::test_rotation_keeps_14_days_and_one_per_month_and_nothing_else_is_touched` | 1:1 |
| `test_backup.py::test_schedule` | backup | `tests/test_backup.py::test_schedule` | 1:1 |
| `test_backup.py::test_run_if_due_and_switch_off` | backup | `tests/test_backup.py::test_run_if_due_and_switch_off` | 1:1 |
| `test_backup.py::test_command_line_snapshot` | backup | `tests/test_backup.py::test_command_line_snapshot` | 1:1 |
| `test_backup.py::test_sleeps_until_the_nightly_time_but_at_most_an_hour` | backup | `tests/test_backup.py::test_sleeps_until_the_nightly_time_but_at_most_an_hour` | 1:1 |
| `test_banks.py::test_detect_bank_from_account_name` (12 cases) | banks | `tests/test_banks.py::test_detect_bank_from_account_name` | 1:1, same 12 cases |
| `test_banks.py::test_unknown_names_have_no_bank` (4 cases) | banks | `tests/test_banks.py::test_unknown_names_have_no_bank` | 1:1, same 4 cases |
| `test_banks.py::test_dashboard_shows_bank_badges` | banks | `tests/test_banks.py::test_bootstrap_shows_bank_badges` | badges come from /api/bootstrap accounts[].bank instead of page HTML; the accounts are inserted via SQL until the accounts router exists (switch to the API then) |
| `test_banks.py::test_every_shipped_logo_is_served` | banks | `tests/test_banks.py::test_every_shipped_logo_is_served` | logos copied to backend/vbx/static/banks, served at the same /static/banks/ URLs |
| `test_budget.py::test_toggle_enables_and_disables` | budget | PENDING | budget router |
| `test_budget.py::test_default_and_override_drive_the_month` | budget | PENDING | budget router |
| `test_budget.py::test_negative_amount_is_rejected_without_partial_save` | budget | PENDING | budget router |
| `test_budget.py::test_cannot_budget_someone_elses_category` | budget | PENDING | budget router |
| `test_budget.py::test_deleting_a_category_drops_its_budgets` | budget | PENDING | budget router |
| `test_budget.py::test_home_and_consolidated_show_budget_when_enabled` | budget | PENDING | budget router |
| `test_budget.py::test_budgets_survive_export_import` | budget | PENDING | budget router |
| `test_budget.py::test_spending_history_average_window_and_refunds` | budget | PENDING | budget router |
| `test_budget.py::test_spending_history_refunds_reduce_average_and_clamp_at_zero` | budget | PENDING | budget router |
| `test_budget.py::test_spending_history_new_user_divides_by_months_actually_lived` | budget | PENDING | budget router |
| `test_budget.py::test_spending_history_suggested_rounds_up_to_multiple_of_five` | budget | PENDING | budget router |
| `test_budget.py::test_spending_history_active_flags` | budget | PENDING | budget router |
| `test_budget.py::test_other_amount_set_reflected_in_totals_and_over` | budget | PENDING | budget router |
| `test_budget.py::test_other_amount_cleared_by_blank` | budget | PENDING | budget router |
| `test_budget.py::test_other_amount_negative_rejected_without_partial_save` | budget | PENDING | budget router |
| `test_budget.py::test_other_amount_works_without_prior_budget_settings_row` | budget | PENDING | budget router |
| `test_budget.py::test_dashboard_budget_panel_renders_form_controls_and_order` | budget | PENDING | budget router |
| `test_budget.py::test_other_amount_survives_export_import_round_trip` | budget | PENDING | budget router |
| `test_budget.py::test_old_workbook_without_other_amount_meta_key_does_not_clear_it` | budget | PENDING | budget router |
| `test_budget.py::test_spending_history_active_when_only_spending_is_in_selected_month` | budget | PENDING | budget router |
| `test_budget.py::test_budget_for_month_float_rounding_avoids_false_over` | budget | PENDING | budget router |
| `test_budget.py::test_parse_amount_rejects_non_finite_and_over_ceiling` | budget | `tests/test_budget.py::test_parse_amount_rejects_non_finite_and_over_ceiling` | 1:1 (pure) |
| `test_budget.py::test_defaults_route_rejects_junk_amounts_without_partial_write` | budget | PENDING | budget router |
| `test_budget.py::test_override_route_rejects_junk_amounts` | budget | PENDING | budget router |
| `test_budget.py::test_import_without_budgets_sheet_keeps_existing_budgets` | budget | PENDING | budget router |
| `test_budget.py::test_import_with_budgets_sheet_replaces_existing_budgets` | budget | PENDING | budget router |
| `test_budget.py::test_spending_history_today_param_limits_window_to_past_months` | budget | PENDING | budget router |
| `test_budget.py::test_total_pct_is_100_when_all_budgets_zero_and_spending_exists` | budget | PENDING | budget router |
| `test_budget.py::test_override_route_rejects_invalid_month` | budget | PENDING | budget router |
| `test_budget.py::test_home_card_renders_with_only_other_amount_set` | budget | PENDING | budget router |
| `test_budget.py::test_fixed_flag_persists_clears_and_is_untouched_when_amount_field_absent` | budget | PENDING | budget router |
| `test_budget.py::test_fixed_flag_all_or_nothing_on_invalid_amount` | budget | PENDING | budget router |
| `test_budget.py::test_fixed_flag_ignores_other_users_category` | budget | PENDING | budget router |
| `test_budget.py::test_deleting_category_cascades_fixed_flag` | budget | PENDING | budget router |
| `test_budget.py::test_budget_form_rows_expose_fixed_and_checkbox_is_checked` | budget | PENDING | budget router |
| `test_budget.py::test_excel_round_trip_preserves_fixed_flag_with_no_default_amount` | budget | PENDING | budget router |
| `test_budget.py::test_import_replace_mode_with_budgets_sheet_replaces_fixed_flag` | budget | PENDING | budget router |
| `test_budget.py::test_import_merge_mode_budgets_sheet_without_fixed_column_leaves_existing_flags` | budget | PENDING | budget router |
| `test_budget.py::test_import_blank_amount_default_row_with_fixed_zero_is_an_error` | budget | PENDING | budget router |
| `test_budget.py::test_month_budget_snapshots_newest_first_and_effective_amounts` | budget | PENDING | budget router |
| `test_budget.py::test_month_budget_snapshots_omits_categories_with_neither` | budget | PENDING | budget router |
| `test_budget.py::test_month_budget_snapshots_only_months_with_an_override_are_listed` | budget | PENDING | budget router |
| `test_budget.py::test_month_budget_snapshots_isolates_other_users` | budget | PENDING | budget router |
| `test_budget.py::test_month_budget_snapshots_respects_limit` | budget | PENDING | budget router |
| `test_budget.py::test_clear_month_hides_defaults_and_other_for_that_month_only` | budget | PENDING | budget router |
| `test_budget.py::test_clear_month_deletes_that_months_existing_overrides` | budget | PENDING | budget router |
| `test_budget.py::test_override_after_clear_budgets_only_that_category` | budget | PENDING | budget router |
| `test_budget.py::test_reset_to_default_on_cleared_month_removes_the_budget` | budget | PENDING | budget router |
| `test_budget.py::test_restore_month_brings_back_defaults_and_keeps_post_clear_overrides` | budget | PENDING | budget router |
| `test_budget.py::test_clear_and_restore_month_reject_invalid_month_without_write` | budget | PENDING | budget router |
| `test_budget.py::test_clear_month_isolated_per_user` | budget | PENDING | budget router |
| `test_budget.py::test_deleting_category_does_not_break_a_cleared_month` | budget | PENDING | budget router |
| `test_budget.py::test_month_budget_snapshots_for_cleared_month_ignores_defaults` | budget | PENDING | budget router |
| `test_budget.py::test_month_budget_snapshots_skips_cleared_month_with_no_overrides_left` | budget | PENDING | budget router |
| `test_budget.py::test_clear_month_survives_export_import_round_trip` | budget | PENDING | budget router |
| `test_budget.py::test_old_workbook_without_budget_cleared_months_key_does_not_clear_anything` | budget | PENDING | budget router |
| `test_budget.py::test_import_rejects_junk_in_budget_cleared_months` | budget | PENDING | budget router |
| `test_budget.py::test_defaults_form_on_cleared_month_preserves_other_amount` | budget | PENDING | budget router |
| `test_core_flows.py::test_register_and_dashboard_load` | auth / bootstrap | `tests/test_core_flows.py::test_register_and_bootstrap_load` | dashboard page -> GET /api/bootstrap |
| `test_core_flows.py::test_logout_requires_csrf_then_succeeds` | auth / CSRF | `tests/test_core_flows.py::test_logout_requires_csrf_then_succeeds` | missing CSRF is 403 (old: 400); logged out is 401 (old: redirect to /login) |
| `test_core_flows.py::test_login_cookie_survives_closing_the_app` | auth / session | `tests/test_core_flows.py::test_login_cookie_survives_closing_the_app` | cookie vbx_session carries Max-Age (365 days) instead of Expires |
| `test_core_flows.py::test_dashboard_loads_every_panel` | all panels | PENDING | no panels in the API: each domain task adds a 'loads for a new user' test for its GET endpoints. The bootstrap part is covered by tests/test_bootstrap.py::test_bootstrap_shape_for_a_new_user |
| `test_core_flows.py::test_add_edit_delete_expense` | expenses | `tests/test_core_flows.py::test_add_edit_delete_expense` | via /api/expenses |
| `test_core_flows.py::test_add_income_entry` | income | PENDING | income router |
| `test_core_flows.py::test_add_expense_and_income_with_chosen_date` | expenses + income | `tests/test_core_flows.py::test_add_expense_with_chosen_date` | PARTIAL: expense half ported; income half PENDING (income router). The 'form has a date field' HTML check belongs to the frontend |
| `test_core_flows.py::test_add_account_and_category` | accounts / categories | PENDING | accounts + categories routers |
| `test_credit_cards.py::test_statement_close_and_due_dates` | credit cards | `tests/test_credit_cards.py::test_statement_close_and_due_dates` | 1:1 (pure) |
| `test_credit_cards.py::test_add_card_stores_owed_opening_balance_as_negative` | credit cards | PENDING | credit cards router |
| `test_credit_cards.py::test_card_fields_are_validated` | credit cards | PENDING | credit cards router |
| `test_credit_cards.py::test_statement_follows_spending_and_payments` | credit cards | PENDING | credit cards router |
| `test_credit_cards.py::test_home_splits_totals_and_pay_link_prefills_transfer` | credit cards | PENDING | credit cards router |
| `test_credit_cards.py::test_card_settings_survive_export_import` | credit cards | PENDING | credit cards router |
| `test_db_locking_and_category_delete.py::test_busy_timeout_is_actually_applied` | db | `tests/test_db_locking_and_category_delete.py::test_busy_timeout_is_actually_applied` | 1:1 |
| `test_db_locking_and_category_delete.py::test_foreign_keys_stay_on` | db | `tests/test_db_locking_and_category_delete.py::test_foreign_keys_stay_on` | 1:1 |
| `test_db_locking_and_category_delete.py::test_journal_mode_is_wal_or_a_working_fallback` | db | `tests/test_db_locking_and_category_delete.py::test_journal_mode_is_wal_or_a_working_fallback` | 1:1 |
| `test_db_locking_and_category_delete.py::test_deleting_category_with_expenses_is_refused_not_a_500` | categories | PENDING | categories router |
| `test_db_locking_and_category_delete.py::test_deleting_income_category_with_entries_is_refused` | categories | PENDING | categories router |
| `test_db_locking_and_category_delete.py::test_unused_category_still_deletes` | categories | PENDING | categories router |
| `test_db_locking_and_category_delete.py::test_recurring_rule_blocks_delete_even_though_it_has_no_foreign_key` | categories | PENDING | categories router |
| `test_db_locking_and_category_delete.py::test_refused_delete_does_not_leave_the_database_locked` | categories / db | PENDING | categories router (the connection-always-closed part is covered by tests/test_db_locking_and_category_delete.py::test_request_connection_has_the_same_settings_and_is_always_closed) |
| `test_db_locking_and_category_delete.py::test_concurrent_writers_do_not_deadlock` | db | `tests/test_db_locking_and_category_delete.py::test_concurrent_writers_do_not_deadlock` | 1:1 |
| `test_db_locking_and_category_delete.py::test_a_leaked_transaction_blocks_writers_in_every_journal_mode` | db | `tests/test_db_locking_and_category_delete.py::test_a_leaked_transaction_blocks_writers_in_every_journal_mode` | 1:1 (pure sqlite3) |
| `test_export_import_roundtrip.py::test_export_covers_every_sheet` | excel import/export | PENDING | excel import/export router |
| `test_export_import_roundtrip.py::test_export_import_round_trip_preserves_everything` | excel import/export | PENDING | excel import/export router |
| `test_export_import_roundtrip.py::test_restored_recurring_rule_does_not_repost` | excel import/export | PENDING | excel import/export router |
| `test_export_import_roundtrip.py::test_version_1_workbook_still_imports` | excel import/export | PENDING | excel import/export router |
| `test_investments_and_rules.py::test_stock_add_edit_delete` | investments | PENDING | investments router |
| `test_investments_and_rules.py::test_crypto_add_edit_delete` | investments | PENDING | investments router |
| `test_investments_and_rules.py::test_dashboard_loads_with_holdings` | investments | PENDING | investments router |
| `test_investments_and_rules.py::test_recurring_add_edit_delete` | recurring | PENDING | recurring router |
| `test_investments_and_rules.py::test_transfer_between_accounts` | transfers | PENDING | transfers router |
| `test_investments_and_rules.py::test_transfer_rejects_same_account` | transfers | PENDING | transfers router |
| `test_price_fetch_gating.py::test_non_investments_panel_does_not_fetch_live_prices` | investments | PENDING | investments router |
| `test_price_fetch_gating.py::test_investments_panel_fetches_live_prices` | investments | PENDING | investments router |
| `test_price_fetch_gating.py::test_refresh_param_fetches_live_prices_on_other_panels` | investments | PENDING | investments router |
| `test_price_fetch_gating.py::test_investments_data_shows_dash_not_zero_when_unloaded` | investments | PENDING | investments router |
| `test_pwa_manifest.py::test_manifest_served_without_login` | frontend (PWA) | PENDING | frontend (PWA) router |
| `test_pwa_manifest.py::test_manifest_is_valid_standalone_manifest_with_icons_on_disk` | frontend (PWA) | PENDING | frontend (PWA) router |
| `test_pwa_manifest.py::test_login_page_links_manifest_and_apple_touch_icon` | frontend (PWA) | PENDING | frontend (PWA) router |
| `test_recurring_intervals.py::test_weekly_occurrences_step_by_whole_weeks` | recurring | `tests/test_recurring_intervals.py::test_weekly_occurrences_step_by_whole_weeks` | 1:1 (pure) |
| `test_recurring_intervals.py::test_monthly_occurrences_clamp_to_short_months` | recurring | `tests/test_recurring_intervals.py::test_monthly_occurrences_clamp_to_short_months` | 1:1 (pure) |
| `test_recurring_intervals.py::test_every_three_months_and_times_cap` | recurring | `tests/test_recurring_intervals.py::test_every_three_months_and_times_cap` | 1:1 (pure) |
| `test_recurring_intervals.py::test_yearly_on_leap_day_falls_back_to_feb_28` | recurring | `tests/test_recurring_intervals.py::test_yearly_on_leap_day_falls_back_to_feb_28` | 1:1 (pure) |
| `test_recurring_intervals.py::test_weekly_rule_catches_up_from_a_past_first_date_once` | recurring | PENDING | recurring router |
| `test_recurring_intervals.py::test_every_two_weeks_and_every_three_months` | recurring | PENDING | recurring router |
| `test_recurring_intervals.py::test_future_first_date_posts_nothing_yet` | recurring | PENDING | recurring router |
| `test_recurring_intervals.py::test_invalid_interval_is_rejected` | recurring | PENDING | recurring router |
| `test_recurring_intervals.py::test_form_without_first_date_keeps_the_old_monthly_behaviour` | recurring | PENDING | recurring router |
| `test_recurring_intervals.py::test_migrated_monthly_rules_post_exactly_as_before` | recurring | PENDING | recurring router |
| `test_recurring_intervals.py::test_backfill_leaves_rules_with_a_start_date_alone` | recurring | PENDING | recurring router |
| `test_recurring_intervals.py::test_switching_monthly_to_weekly_does_not_repost_the_past` | recurring | PENDING | recurring router |
| `test_recurring_intervals.py::test_editing_only_the_amount_keeps_the_schedule` | recurring | PENDING | recurring router |
| `test_recurring_intervals.py::test_unchanged_first_date_keeps_a_day_past_the_month_end` | recurring | PENDING | recurring router |
| `test_recurring_intervals.py::test_interval_round_trips_through_export_and_import` | recurring | PENDING | recurring router |
| `test_recurring_intervals.py::test_workbook_without_interval_columns_imports_as_monthly` | recurring | PENDING | recurring router |
| `test_reports.py::test_cash_flow_nets_income_against_signed_expenses` | reports | PENDING | reports router |
| `test_reports.py::test_savings_rate_and_month_extremes` | reports | PENDING | reports router |
| `test_reports.py::test_savings_rate_is_none_without_income` | reports | PENDING | reports router |
| `test_reports.py::test_category_ranking_orders_by_outflow_with_shares_and_deltas` | reports | PENDING | reports router |
| `test_reports.py::test_refund_only_category_does_not_distort_shares` | reports | PENDING | reports router |
| `test_reports.py::test_chart_only_plots_months_that_happened` | reports | PENDING | reports router |
| `test_reports.py::test_chart_spec_handles_an_empty_year` | reports | `tests/test_reports.py::test_chart_spec_handles_an_empty_year` | 1:1 (pure) |
| `test_reports.py::test_legacy_report_section_links_still_resolve` | reports | PENDING | reports router |
| `test_settings_and_export.py::test_settings_sections_load` | settings | PENDING | settings router |
| `test_settings_and_export.py::test_income_category_add_edit_delete` | categories | PENDING | categories router |
| `test_settings_and_export.py::test_account_edit_and_delete` | accounts | PENDING | accounts router |
| `test_settings_and_export.py::test_integrations_save` | integrations | PENDING | integrations router |
| `test_settings_and_export.py::test_excel_export_downloads` | excel import/export | PENDING | excel import/export router |
| `test_shared.py::test_allocate_adds_up_and_spreads_leftover_cents` | shared | `tests/test_shared.py::test_allocate_adds_up_and_spreads_leftover_cents` | 1:1 (pure) |
| `test_shared.py::test_parse_cents_accepts_comma_and_rejects_garbage` | shared | `tests/test_shared.py::test_parse_cents_accepts_comma_and_rejects_garbage` | 1:1 (pure) |
| `test_shared.py::test_compute_splits_every_method` | shared | `tests/test_shared.py::test_compute_splits_every_method` | 1:1 (pure) |
| `test_shared.py::test_simplify_debts_needs_at_most_n_minus_one_payments` | shared | `tests/test_shared.py::test_simplify_debts_needs_at_most_n_minus_one_payments` | 1:1 (pure) |
| `test_shared.py::test_paying_a_shared_bill_books_only_my_share_as_spending` | shared | PENDING | shared router |
| `test_shared.py::test_someone_else_paying_books_my_share_against_shared_balances` | shared | PENDING | shared router |
| `test_shared.py::test_editing_and_deleting_rebuild_the_linked_rows` | shared | PENDING | shared router |
| `test_shared.py::test_unrecorded_bills_leave_my_accounts_alone` | shared | PENDING | shared router |
| `test_shared.py::test_bad_split_is_rejected_without_saving` | shared | PENDING | shared router |
| `test_shared.py::test_member_with_history_cannot_be_removed` | shared | PENDING | shared router |
| `test_shared.py::test_deleting_a_group_removes_its_personal_rows` | shared | PENDING | shared router |
| `test_shared.py::test_groups_are_private_to_their_owner` | shared | PENDING | shared router |
| `test_shared.py::test_invited_user_sees_group_only_after_joining` | shared | PENDING | shared router |
| `test_shared.py::test_each_member_records_their_own_side` | shared | PENDING | shared router |
| `test_shared.py::test_only_the_creator_can_delete_and_members_can_leave` | shared | PENDING | shared router |
| `test_shared.py::test_declined_member_stays_a_name_without_access` | shared | PENDING | shared router |
| `test_shared.py::test_friend_balance_adds_up_across_groups_by_login` | shared | PENDING | shared router |
| `test_shared.py::test_linking_a_contact_invites_them_to_existing_groups` | shared | PENDING | shared router |
| `test_tags.py::test_tags_are_found_in_any_script_and_compared_without_case_or_accents` | tags | `tests/test_tags.py::test_tags_are_found_in_any_script_and_compared_without_case_or_accents` | 1:1 |
| `test_tags.py::test_linkify_escapes_html_and_links_tags` | tags | `tests/test_tags.py::test_linkify_escapes_html_and_links_tags` | 1:1 (linkify kept in core; the SPA may not use it) |
| `test_tags.py::test_tag_numbers_are_not_amounts` | tags (telegram_parse) | `tests/test_tags.py::test_tag_numbers_are_not_amounts` | 1:1 |
| `test_tags.py::test_web_tag_report_adds_up_across_categories` | tags / reports | `tests/test_tags.py::test_tag_totals_add_up_across_categories` | PARTIAL: tags.detail/summary totals and bootstrap tag_names/recent_tags ported (expenses via the API, income via SQL until the income router exists). The rendered listing/report HTML assertions are PENDING with the reports router (tag report endpoint) |
| `test_tags.py::test_telegram_keeps_tags_and_still_finds_the_category` | telegram | PENDING | telegram router |
| `test_tags.py::test_tag_mode_tags_every_entry_until_turned_off` | telegram | PENDING | telegram router |
| `test_tags.py::test_questions_and_tags_command` | telegram | PENDING | telegram router |
| `test_tags.py::test_shared_bill_keeps_its_tag_in_my_share` | telegram / shared | PENDING | telegram / shared router |
| `test_tags.py::test_chips_offer_only_a_few_recently_used_tags` | tags | `tests/test_tags.py::test_chips_offer_only_a_few_recently_used_tags` | 1:1 |
| `test_telegram_bot.py::test_amounts_skip_dates_times_units_and_percentages` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_dates_from_words_and_numbers` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_account_detection_handles_greek_greeklish_and_generic_words` (9 cases) | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_basic_parser_splits_several_transactions_and_finds_income` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_history_beats_the_ai_and_keywords` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_ai_transactions_are_capped_to_the_amounts_written` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_unusable_ai_answer_falls_back_to_the_basic_parser` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_receipt_total_and_date_come_from_the_text` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_questions_are_told_apart_from_entries` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_text_without_ai_records_with_the_named_account` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_buttons_change_category_account_and_date_then_undo` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_undo_never_touches_entries_made_on_the_web` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_several_transactions_in_one_message_with_ai` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_past_choices_are_offered_to_the_ai_and_override_it` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_shared_bill_from_telegram_splits_and_books_my_share` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_questions_are_answered_from_the_database` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_receipt_photo_is_read_and_recorded` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_receipts_need_an_ocr_model` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_default_account_command` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_other_chats_cannot_press_my_buttons` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_edited_messages_are_ignored` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_ocr_model_is_saved_from_settings` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_categories_match_whatever_the_user_named_them` (7 cases) | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_a_category_written_in_the_message_is_used` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_catch_all_is_the_users_own` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_bot_uses_renamed_categories_and_creates_none` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_counts_of_months_or_times_are_not_amounts` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_the_ais_repeat_is_kept_only_when_it_makes_sense` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_a_repeating_entry_may_start_later_but_a_one_off_may_not` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_recurring_message_creates_a_rule_and_its_first_entry` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_recurring_income_without_end_starting_next_month` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_shared_bills_cannot_repeat` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_old_telegram_entries_table_gains_the_recurring_kind` | telegram | PENDING | telegram router |
| `test_telegram_bot.py::test_the_amount_written_beats_the_ais_reading_of_it` | telegram | PENDING | telegram router |
| `test_telegram_notify.py::test_budget_alerts_once_per_threshold_and_not_at_night` | telegram notifications | PENDING | telegram notifications router |
| `test_telegram_notify.py::test_no_budget_alerts_when_budgets_are_off_or_alerts_disabled` | telegram notifications | PENDING | telegram notifications router |
| `test_telegram_notify.py::test_bot_entry_that_crosses_a_budget_gets_an_alert_right_away` | telegram notifications | PENDING | telegram notifications router |
| `test_telegram_notify.py::test_card_reminders_before_on_and_after_the_due_day_until_paid` | telegram notifications | PENDING | telegram notifications router |
| `test_telegram_notify.py::test_bill_reminder_the_day_before_with_a_shortfall_warning` | telegram notifications | PENDING | telegram notifications router |
| `test_telegram_notify.py::test_weekly_summary_only_on_sunday_evening` | telegram notifications | PENDING | telegram notifications router |
| `test_telegram_notify.py::test_monthly_summary_on_the_first_with_catch_up` | telegram notifications | PENDING | telegram notifications router |
| `test_telegram_notify.py::test_notifications_command_toggles_each_kind` | telegram notifications | PENDING | telegram notifications router |
| `test_telegram_notify.py::test_notification_settings_form` | telegram notifications | PENDING | telegram notifications router |
