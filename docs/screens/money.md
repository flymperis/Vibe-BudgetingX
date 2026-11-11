# Screens: money group (Home, Expenses, Income, quick add)

Old panels: `templates/panels/_home.html`, `_expenses.html`, `_income.html`, the Home quick
sheets in `templates/index.html` (`home-modal-expense` / `home-modal-income`), the macros
`account_balances_list`, `account_avatar`, `tag_suggestions`, `list_filter_month_row`, and
`static/app.js` (tag chips, amount sign toggle, quick modals). Routes: `routes/dashboard.py::index`
(recurring posting flash), `routes/expenses.py`, `routes/income.py`.

Status legend: [x] covered (component that covers it), [ ] not covered (reason given).

## Home (`_home.html`)

- [x] Month heading (`month_heading`) -> `HomePage` PageHeader eyebrow (month label)
- [x] Intro hint "Income / Expenses / Net are for the selected month." -> `HomePage` hero caption
- [x] Balance scope hint (today / end of month) -> `HomePage` `balanceScopeHint`
- [x] Month picker (month + year + Apply) -> `MonthSwitcher`
- [x] Net hero (amount, coloured by sign) -> `HomePage` `HeroCard`
- [x] Income pill, Expenses pill -> `HeroCard` pills
- [x] Budget card only when budgeting on and rows/other exist (`budget_card` not null) -> `HomeBudgetCard`
- [x] Budget card: spent of budget -> `HomeBudgetCard`
- [x] Budget card: remaining "left" / "over" with status colour -> `HomeBudgetCard`
- [x] Budget card: progress bar with status (ok/warn/over) and aria -> `HomeBudgetCard` (`ProgressBar status`)
- [x] Budget card: "Over budget: names" -> `HomeBudgetCard`
- [x] Budget card links to the Budget panel for the month -> `HomeBudgetCard` (Link `/budget?month=`)
- [x] "Account balances" heading -> `HomePage` SectionHeader
- [x] Quick "+ Expense" button -> `HomePage` quick actions -> quick-add sheet (expense)
- [x] Quick "+ Income" button -> `HomePage` quick actions -> quick-add sheet (income)
- [x] Account row: bank avatar (logo / brand badge / first letter) -> `AccountAvatar`
- [x] Account row: name and balance pill coloured by sign -> `BalancesList`
- [x] Card row: "available of limit" (when limit) -> `BalancesList` `CardDetails`
- [x] Card row: credit-limit-used bar with used level -> `CardDetails`
- [x] Card row: statement line (none / paid / open / soon / overdue, remaining, "left of", due / was due) -> `CardDetails`
- [x] Card row: "Pay card" link to Transfer pre-filled (`pay_card`) when owed > 0 -> `CardDetails`
- [x] "No accounts yet." -> `BalancesList` empty state
- [x] Subtotals Cash & bank / Credit cards / Net (all accounts) when cards exist -> `BalancesList`
- [x] "Total (all accounts)" when no cards -> `BalancesList`
- [x] Links: Expense list, Income list, Consolidated breakdown (keep month) -> `HomePage` links group
- [x] Recurring entries posted on page load + flash "Posted N recurring entries." -> `useBootstrapSync` (`src/bootstrap`)

## Expenses (`_expenses.html`)

- [x] Add form: notes, amount, sign toggle (expense / refund), category, account, date -> `EntrySheet` (add) via `+` button and page button
- [x] Notes placeholder with #tag hint -> `NotesField`
- [x] Recent-tag chips toggle the tag in the notes -> `NotesField` + `tag-edit.ts`
- [x] Typing "#ab" shows matching tags (max 6) that complete the word -> `NotesField` + `tag-edit.ts`
- [x] Date input defaulting to today -> `DayPicker` (today / yesterday / weekday chips + calendar)
- [x] List month filter with "All months" -> `EntryListScreen` (MonthSwitcher + "All months" toggle)
- [x] Category filter with "All categories" -> `EntryListScreen` category chips
- [x] "All months" / "All categories" reset links -> `EntryListScreen` (toggle / "All" chip)
- [x] Columns: category, account (with avatar), amount (coloured), notes with tag links, date -> `TxnRow` + day headings
- [x] Clickable #tags -> `TxnRow` (links to `/reports/tags?tag=`)
- [x] Edit (pre-filled, same fields) -> `EntryDetailSheet` -> `EntrySheet` (edit)
- [x] Delete -> `EntryDetailSheet` (confirm dialog)
- [x] "No expenses yet." -> `EmptyState`
- [x] Pagination (LIST_PAGE_SIZE, "Rows a–b of N", Previous/Next) -> infinite scroll + "Load more", "Showing X of N"

