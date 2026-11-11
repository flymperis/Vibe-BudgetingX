# Screens — group `shared`

Old panels: `templates/panels/_shared.html`, `templates/panels/_shared_modals.html`, the shared
part of `static/app.js` (live split preview, add/edit mode, settle prefill). Backend: `/api/shared`
(`docs/parity/C.md`).

New screens (all in `src/features/shared/`):

- `SharedPage.tsx` — route `/shared`; shows the overview, or the group detail when the URL has
  `?group=<id>` (pushed history entry, so it is linkable and Back returns to the overview).
- `SharedOverview.tsx` — overview.
- `GroupDetail.tsx` — one group.
- Sheets: `NewGroupSheet`, `PersonSheet`, `GroupSettingsSheet`, `BillSheet` (+ `SplitEditor`),
  `BillDetailSheet`, `SettleSheet`, `PaymentDetailSheet`.

## Checklist (old item → new component)

### Overview (`_shared.html`, no group selected)

- [x] Intro text (what shared expenses are, linking, Shared balances) → `SharedOverview` footer hint
- [x] Invitations list: inviter, group name → `SharedOverview` "Invitations" `ListGroup`
- [x] Accept invitation (Join) → invitation row button
- [x] Decline invitation → invitation row button
- [x] Hero: "Overall you are owed / you owe / all settled up" + abs(net) → `HeroCard`
- [x] Pills: you are owed (owed_to_me), you owe (i_owe) → `HeroCard` pills
- [x] Friends: name, "owes you"/"you owe", amount → "Friends" `ListGroup`
- [x] Groups list: name, "shared" tag, member names, my net (get back / owe / settled up), opens
      group → "Groups" `ListGroup` rows (link to `?group=id`)
- [x] Empty groups text → `EmptyState` with "New group" action
- [x] New group form: name, pick contacts (with @login), invite usernames, new names → `NewGroupSheet`
      (opens the new group after creating, as the old redirect did)
- [x] Add people (comma separated) → "People" inline add form
- [x] People list: name, @login tag, group count → "People" `ListGroup`
- [x] Rename person → `PersonSheet`
- [x] Link person to username (+ hint "linking invites them…") → `PersonSheet`
- [x] Unlink (only with 0 groups) / "Linked to @x" note otherwise → `PersonSheet`
- [x] Remove person (only with 0 groups, confirm) → `PersonSheet`

### Group detail (`_shared.html`, group selected)

- [x] Back to all groups → `PageHeader` back link (+ browser Back)
- [x] Title, member names, "created by X" when not mine → `PageHeader` title + eyebrow
- [x] Hero: you get back / you owe / settled up + abs(my_net); group spending pill → `HeroCard`
- [x] "+ Add expense" and "Settle up" buttons → action buttons under the hero
- [x] Balances: avatar, name, invited/declined/@login tag, gets back/owes/settled + amount →
      "Balances" `ListGroup`
- [x] Suggested payments (+ hint), "mine" highlight, Record → prefilled settle sheet →
      "Suggested payments" `ListGroup`
- [x] Activity — bill: date, description with #tags, amount, "X paid · split <method>", effect
      (you lent / paid only your share / you borrowed / not involved) → activity rows (by day)
- [x] "Not in your budget yet" / "Only partly in your budget: pick …" → row badge + `BillDetailSheet`
- [x] Details: added by, "in your budget", per-person split with % / shares → `BillDetailSheet`
- [x] Record bill into my budget (category if I have a share, account if I paid; Add / Update) →
      `BillDetailSheet`
