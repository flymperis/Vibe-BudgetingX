"""Shared expenses, ported from the old routes/shared.py (every write) and the
Shared panel of routes/dashboard.py (shared.panel_context).

Access rule (old shared.group_for_user): a group, its bills and payments are
visible and editable by every *active* member who is a server user; invited
or declined users see only the invitation. Only the group's creator may
delete the group, and the creator can't be removed. Any active member may
edit/delete any bill or payment, remove members without history, and leave.
Recording a bill/payment in one's own books is per user.

Old flash errors become {"detail"}: 404 for a group/bill/payment/person the
user can't reach, 403 for "only the creator", 400 for everything else.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter

from vbx.core import shared
from vbx.core.helpers import _user_owns_account, _user_owns_category, normalize_txn_day_from_form

from ..deps import DB, User
from ..errors import ApiError
from ..schemas.shared import (
    ExpenseIn,
    GroupDetailOut,
    GroupIn,
    LinkIn,
    MembersIn,
    NameIn,
    RecordExpenseIn,
    RecordSettlementIn,
    SettlementIn,
    SharedActionOut,
    SharedOverviewOut,
)

router = APIRouter(prefix="/shared", tags=["shared"])

GROUP_NOT_FOUND = "Group not found."
EXPENSE_NOT_FOUND = "Expense not found."
PAYMENT_NOT_FOUND = "Payment not found."


# --- form helpers (old routes/shared.py) -------------------------------------


def _done(message: str, group_id=None) -> SharedActionOut:
    return SharedActionOut(message=message, group_id=None if group_id is None else int(group_id))


def _int_or_none(raw):
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return None


def _flag(raw) -> bool:
    """The old checkbox test form.get(name) == "1"; JSON true works too."""
    if isinstance(raw, bool):
        return raw
    return raw is not None and str(raw).strip() == "1"


def _text(raw) -> str:
    return "" if raw is None else str(raw)


def _joined(raw) -> str:
    """A comma separated string as the old form sent it (lists are joined)."""
    if raw is None:
        return ""
    if isinstance(raw, list):
        return ",".join(str(x) for x in raw if x is not None)
    return str(raw)


def _new_names(raw):
    """'Anna, Nikos' -> ['Anna', 'Nikos'] (blank and duplicate names dropped)."""
    seen, names = set(), []
    for part in _joined(raw).replace("\n", ",").split(","):
        name = shared.clean_name(part)
        if name and name.lower() not in seen:
            seen.add(name.lower())
            names.append(name)
    return names


def _own_account(conn, uid, account_id):
    """A real account of this user (not their Shared balances), or None."""
    if not account_id or not _user_owns_account(conn, account_id, uid):
        return None
    if account_id == shared.ledger_account_id(conn, uid):
        return None
    return account_id


def _members_from_body(conn, uid, body: MembersIn):
    """Person ids picked or typed on a group/member form: contacts, new plain
    names, and server usernames to invite. Raises ValueError (unknown user)."""
    ids = []
    for raw in [*body.member_ids, body.person_id]:
        pid = _int_or_none(raw)
        if pid and shared.person_owned(conn, uid, pid) and pid not in ids:
            ids.append(pid)
    for name in _new_names(body.new_members):
        ids.append(shared.find_or_create_person(conn, uid, name))
    for login in _new_names(body.usernames):
        ids.append(shared.contact_for_username(conn, uid, login))
    return ids


def _require_group(conn, uid, group_id):
    grp = shared.group_for_user(conn, uid, group_id)
    if not grp:
        raise ApiError(404, GROUP_NOT_FOUND)
    return grp


def _expense_from_body(conn, uid, group_id, body: ExpenseIn):
    """Validated fields, splits and the submitting user's own recording choice
    for a shared bill; raises ValueError with a user-facing message."""
    member_ids = shared.group_member_ids(conn, group_id)
    description = shared.clean_name(body.description) or "Expense"
    try:
        amount_cents = shared.parse_cents(body.amount)
    except ValueError:
        raise ValueError("Enter the bill amount.") from None
    if amount_cents <= 0:
        raise ValueError("Enter an amount above zero.")
    paid_by = _int_or_none(body.paid_by)
    if paid_by not in member_ids:
        raise ValueError("Choose who paid from the group's members.")
    method = (body.split_method or "equal").strip()
    included = {_int_or_none(x) for x in body.included}
    entries = [(pid, pid in included, _text(body.values.get(str(pid), ""))) for pid in member_ids]
    splits = shared.compute_splits(method, amount_cents, entries)

    me = shared.member_person(conn, group_id, uid)
    my_share = sum(c for pid, c, _ in splits if pid == me)
    i_paid = paid_by == me
    record = _flag(body.record_personal) and (i_paid or my_share > 0)
    link = None
    if record:
        category_id = _int_or_none(body.category_id) if my_share > 0 else None
        account_id = _int_or_none(body.account_id) if i_paid else None
        if my_share > 0 and not (category_id and _user_owns_category(conn, category_id, uid, expense=True)):
            raise ValueError("Choose the category for your share.")
        if i_paid and not _own_account(conn, uid, account_id):
            raise ValueError("Choose the account the money actually left (not Shared balances).")
        link = (category_id, account_id)
    return {
        "description": description,
        "amount_cents": amount_cents,
        "paid_by": paid_by,
        "split_method": method,
        "spent_on": normalize_txn_day_from_form(_text(body.spent_on)),
        "splits": splits,
        "link": link,
    }


def _save_splits(conn, expense_id, splits):
    conn.execute("DELETE FROM shared_expense_splits WHERE expense_id = ?", (expense_id,))
    conn.executemany(
        "INSERT INTO shared_expense_splits (expense_id, person_id, share_cents, input_value) VALUES (?, ?, ?, ?)",
        [(expense_id, pid, cents, value) for pid, cents, value in splits],
    )


def _apply_links(conn, uid, expense_id, link):
    """The submitter's own choice, then everyone else's rows follow the bill."""
    if link:
        shared.set_expense_link(conn, uid, expense_id, *link)
    else:
        shared.clear_expense_link(conn, uid, expense_id)
    shared.relink_expense(conn, expense_id)


def _expense_group(conn, uid, expense_id):
    """The bill's group id when this user is an active member there, else 404."""
    row = conn.execute("SELECT group_id FROM shared_expenses WHERE id = ?", (expense_id,)).fetchone()
    if not row or not shared.group_for_user(conn, uid, row["group_id"]):
        raise ApiError(404, EXPENSE_NOT_FOUND)
    return int(row["group_id"])


