# Parity — agent C: shared expenses

Old sources: `routes/shared.py` (21 routes + helpers), core `shared.py` (= `vbx/core/shared.py`,
byte-identical, unchanged), the Shared part of `routes/dashboard.py::index`
(`shared.panel_context(conn, uid, ?group)` + `conn.commit()`), templates `panels/_shared.html`
and `panels/_shared_modals.html`.

New files: `backend/vbx/api/routers/shared.py`, `backend/vbx/api/schemas/shared.py`,
`backend/tests/test_shared.py` (extended), `backend/tests/test_shared_api.py`,
`backend/tests/helpers_shared.py`.

## 1. Old test → new test

| Old test (`tests/test_shared.py::`) | New test | Notes |
| --- | --- | --- |
| `test_allocate_adds_up_and_spreads_leftover_cents` | `tests/test_shared.py::test_allocate_adds_up_and_spreads_leftover_cents` | 1:1 pure (already existed) |
| `test_parse_cents_accepts_comma_and_rejects_garbage` | `tests/test_shared.py::test_parse_cents_accepts_comma_and_rejects_garbage` | 1:1 pure (already existed) |
| `test_compute_splits_every_method` | `tests/test_shared.py::test_compute_splits_every_method` | 1:1 pure (already existed) |
| `test_simplify_debts_needs_at_most_n_minus_one_payments` | `tests/test_shared.py::test_simplify_debts_needs_at_most_n_minus_one_payments` | 1:1 pure (already existed) |
| `test_paying_a_shared_bill_books_only_my_share_as_spending` | `tests/test_shared.py::test_paying_a_shared_bill_books_only_my_share_as_spending` | "Suggested payments"/"Dinner" in page → `suggestions` non-empty, activity has Dinner; plus recorded/effect fields |
| `test_someone_else_paying_books_my_share_against_shared_balances` | same name in `tests/test_shared.py` | 1:1 |
| `test_editing_and_deleting_rebuild_the_linked_rows` | same name | exact split via `values` |
| `test_unrecorded_bills_leave_my_accounts_alone` | same name | + `involved && !recorded` |
| `test_bad_split_is_rejected_without_saving` | same name | "not 100%" in `detail`, 400 |
| `test_member_with_history_cannot_be_removed` | same name | 400 + exact message, `removable: false` |
| `test_deleting_a_group_removes_its_personal_rows` | same name | 1:1 |
| `test_groups_are_private_to_their_owner` | same name | intruder gets 404s; "Trip" not in detail response; overview groups empty |
| `test_invited_user_sees_group_only_after_joining` | same name | "invited you to … Flat" → `invitations`; "All groups" (group page) → detail 200/404; "created by mu_owner1" → `owner_name` + `is_owner: false` |
| `test_each_member_records_their_own_side` | same name | "Not in your budget yet" → `involved && !recorded` |
| `test_only_the_creator_can_delete_and_members_can_leave` | same name | friend delete → 403 |
| `test_declined_member_stays_a_name_without_access` | same name | "declined" in owner page → member `status == "declined"` |
| `test_friend_balance_adds_up_across_groups_by_login` | same name | asserted through `GET /api/shared` instead of calling `panel_context` directly |
| `test_linking_a_contact_invites_them_to_existing_groups` | same name | 400 "no user called…", then `invitations` |

Not mine: `test_tags.py::test_shared_bill_keeps_its_tag_in_my_share` is Telegram-driven (agent E).

New tests beyond the old suite (`tests/test_shared_api.py`, 17): auth/CSRF; people add/rename/
delete with every message; people privacy; link/unlink rules; group create validation (incl.
rollback on unknown username) and rename; add/remove members (all branches, foreign contact ids
ignored, outsiders 404); accept/decline without invitation; re-inviting a declined user; every
bill validation branch (17 cases, foreign category/account, Shared balances refused, record ignored
when uninvolved); defaults for description/date/amount rounding and stored input values; edit
validation and "edit without record_personal unrecords me"; record/unrecord bill branches incl.
"You aren't part of this bill."; `record_incomplete`; every settlement validation branch;
record/unrecord/delete settlement incl. outsiders; empty overview; group detail balances,
suggestions, activity order and form defaults.

## 2. Endpoints (`/api/shared`)

All mutations answer `SharedActionOut {ok, message, group_id}`; `group_id` is the group the old
app redirected back to (`null` = overview). Errors: 404 group/bill/payment/person not reachable,
403 only-creator, 400 everything else, messages = old flash texts.

