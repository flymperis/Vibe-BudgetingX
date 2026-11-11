# Screens: group `manage` (Transfers, Recurring, Settings)

Old panels: `_transfer.html`, `_recurring.html` (+ the "New recurring rule" modal in `index.html`),
`_settings.html` (general, banks, expenses, income, integrations, export, migration), the header
"Log out" button, and the matching parts of `static/app.js` (`setupTransferForm`,
`setupAccountTypeFields`, recurring "Indefinitely" toggle, `setupAiModelLoader`).

Legend: `[x]` covered (component that covers it), `[ ]` not covered (reason given).

## Transfers (`/transfers`) — old `_transfer.html`

- [x] Intro text "Move money between your accounts… Balances update from the transfer date." — `TransfersPage` (subtitle)
- [x] Balance scope hint (through today for the current month / through the end of another month) — `TransfersPage` (`transfers.scopeToday` / `transfers.scopeMonth`, from `/api/accounts` `through_today`, `balance_as_of`)
- [x] Month selection (balances and pay-card statement follow the month) — `MonthSwitcher` in `TransfersPage`
- [x] From account picker with each account's balance — `TransferSheet` (account chips show each balance)
- [x] To account picker with balance — `TransferSheet`
- [x] Default From = first account, To = second account (server `defaults`) — `TransferSheet` (`transferFormFromDefaults`)
- [x] Swap accounts button — `TransferSheet` (swap button, `swapAccounts`)
- [x] "Choose two different accounts." live hint, submit disabled while equal — `TransferSheet` (`validateTransfer`)
- [x] Amount (positive) — `TransferSheet` (`AmountEntry` + keypad on mobile)
- [x] Date (default today) — `TransferSheet` (`DatePicker`, default from server `defaults.transferred_at`)
- [x] Notes — `TransferSheet` (textarea)
- [x] "Record transfer" submit, server `detail` inline — `TransferSheet`
- [x] "Pay card" pre-fill (`pay_card`): from = first bank account, to = the card, amount = statement remaining — `TransfersPage` reads `?pay_card=` and opens `TransferSheet` with `/api/transfers?pay_card=` defaults; "Pay card" buttons on card rows in the balances list (`AccountBalancesList`, `can_pay`); links from other screens (`/transfers?pay_card=<id>&month=YYYY-MM`) open the pre-filled sheet
- [x] Fewer than 2 accounts: "Add at least two accounts in Settings…" — `TransfersPage` empty state with a link to Settings → accounts
- [x] Account balances list (avatar, name, balance; card rows with available of limit, used bar, statement line; Cash & bank / Credit cards / Net subtotals or Total) — `AccountBalancesList` (`src/components/manage`)
- [x] "Last N transfers" log: route from → to with bank avatars, day, notes, amount — `TransfersPage` (`TransferRow`, opens `TransferDetailSheet`)
- [x] "No transfers yet." — `EmptyState` in `TransfersPage`
- [x] Delete transfer (with confirm) — `TransfersPage` (row opens detail sheet → delete, `useConfirm`)

## Recurring (`/recurring`) — old `_recurring.html` + add modal

