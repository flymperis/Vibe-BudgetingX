# Screens: insights (Investments + Reports)

Old panels: `templates/panels/_investments.html`, `templates/panels/_reports.html`, the chart macros in
`templates/_macros.html`, `setupStockSearch` / `setupCryptoSearch` and the reports auto-submit in
`static/app.js`. Backend: `/api/investments*`, `/api/reports/*` (`docs/parity/D.md`).

Files: `src/features/investments/*`, `src/features/reports/*` (charts in `reports/charts/`),
`src/components/insights/format.ts` (quantity / percent / age / axis / month-name formatting shared by
both features), `src/i18n/features/insights.ts`, `e2e/insights.spec.ts`.

Status: [x] = covered (component in brackets). 62 / 62 covered.

## Investments — crypto (EUR) and stocks (USD) tabs

- [x] Portfolio value card; "—" while prices are not loaded (`PortfolioScreen › SummaryCard`)
- [x] Total invested card (`SummaryCard`)
- [x] P&L card, signed, with % (only when invested > 0); "—" while prices are not loaded (`SummaryCard`)
- [x] "Prices aren't loaded yet" hint when prices_loaded is false and there are holdings (`PortfolioScreen › Hint`)
- [x] "Refresh Prices" button per asset class, `refresh_crypto` / `refresh_stocks` only from there (`RefreshRow`, `useRefreshPrices`)
- [x] "Updated Xs ago" next to it when prices are loaded, ticking each second without refetching (`PriceAge`)
- [x] Stocks: Finnhub hint when FINNHUB_API_KEY is missing (`PortfolioScreen`)
- [x] Stocks: symbol hint (broker symbol, USD, refresh after adding), shown in the stock form where the symbol is typed (`TxSheet`)
- [x] Holdings: symbol + name (stocks: ticker, name, symbol) (`HoldingsList`, `HoldingSheet`)
- [x] Holdings: quantity (6 / 4 significant digits like `%.6g` / `%.4g`, without exponent notation) (`formatQuantity`)
- [x] Holdings: average buy price (`HoldingsList` desktop column, `HoldingSheet`)
- [x] Holdings: cost basis (`HoldingSheet`; new, from `total_cost`)
- [x] Holdings: live price + 24h change %, N/A without price (`HoldingsList`, `HoldingSheet`)
- [x] Holdings: value, N/A without price (`HoldingsList`)
- [x] Holdings: P&L signed + %, coloured, N/A without price (`Pnl`)
- [x] Holdings empty state (`PortfolioScreen`)
- [x] Add transaction: type buy/sell (`TxSheet` chip picker)
- [x] Add: search-as-you-type (crypto ≥ 2 chars / 300 ms, stocks ≥ 1 char / 350 ms), pick fills the fields, Enter picks the first result, arrows/Escape (`SymbolSearch`)
- [x] Add: crypto coin id / symbol / name; stocks symbol / ticker / name (`TxSheet`)
- [x] Add: stocks symbol blur auto-resolve (exact symbol or single result) (`TxSheet.resolveSymbol`, `pickResolvedStock`)
- [x] Add: quantity, price per unit (€ / $), fee (default 0), exchange / broker (stocks default Freedom24) (`TxSheet`, `emptyTxForm`)
- [x] Add: date (default server today), notes (`TxSheet`)
- [x] Transaction history newest first: date, type badge, coin / ticker + symbol, qty, price, fee, total, exchange / broker (`TxRow`)
- [x] Stock history in USD for price, fee and total (old template used € for price/fee: bug, fixed as parity D asks) (`TxRow`)
- [x] Edit transaction, all fields incl. notes (`TxSheet` with `tx`)
- [x] Delete transaction with confirmation (`TxSheet` → `useConfirm`)
- [x] History empty state (`PortfolioScreen`)
- [x] Price-call gating: `live=true` once per screen open (layout observer with `refetchOnMount: 'always'`), never on focus / reconnect / interval / tab switch (`staleTime: Infinity`); verified by unit and e2e tests (`api.ts › useInvestments`)
- [x] Server `detail` inline in the form (`FieldError`)
- [x] Holding detail sheet with that asset's transactions (new) (`HoldingSheet`)

## Reports — overview