| Method | Path | Old route | Purpose |
| --- | --- | --- | --- |
| GET | `/api/shared` | dashboard `panel_context(uid)` | contacts, invitations, groups (my_net, member_names, shared tag), friend balances, owed_to_me / i_owe / net, ledger_account_id, own_accounts (accounts by name minus Shared balances), split methods |
| GET | `/api/shared/groups/{gid}` | dashboard `panel_context(uid, gid)` | open group: members (status, net, removable…), suggestions, activity (bills with splits/effect/record state/edit payload; payments), total_spent, addable_contacts, owner info, `expense_defaults`, `settlement_defaults`; 404 unless active member |
| POST | `/people` | `add_person` | add one or more comma-separated names |
| PUT | `/people/{pid}` | `rename_person` | rename a contact |
| DELETE | `/people/{pid}` | `delete_person` | remove a group-less contact |
| PUT | `/people/{pid}/link` | `link_person` | link contact to a login (invites them to its groups) |
| DELETE | `/people/{pid}/link` | `unlink_person` | unlink |
| POST | `/groups` | `add_group` | create group with contacts/new names/usernames |
| PUT | `/groups/{gid}` | `rename_group` | rename |
| DELETE | `/groups/{gid}` | `delete_group` | creator only; removes everyone's linked rows |
| POST | `/groups/{gid}/accept` | `accept_invite` | join |
| POST | `/groups/{gid}/decline` | `decline_invite` | decline |
| POST | `/groups/{gid}/members` | `add_member` | add/invite members |
| DELETE | `/groups/{gid}/members/{pid}` | `remove_member` | remove a member without history, or leave |
| POST | `/groups/{gid}/expenses` | `add_expense` | add a bill (+ optional own recording) |
| PUT | `/expenses/{eid}` | `edit_expense` | edit a bill; rebuilds everyone's rows |
| DELETE | `/expenses/{eid}` | `delete_expense` | delete a bill for everyone |
| PUT | `/expenses/{eid}/record` | `record_expense` | put my side in my books (or update it) |
| DELETE | `/expenses/{eid}/record` | `unrecord_expense` | remove my side from my books |
| POST | `/groups/{gid}/settlements` | `add_settlement` | record a payment (+ optional own transfer) |
| DELETE | `/settlements/{sid}` | `delete_settlement` | delete for everyone |
| PUT | `/settlements/{sid}/record` | `record_settlement` | put a payment in my accounts |
| DELETE | `/settlements/{sid}/record` | `unrecord_settlement` | remove it |

Request shapes: the old `include_<pid>` / `value_<pid>` form fields become `included: [pid]` and
`values: {"<pid>": raw}` (same shape as the activity item's `payload`, so the edit form can send
the payload back). `new_members` / `usernames` accept a comma-separated string or a list.
`record_personal` accepts `true` or `"1"`. Ids/amounts may be numbers or strings, as in forms.

## 3. Core changes

None. `vbx/core/shared.py` is untouched (still byte-identical to the old `shared.py`).

## 4. Deviations

- Status codes: old routes always redirected; errors are now 400/403/404 as above. "That person
  can't be renamed/removed." is 404 for a missing/foreign person and 400 for your own "You" row
  (same text).
- `add_member` "They are already in this group." is a 400, but, exactly like the old route, it is
  answered after `commit()`: contacts created from typed names/usernames in that request stay.
- `GET /api/shared/groups/{gid}` returns 404 when the user is not an active member (old page just
  showed the overview without a group).
- Form defaults are returned explicitly (`expense_defaults`, `settlement_defaults`) instead of
  living in the template; settlement "to" defaults to the 2nd listed member (template `loop.index ==
  2`), `null` when the group has a single member (browser would have picked the first option).
- Route helper names `_members_from_form`/`_expense_from_form` became `_members_from_body`/
  `_expense_from_body` (same logic, JSON body instead of `request.form`). A member absent from
  `included`/`values` counts as an unchecked box / blank value (old form always sent every member).
- `own_accounts` is computed server-side (dashboard account list minus `ledger_account_id`).

## 5. Requests / open questions

- None blocking. `effect_text`, `method_label`, `added_by == "you"` and `"You"` are English strings
  produced by core `panel_context`; the frontend should translate them by key or use the raw fields
  (`effect`, `split_method`, `is_me`).
- `docs/TEST_PARITY.md` rows 162–175 can be switched from PENDING to the tests above (I did not
  edit that file, per the brief).

## 6. Suspected old bugs (ported unchanged)

- `unlink_person` on a contact that is not yours (and not in any group) answers "Unlinked." and
  changes nothing; if a *foreign* contact is in a group the message "They are in a group…" reveals
  that it exists (core `unlink_contact` checks group membership before ownership).
- `remove_member` does not check that the person is actually in the group: removing a non-member
  answers "Member removed.". Any active member (not only the creator) may remove other members.
- `record_settlement` never checks that the user is the payer or the receiver: for a payment
  between two others it answers "Payment added to your accounts." while core
  `set_settlement_link` silently records nothing.
- `link_contact` raises "That person can't be linked." for a foreign person id (400, not 404).
- Editing a bill without `record_personal` removes the *editor's* own recording of it (old form
  had the checkbox on by default, so this mostly bites API clients).
- `_members_from_form` dedupes picked contact ids but not typed names/usernames (adding the same
  person twice yields "already" for the second, harmless).