## Income (`_income.html`)

- [x] Add form: notes, amount (positive), category (income categories), account, date -> `EntrySheet` (income)
- [x] Tag chips + `#` completion -> `NotesField`
- [x] Month filter + All months, category filter + All categories -> `EntryListScreen`
- [x] Columns + tag links -> `TxnRow`
- [x] Edit / Delete -> `EntryDetailSheet` / `EntrySheet`
- [x] "No income entries yet." -> `EmptyState`
- [x] Pagination -> infinite scroll + "Load more"

## Quick sheets (`index.html` home modals + app.js)

- [x] Segmented Expense / Income switch -> `QuickAddExpense` (`SegmentedKind`)
- [x] Switching carries amount (magnitude), notes and date -> shared form state
- [x] Expense sheet always reopens on "-" (spending) -> `EntryForm` reset
- [x] Header Save + bottom submit -> sheet footer Save (+ Enter submits on desktop)
- [x] Focus on amount when opened -> `AmountInput autoFocus` (desktop); keypad on mobile
- [x] Category / account pickers -> `ChipPicker`

Extras beyond the old panels: "Recent expenses" (5 newest of the month) on Home with the same
detail/edit/delete sheets; Transfer shortcut on Home; last used account remembered per kind;
"All months" + category filters kept in the URL (`?all=1`, `?category=<id>`).

Where things live: shared pieces in `src/components/money/` (`entries.ts` data layer,
`entry-form.ts` + `tag-edit.ts` pure logic, `EntrySheet`, `EntryForm`, `NotesField`, `DayPicker`,
`TxnRow`, `EntryActionSheets`, `EntryListScreen`, `AccountAvatar`), Home in `src/features/home/`
(`HomePage`, `BalancesList`, `HomeBudgetCard`, `statement.ts`), quick add in
`src/features/expenses/QuickAddExpense.tsx` (opened with `useQuickAdd().open({ kind })`), the
recurring-posting sync in `src/bootstrap/sync.ts`.

Totals: 53 / 53 items covered.

## Not covered / deliberate differences

- Day totals in the list headings are not shown (the API returns none; no money maths in the client).
- Amount 0 is refused in the form ("Γράψε ποσό μεγαλύτερο από το μηδέν."); the old HTML form
  accepted 0 (the API still does).
- A new entry has no category preselected (old select defaulted to the first category): the fast
  path is amount -> tap category -> save, and a forgotten choice is caught instead of silently
  filed under the alphabetically first category.
- More page: no data badges needed (the old More sheet had none); unchanged.

## API requests

- Optional: a free-text `q` filter on `GET /api/expenses` and `/api/income` (the mockup's
  "Αναζήτηση ή #tag" box); not in the old app, so not built.

## Foundation requests

- `vite.config.ts`: proxy `/static` to the backend too, so bank logos (`/static/banks/*.png`)
  load in dev. Today `AccountAvatar` falls back to the brand-coloured badge when a logo fails, so
  dev shows badges and production shows logos.
- The Transfers screen should read `?pay_card=<account id>` (Home's "Pay card" link passes it, as
  the old link did) and pre-fill from `GET /api/transfers?pay_card=`.
- `src/i18n/el.ts`: the sample keys `home.sampleNotice`, `home.totalBalance`, `home.monthIncome`,
  `home.monthExpenses`, `home.monthBudget`, `home.categories`, `home.recent`, `home.allCategories`,
  `quickAdd.sampleSaved` are no longer used by Home / quick add (the dev components page still uses
  some); the Sidebar button still says "Νέο έξοδο" while the sheet now offers Expense / Income.
- `src/dev/sample-data.ts` is now only used by `src/dev/ComponentsPage.tsx`.
