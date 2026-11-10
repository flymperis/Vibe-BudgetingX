# Phase 2 / D: investments and reports

Files: `vbx/api/routers/investments.py`, `vbx/api/routers/reports.py`, `vbx/api/schemas/investments.py`,
`vbx/api/schemas/reports.py`, `vbx/api/services/investments.py`, `vbx/api/services/reports.py`,
`tests/helpers_investments.py`, `tests/test_investments_and_rules.py`, `tests/test_price_fetch_gating.py`,
`tests/test_reports.py` (rewritten), `tests/test_tags.py` (one test extended). No separate tags router:
tag reporting is `GET /api/reports/tags`; tag names and chips are already in `/api/bootstrap`.

## 1. Old test -> new test

| Old test | New test | Notes |
| --- | --- | --- |
| `test_investments_and_rules.py::test_stock_add_edit_delete` | `tests/test_investments_and_rules.py::test_stock_add_edit_delete` | POST/PUT/DELETE `/api/investments/stocks`; same DB assertions, plus the success messages |
| `test_investments_and_rules.py::test_crypto_add_edit_delete` | `tests/test_investments_and_rules.py::test_crypto_add_edit_delete` | same for crypto |
| `test_investments_and_rules.py::test_dashboard_loads_with_holdings` | `tests/test_investments_and_rules.py::test_dashboard_loads_with_holdings` | every investments/reports endpoint answers 200 with holdings; legacy section names via `/api/reports/section`. The old `?panel=summary` / `?panel=yearly` loads belong to agent B's routers |
| `test_investments_and_rules.py::test_recurring_add_edit_delete` | not D: agent A (recurring router) | not written here |
| `test_investments_and_rules.py::test_transfer_between_accounts` | not D: agent A (transfers router) | not written here |
| `test_investments_and_rules.py::test_transfer_rejects_same_account` | not D: agent A (transfers router) | not written here |
| `test_price_fetch_gating.py::test_non_investments_panel_does_not_fetch_live_prices` | `tests/test_price_fetch_gating.py::test_non_investments_panel_does_not_fetch_live_prices` | bootstrap, expenses, `/api/home` (if present), `investments?live=false`, reports spending/tags/section: 0 lookups. Stubs patch `vbx.core.prices` itself, so they also count calls made by core code (stricter than the old test) |
| `test_price_fetch_gating.py::test_investments_panel_fetches_live_prices` | same name | exactly one CoinGecko and one Finnhub call, `force=False` |
| `test_price_fetch_gating.py::test_refresh_param_fetches_live_prices_on_other_panels` | same name | `live=false&refresh_crypto=true&refresh_stocks=true`: one forced call each |
| `test_price_fetch_gating.py::test_investments_data_shows_dash_not_zero_when_unloaded` | same name | JSON: `prices_loaded=false`, `total_value`/`total_pnl`/`total_pnl_pct` null, `total_invested` 20010 / 1501.5, no "-100" anywhere |
| `test_reports.py::test_cash_flow_nets_income_against_signed_expenses` | same name | via `GET /api/reports/overview?year=2024` -> `cash_flow` (was a direct call to `monthly_cash_flow_for_year`); plus active-month and average checks |
| `test_reports.py::test_savings_rate_and_month_extremes` | same name | overview `cash_flow` |
| `test_reports.py::test_savings_rate_is_none_without_income` | same name | overview `cash_flow` |
| `test_reports.py::test_category_ranking_orders_by_outflow_with_shares_and_deltas` | same name | `GET /api/reports/spending` -> `categories` |
| `test_reports.py::test_refund_only_category_does_not_distort_shares` | same name | spending `categories` |
| `test_reports.py::test_chart_only_plots_months_that_happened` | same name | overview `cash_flow_chart` (2 net points, 12 months, bars) and checked against the core SVG spec's ticks |
| `test_reports.py::test_chart_spec_handles_an_empty_year` | same name | pure spec assertions kept, plus the API's empty chart |
| `test_reports.py::test_legacy_report_section_links_still_resolve` | same name | `GET /api/reports/section?section=bank` -> `overview`, crypto/stocks -> `investments`, junk/blank -> `overview`. Frontend must map old `/?panel=reports&reports_section=...` URLs through it (or `normalize_reports_section`'s table) |
| `test_tags.py::test_tags_are_found_in_any_script_and_compared_without_case_or_accents` | unchanged (Phase 1) | |
| `test_tags.py::test_linkify_escapes_html_and_links_tags` | unchanged (Phase 1) | |
| `test_tags.py::test_tag_numbers_are_not_amounts` | unchanged (Phase 1) | |
| `test_tags.py::test_web_tag_report_adds_up_across_categories` | `tests/test_tags.py::test_tag_totals_add_up_across_categories` | now complete: tag list and single-tag report through `GET /api/reports/tags[?tag=]` (totals 425.50 / -405.50, Hotel first, refund row present). Frontend-only remainder: the expenses list rendering tags as links to the tag report and the `#` suggestion box (data already in `/api/bootstrap` `tag_names` / `recent_tags`) |
| `test_tags.py::test_telegram_keeps_tags_and_still_finds_the_category` | not D: agent E (telegram) | |
| `test_tags.py::test_tag_mode_tags_every_entry_until_turned_off` | not D: agent E (telegram) | |
| `test_tags.py::test_questions_and_tags_command` | not D: agent E (telegram) | |
| `test_tags.py::test_shared_bill_keeps_its_tag_in_my_share` | not D: agent E (telegram) / C (shared) | |
| `test_tags.py::test_chips_offer_only_a_few_recently_used_tags` | unchanged (Phase 1) | |

Counts for D: 16 old tests ported here (3 investments, 4 gating, 8 reports, 1 tags completed from
PARTIAL); 4 tags tests were already 1:1; 3 go to A and 4 to E/C. Nothing PENDING on D's side.

New tests without an old counterpart (validation branches, ownership, normalisation, holdings maths,
cache peek/age, FINNHUB key flag, search ordering and failures, refresh-button semantics, stored
month-end prices, year/account normalisation, bank chart, pivot, per-user isolation, login required):
the rest of `test_investments_and_rules.py` (35 cases incl. 19 parametrised), `test_price_fetch_gating.py`
(3 more), `test_reports.py` (7 more).

## 2. Endpoints

| Method | Path | What |
| --- | --- | --- |
| GET | `/api/investments?live=&refresh_crypto=&refresh_stocks=` | Investments screen: crypto (EUR) and stocks (USD) holdings with cost basis, price, 24h change, value, P&L; totals; history newest first with `total`; `prices_loaded`; `prices_age_seconds`; `finnhub_configured`. `live=true` (default) = old `panel=investments` (live lookup, 5-min cache); `live=false` = cache peek only; `refresh_*` = old Refresh Prices buttons (forced lookup for that class) |
| GET | `/api/investments/stocks/search?q=` | Finnhub symbol search (old `/stocks/search`) |
| GET | `/api/investments/crypto/search?q=` | CoinGecko coin search (old `/crypto/search`) |
| POST | `/api/investments/stocks` | add stock tx -> `{message, transaction}` |
| PUT | `/api/investments/stocks/{id}` | edit -> `{message: "Transaction updated.", transaction}`; 404 `Transaction not found.` |
| DELETE | `/api/investments/stocks/{id}` | `{ok, message: "Transaction removed."}`; 404 if not the user's |
| POST/PUT/DELETE | `/api/investments/crypto[/{id}]` | same for crypto |
| GET | `/api/reports/section?section=` | resolves old/unknown section names |
| GET | `/api/reports/overview?year=&account=` | KPIs/cash flow + months (with `active`), cash-flow chart series + range, bank balance chart (baseline, points with change, y_min/y_mid/y_max), bank balance through today, crypto/stock value at year end or today, account label |
| GET | `/api/reports/spending?year=` | category ranking (share, delta vs previous year) and category x month pivot |
| GET | `/api/reports/tags?tag=` | every tag with totals/dates; with `tag`, its totals, by-category spend with share, and entries |
| GET | `/api/reports/investments?year=` | crypto and stock month-end portfolio charts (baseline before the year), values |

## 3. Core changes

None.

## 4. Deviations from old behaviour

- Reports are one endpoint per section. The old page computed every section (including portfolio
  pricing) whenever the Reports panel was served. Now only overview and investments value portfolios,
  so spending/tags never touch prices: strictly fewer external calls, same numbers.
- Overview computes the full old portfolio block (baseline + 12 months for both classes) even though it
  only shows the two current values, to keep the same lookups and stored month-end prices as before.
- Investments panel totals are `null` (not 0 / -100 %) while `prices_loaded` is false, i.e. the old "—".
- `prices_age_seconds` (int) replaces the old preformatted "1m 5s ago" string; null where the old page
  showed nothing.
- Edit/delete of a missing or someone else's transaction: 404 `Transaction not found.` (old edit flashed
  the same text with a redirect; old delete always said "Transaction removed.").