def _settlement_group(conn, uid, settlement_id):
    row = conn.execute("SELECT group_id FROM shared_settlements WHERE id = ?", (settlement_id,)).fetchone()
    if not row or not shared.group_for_user(conn, uid, row["group_id"]):
        raise ApiError(404, PAYMENT_NOT_FOUND)
    return int(row["group_id"])


# --- reading (the Shared panel) ----------------------------------------------


def _own_accounts(conn, uid, ledger_id):
    """The panel's own_accounts: the dashboard's account list (by name) minus
    Shared balances."""
    rows = conn.execute("SELECT id, name FROM accounts WHERE user_id = ? ORDER BY name", (uid,)).fetchall()
    return [{"id": int(r["id"]), "name": r["name"]} for r in rows if int(r["id"]) != ledger_id]


def _overview(ctx, own_accounts):
    return {
        "contacts": ctx["contacts"],
        "invitations": ctx["invitations"],
        "groups": ctx["groups"],
        "friend_balances": ctx["friend_balances"],
        "owed_to_me": ctx["owed_to_me"],
        "i_owe": ctx["i_owe"],
        "net": ctx["net"],
        "ledger_account_id": ctx["ledger_account_id"],
        "own_accounts": own_accounts,
        "split_methods": [{"key": k, "label": label} for k, label in ctx["split_methods"]],
    }


@router.get("", response_model=SharedOverviewOut)
def overview(user: User, conn: DB):
    """Everything the Shared panel shows without a group open."""
    ctx = shared.panel_context(conn, user.id)
    out = _overview(ctx, _own_accounts(conn, user.id, ctx["ledger_account_id"]))
    conn.commit()  # panel_context creates the user's own person on first use, as the dashboard did
    return out


@router.get("/groups/{group_id}", response_model=GroupDetailOut)
def group_detail(group_id: int, user: User, conn: DB):
    """One group as the panel shows it when opened (active members only)."""
    ctx = shared.panel_context(conn, user.id, group_id)
    sel = ctx["selected"]
    conn.commit()
    if sel is None:
        raise ApiError(404, GROUP_NOT_FOUND)
    today = datetime.now().date().isoformat()
    members = sel["members"]
    me = sel["me_id"]
    first = sel["suggestions"][0] if sel["suggestions"] else None
    if first:
        settle_from, settle_to, settle_amount = first["from_id"], first["to_id"], first["amount"]
    else:
        settle_from = me
        settle_to = members[1]["id"] if len(members) > 1 else None
        settle_amount = None
    return {
        **sel,
        "expense_defaults": {
            "paid_by": me,
            "split_method": shared.SPLIT_METHODS[0],
            "included": [m["id"] for m in members],
            "spent_on": today,
            "record_personal": True,
        },
        "settlement_defaults": {
            "from_person_id": settle_from,
            "to_person_id": settle_to,
            "amount": settle_amount,
            "paid_on": today,
            "record_personal": True,
        },
    }