- [x] Explanation text (interval, first date, last-day-of-month rule, "[Recurring]" note, catch-up) — `RecurringPage` intro (collapsible "How it works")
- [x] "+ Add rule" — `RecurringPage` header button + empty-state button → `RecurringSheet`
- [x] Rule list: type (split into Expenses / Income groups, amount signed by type), paused badge, "every N unit(s)", "N times"/"indefinitely" — `RuleRow` (RecurringPage) (`scheduleLabel`, `durationLabel`)
- [x] Rule category, amount, account, first date, notes (with #tags) — `RuleRow` (RecurringPage) (title/subtitle/amount) and `RecurringSheet`
- [x] Rule day of month (rules without a first date) — `RuleRow` (RecurringPage) subtitle and `RecurringSheet` "Day of month" field shown for legacy rules
- [x] Edit: category (expense + income groups) — `RecurringSheet` (type toggle + category chips)
- [x] Edit: amount — `RecurringSheet`
- [x] Edit: account — `RecurringSheet`
- [x] Edit: interval count (1–99) + unit week/month/year — `RecurringSheet`
- [x] Edit: first date — `RecurringSheet` (`DatePicker`)
- [x] Edit: Indefinitely toggle / "Run how many times" — `RecurringSheet` (switch + number field)
- [x] Edit: notes — `RecurringSheet`
- [x] Edit: Active toggle (always sent, so saving never pauses by accident) — `RecurringSheet` (`buildRecurringBody` always includes `enabled`); paused rules show a "Σε παύση" badge in the list
- [x] Save (server `detail` inline) — `RecurringSheet`
- [x] Delete (confirm) — `RecurringSheet`
- [x] "No recurring rules yet." — `EmptyState`
- [x] Add form defaults: month(s), every 1, first date today, indefinitely on — `emptyRecurringForm`

## Settings index (`/settings`)

- [x] Sections: General, Banks, Expense categories, Income categories, Integrations, Export, Migration — `SettingsIndexPage` (Export and Migration share `/settings/export`)

## Settings → General (`/settings/general`)

- [x] Dark mode switch (old) — foundation `ModeSwitch` (+ colour themes and language)
- [x] Logged-in username and "Log out" (old header) — `GeneralSettingsPage`

## Settings → Banks / accounts (`/settings/accounts`)

- [x] Both help texts (bank name → logo; balance = opening + movements to the cutoff; card opening = owed, pay with a transfer, statement/due days) — `AccountsSettingsPage`
- [x] Add account: name, type (bank/cash vs credit card), opening balance ("Owed on card" for cards), credit limit, statement day, due day (card fields only for cards) — `AccountSheet`
- [x] Edit account: same fields, opening balance shown as owed (positive) for cards — `AccountSheet` (`opening_balance_input`)
- [x] Current balance (read-only) — `AccountSheet` (read-only row) and list row amount
- [x] Bank badge / logo detection — `AccountAvatar` (`bank` from the API: logo, or brand-coloured label, else first letter)
- [x] Delete account (confirm; server refusal shown) — `AccountSheet`
- [x] "No accounts yet." — `EmptyState`
- [x] Server validation messages (invalid limit, day range, due day needs statement day, duplicate name) — inline `FieldError` in `AccountSheet`

## Settings → Expense / income categories

- [x] Add category — `CategoriesManager` + `CategorySheet`
- [x] Rename — `CategorySheet`
- [x] Delete, only when allowed; counts of entries and recurring rules shown; refusal message — `CategorySheet` (`can_delete`, `entry_count`, `rule_count`; delete disabled with explanation, server `detail` inline)
- [x] "No … categories yet." — `EmptyState`

## Settings → Export & import (`/settings/export`)

- [x] Export text + "Download full export (.xlsx)" — `ExportImportPage` (plain link to `/api/export/excel`)
- [x] Migration text (layout, matching by names, sign rules, auto-created names) — `ExportImportPage`
- [x] "Download migration template (.xlsx)" — link to `/api/export/migration-template`
- [x] Import: file (.xlsx) — `ExportImportPage` (file picker)
- [x] "Replace all movements" option — switch with warning
- [x] "Overwrite opening balances and card settings" option — switch with warning
- [x] Confirm before a destructive import (replace/sync) — `useConfirm` destructive
- [x] Success message — inline success panel + toast; all money queries invalidated
- [x] Error list on failure (first 8 + "N more") — `ImportErrors` (`splitImportErrors`)

## Settings → Integrations (`/settings/integrations`)

Local AI (Ollama):
- [x] Help text — `AiSettingsCard`
- [x] Enable AI connection — switch
- [x] Provider (Ollama) — select (one option, as old)
- [x] Base URL + hint — input
- [x] Model with suggestions from "Load models" (status: N models / none installed / error; auto-pick the only model) — `AiSettingsCard` (`useLoadModels`, datalist + tappable model chips)
- [x] Receipt OCR model (optional) + hint — input sharing the model suggestions
- [x] Timeout (5–120 s) — input
- [x] Save — button; server `detail` inline
- [x] Test connection — `{ok, message}` shown inline (success/negative)

Telegram bot:
- [x] Help text (private polling mode) — `TelegramCard`
- [x] Bot token (password field, never shown; "Saved — leave blank to keep" placeholder) — `TelegramCard`; token is cleared from state after save and never logged
- [x] Save Telegram settings (webhook message shown) — `TelegramCard`
- [x] Test bot token (`{ok, message}` inline) — `TelegramCard`
- [x] Bot link `@username` to t.me — `TelegramCard`
- [x] Linked status (@username, since date) — `TelegramCard`
- [x] Default account for new entries ("First account (auto)") + save — `TelegramCard`
- [x] Notifications per kind (labels from the server) + card reminder days (1–14) + hint + save — `TelegramCard`
- [x] Unlink (confirm) — `TelegramCard`
- [x] Not linked: active code with expiry and "/link CODE" instruction; Generate link code — `TelegramCard` (copy button)
- [x] Bot not configured: hint to save a token first (without the old "public URL" wording) — `TelegramCard`

## API requests

- None blocking. Nice to have: `GET /api/accounts` could expose per-account "is referenced" (like
  categories' `can_delete`) so the delete button could explain itself before the server refuses.

## Foundation requests

- `MONEY_DOMAINS` in `src/api/keys.ts` does not include `accounts`/`categories`; screens of this group
  invalidate those keys themselves. Adding `accounts` there would keep `/api/accounts` (Settings and
  Transfers balances) fresh after an expense is added elsewhere.
- An `AccountAvatar` (bank badge) is needed by Home and Expenses too; ours lives in
  `src/components/manage/AccountAvatar.tsx` and could move to `src/components/`.

- `PageHeader` truncates long titles on one line ("Τράπεζες & λογαρ…" at 390px). Allowing two lines
  (or a shorter nav label) would help the settings sub-pages.

## Result

Covered: 79 / 79 items. Nothing dropped.

Notes:
- Settings → accounts has no month switcher; balances follow the `?month=` carried in the URL
  (current month by default, i.e. through today), with the "as of" date shown, like the old cutoff.
- The Telegram bot token and AI settings are server-wide as in the old app (see parity E, suspected
  bug); the UI does not change that.
- Test/connection buttons show the returned `{ok, message}` inline (green/red). The token field is
  type=password, cleared after saving and never logged or displayed.

Tests: Vitest 25 (transfer form 4, recurring form 5, settings logic 10, RecurringSheet 3, settings
sheets 3); Playwright `e2e/manage.spec.ts` 4 flows × 2 projects (mobile 390, desktop 1280) against the
real backend through Vite on :5182 (`MANAGE_BASE_URL` to override). Screenshots: `frontend/screenshots/manage/`.