- [x] Year picker (2000–2100, ‹ › and a list) and account filter (all / each account) (`YearSwitcher`, overview `Select`)
- [x] KPI: income with avg per active month (`StatCard`)
- [x] KPI: spending with avg per active month (`StatCard`)
- [x] KPI: net saved, signed, "income minus spending" (`StatCard`)
- [x] KPI: savings rate % or "—" with "no income recorded" (`StatCard`)
- [x] Cash-flow chart: income bars, spending bars, net line only for months with activity, legend, explanation; y range from the API (`CashFlowChart`)
- [x] Best / tightest month callout (overview)
- [x] What you hold: bank (selected accounts, through today), crypto (EUR), stocks (USD, "quoted in USD"), not-summed note, "today's prices" vs "end of year" wording (overview `ListGroup`)
- [x] Bank balance line chart for the year with baseline, per point balance and Δ, y ticks y_min / y_mid / y_max from the API (`BalanceChart`)
- [x] Month-by-month rows, only active months: income, spending, net; "Nothing recorded" when empty (`MonthRows`)

## Reports — spending

- [x] Year picker (`YearSwitcher`)
- [x] Category ranking: name, total, share bar, "% of spending", delta vs previous year or "new this year", explanation (`Ranking`, `RankRow`)
- [x] "No expenses recorded in YEAR" (`Ranking`, `Pivot`)
- [x] Category × month pivot: 12 months, total, avg; Grand total row with avg and its "divided by N months" title (also shown as a caption, since a title does not show on touch); blanks for zero; explanation (`Pivot`)
- [x] Pivot on mobile: sticky first column, horizontal scroll (`Pivot`)

## Reports — tags

- [x] Tag list: tag, spent, income (or —), entries, dates first → last (`TagList`)
- [x] Hint on how to use #tags (`TagList`)
- [x] "No tags yet" (`TagList`)
- [x] `?tag=` single tag: title, back to all tags (`TagView`)
- [x] Totals: spent, income + net (when income), entries, dates (`TagView`)
- [x] By category: name, total, bar max(share, 0), "% of the total" (`TagView`, `RankRow`)
- [x] Entries: category, account (or —), amount, notes with tag links, date (`TagView`, `TagText`)
- [x] "Nothing is tagged #x yet." (`TagList`)

## Reports — investments

- [x] Year picker (`YearSwitcher`)
- [x] Crypto heading with value (EUR) + explanation + month-end chart with baseline, per point value and Δ (`BalanceChart`)
- [x] Stocks heading with value (USD) + explanation + chart with baseline (`BalanceChart currency="$"`)

## Cross-cutting

- [x] Mobile 390 / desktop 1280, light / dark, a colour theme, Greek / English (screenshots in `frontend/screenshots/insights/`)
- [x] Charts: touch tooltips (tap a month), theme colours via CSS variables, el/en axis formatting, API ranges, every other month label on phones
- [x] Invalidation after mutations: `['investments']`, `['reports']`, `['home']` (investments do not move balances, so not `invalidateMoney`)
- [x] Loading skeletons, error state with retry, empty states
- [x] Report year kept in `?year=` and remembered for the session across the report tabs

## Not done / deviations

- Quantities use the same significant digits as the old `%g`, but never exponent notation (12000 shares
  shows `12.000`, the old app `1.2e+04`).
- Month names come from the month number (the API's English `label` / `month_headers` are not shown).

## API requests

None needed. (Nice to have: `OverviewOut.account_label` is the English "All accounts" for the
all-accounts case; the screen uses its own translated label then.)

## Foundation requests

1. `lib/dates.monthName()` returns the genitive in Greek on Chromium ("Ιανουαρίου" instead of
   "Ιανουάριος"): `Intl` formats `{ month: 'long' }` alone in the formatting context. Fix: take the month
   part of `formatToParts` with `{ month: 'long', year: 'numeric' }` (as `monthNominative` in
   `components/insights/format.ts` does). Worked around locally.
2. `TabLinks` keeps only `?month=` when switching tabs; reports would like to keep `?year=` too. Worked
   around by remembering the report year in sessionStorage.
3. Old links `/?panel=reports&reports_section=…` and `/?panel=investments&investments_section=…` are not
   mapped yet; the router could resolve `reports_section` through `GET /api/reports/section` (parity D).
4. The Playwright config starts its own Vite on :5174; group e2e specs override `baseURL`. The first run
   after a dependency change can flake when Vite re-optimises dependencies and reloads the page mid-test.