# --- people ------------------------------------------------------------------


@router.post("/people", response_model=SharedActionOut)
def add_person(body: NameIn, user: User, conn: DB):
    names = _new_names(body.name)
    if not names:
        raise ApiError(400, "Enter a name.")
    for name in names:
        shared.find_or_create_person(conn, user.id, name)
    conn.commit()
    return _done(f"Added {', '.join(names)}.")


@router.put("/people/{person_id}", response_model=SharedActionOut)
def rename_person(person_id: int, body: NameIn, user: User, conn: DB):
    name = shared.clean_name(body.name)
    if not name:
        raise ApiError(400, "Enter a name.")
    row = conn.execute(
        "SELECT is_self FROM shared_people WHERE id = ? AND user_id = ?", (person_id, user.id)
    ).fetchone()
    if not row:
        raise ApiError(404, "That person can't be renamed.")
    if row["is_self"]:
        raise ApiError(400, "That person can't be renamed.")
    if conn.execute(
        "SELECT 1 FROM shared_people WHERE user_id = ? AND name = ? AND id != ?",
        (user.id, name, person_id),
    ).fetchone():
        raise ApiError(400, f"There is already someone called {name}.")
    conn.execute("UPDATE shared_people SET name = ? WHERE id = ?", (name, person_id))
    conn.commit()
    return _done("Name saved.")


@router.put("/people/{person_id}/link", response_model=SharedActionOut)
def link_person(person_id: int, body: LinkIn, user: User, conn: DB):
    try:
        shared.link_contact(conn, user.id, person_id, body.username)
    except ValueError as exc:
        raise ApiError(400, str(exc)) from None
    conn.commit()
    return _done("Linked. Groups they are in now show up as invitations for them.")


@router.delete("/people/{person_id}/link", response_model=SharedActionOut)
def unlink_person(person_id: int, user: User, conn: DB):
    try:
        shared.unlink_contact(conn, user.id, person_id)
    except ValueError as exc:
        raise ApiError(400, str(exc)) from None
    conn.commit()
    return _done("Unlinked.")


@router.delete("/people/{person_id}", response_model=SharedActionOut)
def delete_person(person_id: int, user: User, conn: DB):
    row = conn.execute(
        "SELECT is_self FROM shared_people WHERE id = ? AND user_id = ?", (person_id, user.id)
    ).fetchone()
    if not row:
        raise ApiError(404, "That person can't be removed.")
    if row["is_self"]:
        raise ApiError(400, "That person can't be removed.")
    if conn.execute("SELECT 1 FROM shared_group_members WHERE person_id = ? LIMIT 1", (person_id,)).fetchone():
        raise ApiError(400, "Remove them from their groups first.")
    conn.execute("DELETE FROM shared_people WHERE id = ?", (person_id,))
    conn.commit()
    return _done("Person removed.")


# --- groups ------------------------------------------------------------------


@router.post("/groups", response_model=SharedActionOut)
def add_group(body: GroupIn, user: User, conn: DB):
    name = shared.clean_name(body.name)
    if not name:
        raise ApiError(400, "Give the group a name.")
    uid = user.id
    try:
        people = _members_from_body(conn, uid, body)
    except ValueError as exc:
        raise ApiError(400, str(exc)) from None
    gid = shared.create_group(conn, uid, name)
    invited = sum(1 for pid in people if shared.add_member(conn, gid, pid) == "invited")
    conn.commit()
    msg = f"Group “{name}” created."
    if invited:
        msg += f" {invited} user{'s were' if invited != 1 else ' was'} invited."
    return _done(msg, gid)


@router.put("/groups/{group_id}", response_model=SharedActionOut)
def rename_group(group_id: int, body: NameIn, user: User, conn: DB):
    name = shared.clean_name(body.name)
    _require_group(conn, user.id, group_id)
    if not name:
        raise ApiError(400, "Give the group a name.")
    conn.execute("UPDATE shared_groups SET name = ? WHERE id = ?", (name, group_id))
    conn.commit()
    return _done("Group renamed.", group_id)


