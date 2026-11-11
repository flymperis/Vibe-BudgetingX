# Screens: planning (Budget, Summary, Yearly)

Old panels: `templates/panels/_budget.html` (+ the copy-month modal in `templates/index.html` and
`setupBudgetTools` / `setupBudgetOverrideToggles` in `static/app.js`), `_summary.html`,
`_yearly.html`. Endpoints: `/api/budget*`, `/api/summary`, `/api/yearly` (see `docs/parity/B.md`).

Files: `src/features/budget/` (`BudgetPage`, `BudgetLineRow`, `CategoryBudgetSheet`,
`DefaultsEditor`, `CopyMonthSheet`, `api.ts`, `defaults.ts`), `src/features/summary/`
(`SummaryPage`, `api.ts`), `src/features/yearly/` (`YearlyPage`, `YearlyChart` (lazy, Recharts),
`api.ts`), strings in `src/i18n/features/planning.ts`.

Checklist: every piece of information and every action of the old panels. 32 / 32 covered.

## Budget (`/budget`)

- [x] B1 Budgeting off: explanation text + "Enable budgeting" — `BudgetPage › BudgetOff`
- [x] B2 Month picker — `MonthSwitcher` (shown while budgeting is on)
- [x] B3 "Clear current month" with confirm, only when `can_clear_month` — `BudgetOn` "Ρυθμίσεις budget" list + `useConfirm`
- [x] B4 Cleared month without own amounts: "<month> · χωρίς budget", spent (`cleared_total_spent`), Restore — `BudgetOn` hero
- [x] B5 Hero: left to spend · month, bar (API `total_pct` / `total_status`), budget and spent pills — `BudgetOn` hero
- [x] B6 Cleared month with own amounts: note + Restore — `BudgetOn` hero
- [x] B7 Category row: name, spent / budget, "X μένουν" / "X πάνω" coloured by status, bar with ok/warn/over icon — `BudgetLineRow`
- [x] B8 Edit for this month (prefilled with the budget), Save, "Reset to default" when overridden — `CategoryBudgetSheet` (tap the row; mode "Μόνο αυτόν τον μήνα"). A blank amount is refused client-side (the old field was `required`).
- [x] B9 "Everything else" line — `BudgetLineRow isOther` (tap opens the Monthly budgets editor, where its amount lives)
- [x] B10 No budgets yet — `EmptyState` with "Όρισε μηνιαία budget"
- [x] B11 Cleared month: every category; budgeted ones with "Αφαίρεση" instead of reset; others "—" and can get a month amount — `BudgetOn` cleared list + `CategoryBudgetSheet`
- [x] B12 No expense categories yet — `EmptyState` (list and editor)
- [x] B13 Unbudgeted: "Καλύπτονται από «Όλα τα υπόλοιπα»" / "Χωρίς budget", name + spent; tap to budget it — `BudgetOn`
- [x] B14 Over-budget list (`summary.over`) — callout under the hero
- [x] B15 Defaults editor: every category, default, 3-month avg hint, Fixed flag with visual cue — `DefaultsEditor` (`/budget?edit=defaults`, a full page so bulk typing on phones is comfortable); a single category's default is also editable in `CategoryBudgetSheet` mode "Κάθε μήνα" (Fixed switch, "Χρήση" fills the average)
- [x] B16 Editor offered prominently when nothing is set — empty-state CTA + "Μηνιαία budget" header button
- [x] B17 Distribute (fixed kept, largest-remainder cents, every status message) — `DefaultsEditor` + `defaults.ts › distribute`
- [x] B18 Copy from another month (disabled + hint without snapshots; month choice, preview kept/amount/unchanged, total, Prefill, nothing saved) — `CopyMonthSheet` + `copyPreview` / `applySnapshot`
- [x] B19 "Everything else" amount + hint, from `other_amount` — `DefaultsEditor`
- [x] B20 Live "Total monthly budget" — sticky save bar in `DefaultsEditor`
- [x] B21 Save budgets (every row in `amounts`, `fixed[id]=true` for checked, `other_amount`) — `defaultsPayload`
- [x] B22 Disable budgeting + "amounts are kept" hint — `BudgetOn` settings list

## Summary (`/summary`)

- [x] S1 Month picker — `MonthSwitcher`
- [x] S2 Total income, total expenses — hero pills
- [x] S3 Net balance (`net_total`) with hint — hero
- [x] S4 Income by category / empty text — "Έσοδα" `ListGroup`
- [x] S5 Expenses with budget on: rows (spent; "Budget X · μένουν Y" coloured), unbudgeted ("Χωρίς budget"), Everything else; empty text — `ExpenseBudgetRow`
- [x] S6 Expenses with budget off: breakdown / empty text
- [x] S7 Balances: name + balance / empty text — plus (new) card limit line, cash/cards subtotals, net and the balance-scope hint

## Yearly (`/yearly`)

- [x] Y1 Year switcher 2000..2100 (`?year=`), plus a "Φέτος" shortcut
- [x] Y2 12 months: income, expenses, delta (+ green / − red / 0 muted), total bank balance — table with a sticky first column, horizontal scroll on phones; current month highlighted
- [x] Y3 Totals row (income, expenses, delta, "—") + total stat cards
- [x] (new) Income vs expenses bar chart (Recharts, lazy chunk) with legend; the table is the accessible data view

## Nothing dropped

Every item is covered. Differences by design: the per-row pencil + inline form became a tap-to-open
sheet; the `<details>` defaults form became its own page (`?edit=defaults`; back returns).

## API requests

None. (The "Everything else" line comes back named in English from `budget_for_month`; the client
shows its translated label for `category_id: null`.)

## Foundation requests

- `lib/dates.ts › monthName()` returns the genitive in Chromium for el-GR (`{ month: 'long' }` alone
  gives "Μαρτίου") although its doc says nominative. Yearly works around it locally
  (`yearly/api.ts › nominativeMonth`, month part of `{ month: 'long', year: 'numeric' }`). Suggest
  fixing `monthName` the same way (reports' BalanceChart uses it).
- Greek month names inside sentences: `monthLabel` is nominative, so "για {month}" reads wrong; the
  planning strings were phrased around it. A genitive helper ("Νοεμβρίου 2026") would help.