- [x] Edit bill (form preloaded from payload) → `BillSheet` in edit mode
- [x] Remove bill from my budget → `BillDetailSheet`
- [x] Delete bill (confirm, warns about everyone's entries) → `BillDetailSheet`
- [x] Activity — payment: date, "A paid B", amount, notes, added by, "in your accounts" →
      activity rows + `PaymentDetailSheet`
- [x] Delete payment (confirm) → `PaymentDetailSheet`
- [x] Record payment in my accounts (account; "paid from"/"received into") → `PaymentDetailSheet`
- [x] Remove payment from my accounts → `PaymentDetailSheet`
- [x] Empty activity text → `EmptyState`
- [x] Group settings: rename → `GroupSettingsSheet`
- [x] Members list with @login, creator, status; Remove / Leave (confirm on leave) →
      `GroupSettingsSheet`
- [x] Add member: from contacts, invite usernames, new names → `GroupSettingsSheet`
- [x] Delete group (creator only, confirm) → `GroupSettingsSheet`

### Add/edit bill sheet (`_shared_modals.html` + app.js)

- [x] Title "New / Edit shared expense" → `BillSheet`
- [x] Amount → `AmountInput`
- [x] Description (max 60, #tags) → text input
- [x] Paid by (default me) → `ChipPicker`
- [x] Date (default today) → `DatePicker`
- [x] Split method: equally / exact amounts / percentages / shares → segmented `ChipPicker`
- [x] Per member: include toggle (equal) or value input (others) + live share → `SplitEditor`
- [x] Live status: "about X each", "pick at least one", "adds up", "X left", "X too much",
      "total N% of 100%", "N shares in total", "give someone a share" → `SplitEditor` status line
- [x] "Add my part to my budget" (default on; edit = current recording state) → switch
- [x] My share's category (only when I have a share) → `ChipPicker`
- [x] Paid from account (only when I paid; not Shared balances) → `ChipPicker`
- [x] Record hint ("X goes to your budget; the Y you lent moves to Shared balances", "not part of
      this bill…") → `BillSheet` hint
- [x] Server error shown inline → `FieldError`

### Settle-up sheet

- [x] Amount, who paid, paid to, date, note → `SettleSheet`
- [x] Defaults from `settlement_defaults` (first suggestion, else me → 2nd member) → `SettleSheet`
- [x] Prefill from a suggested payment → `SettleSheet`
- [x] "Record in my accounts" (only when I'm payer/receiver) + account labelled "Paid from" /
      "Received into" → `SettleSheet`

## Additions (not in the old app)

- Split helpers: "Split evenly" for percentages/shares and "give the rest here" per empty row for
  exact amounts. Each split method keeps its own typed values while switching methods.
- Save is disabled while the live check says the split cannot pass the server rules; the server's
  `detail` is still shown inline if it rejects.
- Activity grouped by day with relative day headings; bill/payment actions live in detail sheets.
- The bill amount uses the text `AmountInput` (native decimal keyboard) on mobile too, not the
  keypad: the split rows need the same keyboard and a keypad under a long form was awkward.

## Notes

- The live split preview (shares in cents, largest remainder) mirrors `shared.allocate` /
  `compute_splits` in `split.ts`; it is feedback only, the stored figures come from the API.
- Leaving / deleting a group, and joining from an invitation, navigate before the refresh so the
  screen never flashes "group not found".

## Tests

- Vitest: `split.test.ts`, `labels.test.ts`, `forms.test.ts`, `BillSheet.test.tsx` (bill and
  settle forms: live status, submit mapping, edit keeps record state, inline server error),
  `SharedPage.test.tsx` (overview, invitation join → `?group=`, 404 group): 21 tests.
- Playwright `e2e/shared.spec.ts` against the real backend, two browser contexts (A invites B):
  people add/rename/remove, create group, equal bill, edit to percent → exact (rest button), B
  joins and adds a shares bill, A records/un-records its share, records a suggested payment,
  un-records and deletes it, deletes the bill, renames the group, adds/removes a member, B has no
  delete, A deletes the group. Runs on mobile (390) and desktop (1280). Run with
  `VBX_E2E_BASE=http://127.0.0.1:5184 npx playwright test e2e/shared.spec.ts`.
- Screenshots: `frontend/screenshots/shared/`.

## Not covered

Nothing dropped.

## API requests

- None blocking. The core still returns English strings (`effect_text`, `method_label`,
  `added_by == "you"`, `owner_name == "you"`, names `"You"`); the screen builds its own text from
  `effect`, `split_method`, `is_me`, `i_paid`, `involved`, `me_id`, `is_owner`. A boolean
  `added_by_me` (bills, payments) would be cleaner than comparing with the literal "you".

## Foundation requests

- A real route `/shared/groups/:groupId` (detail is now `?group=<id>` inside `SharedPage`).
- A multi-select chip picker in `src/components` (built locally as `ToggleChips` in `SharedParts.tsx`).
- `ResponsiveSheet` desktop dialog: its content grid lets a horizontally scrolling `ChipPicker`
  widen the dialog unless the child has `min-w-0` (worked around in every shared sheet; `min-w-0`
  on the dialog's children inside the component would fix it for everyone).
- Playwright config: take the base URL / port from an env var so each agent can run e2e against
  its own Vite server (`e2e/shared.spec.ts` sets `test.use({ baseURL })` itself for now).
- A small `Avatar` (initial in a circle) in `src/components` (built locally).