@router.delete("/groups/{group_id}", response_model=SharedActionOut)
def delete_group(group_id: int, user: User, conn: DB):
    grp = _require_group(conn, user.id, group_id)
    if int(grp["user_id"]) != user.id:
        raise ApiError(403, "Only the person who created the group can delete it.")
    shared.delete_group(conn, group_id)
    conn.commit()
    return _done("Group deleted, along with the entries it had added to everyone's accounts.")


@router.post("/groups/{group_id}/accept", response_model=SharedActionOut)
def accept_invite(group_id: int, user: User, conn: DB):
    ok = shared.respond_to_invite(conn, user.id, group_id, accept=True)
    conn.commit()
    if not ok:
        raise ApiError(404, "Invitation not found.")
    return _done(
        "You joined the group. Use “Add to my budget” on bills you want in your own accounts.",
        group_id,
    )


@router.post("/groups/{group_id}/decline", response_model=SharedActionOut)
def decline_invite(group_id: int, user: User, conn: DB):
    ok = shared.respond_to_invite(conn, user.id, group_id, accept=False)
    conn.commit()
    if not ok:
        raise ApiError(404, "Invitation not found.")
    return _done("Invitation declined.")


@router.post("/groups/{group_id}/members", response_model=SharedActionOut)
def add_member(group_id: int, body: MembersIn, user: User, conn: DB):
    uid = user.id
    _require_group(conn, uid, group_id)
    try:
        people = _members_from_body(conn, uid, body)
    except ValueError as exc:
        raise ApiError(400, str(exc)) from None
    if not people:
        raise ApiError(400, "Choose someone to add.")
    results = [shared.add_member(conn, group_id, pid) for pid in people]
    # Committed before answering, as the old route did: contacts created from
    # typed names/usernames stay even when everyone was already a member.
    conn.commit()
    if all(r == "already" for r in results):
        raise ApiError(400, "They are already in this group.")
    if "invited" in results:
        return _done("Invitation sent. They'll see the group once they accept.", group_id)
    return _done("Member added.", group_id)


@router.delete("/groups/{group_id}/members/{person_id}", response_model=SharedActionOut)
def remove_member(group_id: int, person_id: int, user: User, conn: DB):
    uid = user.id
    grp = _require_group(conn, uid, group_id)
    person = conn.execute("SELECT linked_user_id FROM shared_people WHERE id = ?", (person_id,)).fetchone()
    if person and person["linked_user_id"] == grp["user_id"]:
        raise ApiError(400, "The group's creator can't be removed.")
    if shared.person_involved_in_group(conn, group_id, person_id):
        raise ApiError(400, "They already appear in this group's expenses or payments, so they can't be removed.")
    conn.execute("DELETE FROM shared_group_members WHERE group_id = ? AND person_id = ?", (group_id, person_id))
    conn.commit()
    leaving = bool(person and person["linked_user_id"] == uid)
    return _done("You left the group." if leaving else "Member removed.", None if leaving else group_id)


# --- bills -------------------------------------------------------------------


@router.post("/groups/{group_id}/expenses", response_model=SharedActionOut)
def add_expense(group_id: int, body: ExpenseIn, user: User, conn: DB):
    uid = user.id
    _require_group(conn, uid, group_id)
    try:
        data = _expense_from_body(conn, uid, group_id, body)
    except ValueError as exc:
        raise ApiError(400, str(exc)) from None
    shared.create_expense(
        conn,
        uid,
        group_id,
        data["description"],
        data["amount_cents"],
        data["paid_by"],
        data["split_method"],
        data["spent_on"],
        data["splits"],
        data["link"],
    )
    conn.commit()
    return _done(f"Added “{data['description']}”.", group_id)


@router.put("/expenses/{expense_id}", response_model=SharedActionOut)
def edit_expense(expense_id: int, body: ExpenseIn, user: User, conn: DB):
    uid = user.id
    group_id = _expense_group(conn, uid, expense_id)
    try:
        data = _expense_from_body(conn, uid, group_id, body)
    except ValueError as exc:
        raise ApiError(400, str(exc)) from None
    conn.execute(
        """
        UPDATE shared_expenses
        SET description = ?, amount_cents = ?, paid_by = ?, split_method = ?, spent_on = ?
        WHERE id = ?
        """,
        (
            data["description"],
            data["amount_cents"],
            data["paid_by"],
            data["split_method"],
            data["spent_on"],
            expense_id,
        ),
    )
    _save_splits(conn, expense_id, data["splits"])
    _apply_links(conn, uid, expense_id, data["link"])
    conn.commit()
    return _done("Expense saved.", group_id)