- Validation failures are 400 with the old flash text as `detail`; nothing is saved (as before).
- `investments_section` (crypto/stocks tab) is not an API concept; the frontend picks the tab.
- Charts: chart series + the value range the old SVG specs computed, instead of SVG coordinates.
- The CoinGecko search HTTP call moved from the route into `services/investments.coingecko_search`
  (monkeypatchable); same URL, headers and timeout.

## 5. Requests / open questions

- The old index posted due recurring entries (`apply_recurring_entries`) before computing reports.
  Here that happens in `/api/bootstrap` only (as for expenses). If the frontend can stay open across a
  recurring due date, the reports may lag until the next bootstrap. Orchestrator's call.
- Frontend must guarantee: stocks form prefills broker "Freedom24" and today's date; the Finnhub hint
  text when `finnhub_configured` is false; the "Prices aren't loaded yet" hint when `prices_loaded` is
  false; refresh buttons call `refresh_crypto` / `refresh_stocks`; month table shows only `active`
  months; tag share bar width uses max(share, 0); crypto amounts in EUR, stock amounts in USD.

## 6. Suspected old bugs (ported unchanged)

- Holdings use the panel's newest-first order (`ORDER BY transacted_at DESC, id DESC`) as input to
  `compute_*_holdings`, so a later sell is applied before the earlier buy and does not lower the cost
  basis (buy 10 @100, later sell 5: cost 1000, avg 200 instead of 500/100). Affects avg buy price, P&L
  and report baselines. Pinned by `test_old_newest_first_order_feeds_the_holdings_maths`.
- Report portfolio pricing stores a month-end price for every month that is not the current one,
  future months of the running year included (with today's live quote as fallback). When such a month
  later ends, the stale stored price is used instead of its real month-end. Visible in
  `test_portfolio_value_for_the_running_year_is_todays` (11 rows stored).
- `/crypto/search` puts the query in the URL unencoded; a query with a space makes `urlopen` raise
  `http.client.InvalidURL` (not caught) -> 500. Kept (unverified against a live call).
- `float("nan")` / `"inf"` pass the quantity/price checks; NaN then fails the NOT NULL column (500),
  inf is stored.
- If the live lookup returns nothing on the Investments screen, prices still count as loaded and the
  totals show 0 value / -100 % P&L (only the cold-cache peek shows a dash).
- Stock transaction history displayed price and fee with the € formatter but the total with $ (template
  only; frontend should use USD for all three).