@router.delete("/expenses/{expense_id}", response_model=SharedActionOut)
def delete_expense(expense_id: int, user: User, conn: DB):
    group_id = _expense_group(conn, user.id, expense_id)
    shared.delete_expense(conn, expense_id)
    conn.commit()
    return _done("Expense deleted.", group_id)


@router.put("/expenses/{expense_id}/record", response_model=SharedActionOut)
def record_expense(expense_id: int, body: RecordExpenseIn, user: User, conn: DB):
    """Put one bill into the current user's own books (their category and, if
    they paid, the account it came from). Also re-records with new choices."""
    uid = user.id
    group_id = _expense_group(conn, uid, expense_id)
    me = shared.member_person(conn, group_id, uid)
    my_share, i_paid = shared.expense_involvement(conn, expense_id, me)
    if not (my_share or i_paid):
        raise ApiError(400, "You aren't part of this bill.")
    category_id = _int_or_none(body.category_id) if my_share else None
    account_id = _int_or_none(body.account_id) if i_paid else None
    if my_share and not (category_id and _user_owns_category(conn, category_id, uid, expense=True)):
        raise ApiError(400, "Choose the category for your share.")
    if i_paid and not _own_account(conn, uid, account_id):
        raise ApiError(400, "Choose the account you paid from.")
    shared.set_expense_link(conn, uid, expense_id, category_id, account_id)
    conn.commit()
    return _done("Added to your budget.", group_id)


@router.delete("/expenses/{expense_id}/record", response_model=SharedActionOut)
def unrecord_expense(expense_id: int, user: User, conn: DB):
    group_id = _expense_group(conn, user.id, expense_id)
    shared.clear_expense_link(conn, user.id, expense_id)
    conn.commit()
    return _done("Removed from your budget.", group_id)


# --- settling up ---------------------------------------------------------------


@router.post("/groups/{group_id}/settlements", response_model=SharedActionOut)
def add_settlement(group_id: int, body: SettlementIn, user: User, conn: DB):
    uid = user.id
    _require_group(conn, uid, group_id)
    member_ids = shared.group_member_ids(conn, group_id)
    from_id = _int_or_none(body.from_person_id)
    to_id = _int_or_none(body.to_person_id)
    if from_id not in member_ids or to_id not in member_ids:
        raise ApiError(400, "Choose who paid and who received from the group's members.")
    if from_id == to_id:
        raise ApiError(400, "Someone can't pay themselves.")
    try:
        cents = shared.parse_cents(body.amount)
    except ValueError:
        cents = 0
    if cents <= 0:
        raise ApiError(400, "Enter an amount above zero.")
    me = shared.member_person(conn, group_id, uid)
    record = _flag(body.record_personal) and me in (from_id, to_id)
    account_id = _own_account(conn, uid, _int_or_none(body.account_id)) if record else None
    if record and not account_id:
        raise ApiError(400, "Choose the account the money went from or to (not Shared balances).")
    cur = conn.execute(
        """
        INSERT INTO shared_settlements (user_id, group_id, from_person_id, to_person_id, amount_cents, paid_on, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            uid,
            group_id,
            from_id,
            to_id,
            cents,
            normalize_txn_day_from_form(_text(body.paid_on)),
            shared.clean_name(body.notes),
        ),
    )
    if record:
        shared.set_settlement_link(conn, uid, int(cur.lastrowid), account_id)
    conn.commit()
    return _done("Payment recorded.", group_id)


@router.delete("/settlements/{settlement_id}", response_model=SharedActionOut)
def delete_settlement(settlement_id: int, user: User, conn: DB):
    group_id = _settlement_group(conn, user.id, settlement_id)
    shared.delete_settlement(conn, settlement_id)
    conn.commit()
    return _done("Payment deleted.", group_id)


@router.put("/settlements/{settlement_id}/record", response_model=SharedActionOut)
def record_settlement(settlement_id: int, body: RecordSettlementIn, user: User, conn: DB):
    uid = user.id
    group_id = _settlement_group(conn, uid, settlement_id)
    account_id = _own_account(conn, uid, _int_or_none(body.account_id))
    if not account_id:
        raise ApiError(400, "Choose a real account (not Shared balances).")
    shared.set_settlement_link(conn, uid, settlement_id, account_id)
    conn.commit()
    return _done("Payment added to your accounts.", group_id)


@router.delete("/settlements/{settlement_id}/record", response_model=SharedActionOut)
def unrecord_settlement(settlement_id: int, user: User, conn: DB):
    group_id = _settlement_group(conn, user.id, settlement_id)
    shared.clear_settlement_link(conn, user.id, settlement_id)
    conn.commit()
    return _done("Payment removed from your accounts.", group_id)
