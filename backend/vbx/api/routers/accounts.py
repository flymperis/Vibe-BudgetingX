"""Accounts and credit cards, ported from the old routes/accounts.py (writes)
and the balances the dashboard computed for the Home, Transfer and Settings >
Banks panels (routes/dashboard.py::index)."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta

from fastapi import APIRouter

from vbx.core.banks import detect_bank
from vbx.core.finance import fetch_account_balances_through, is_credit_card, summarize_account_balances
from vbx.core.helpers import _parse_opening_balance, normalize_month

from ..deps import DB, User
from ..errors import ApiError
from ..schemas.accounts import AccountIn, AccountListOut, AccountOut
from ..schemas.bootstrap import BalanceTotals
from ..schemas.common import OkOut

router = APIRouter(prefix="/accounts", tags=["accounts"])

NOT_FOUND = "Account not found."
NAME_REQUIRED = "Enter a name."
NAME_TAKEN = "An account with that name already exists."
IN_USE = "That account is still in use, so it was not deleted. Reassign or delete its entries first."


# --- balances (shared with routers/transfers.py) --------------------------------


def balances_for_month(conn, uid: int, month: str | None):
    """The dashboard's balance block for the selected month: balances through
    today while the current month is selected, else through the end of that
    month; card statements judged on the last day the balances cover.

    Returns (month, balance_rows, summary, balance_as_of_d, through_today)."""
    month_filter = normalize_month(month)
    year_str, month_str = month_filter.split("-", 1)
    month_start = datetime(int(year_str), int(month_str), 1)
    month_end = (month_start + timedelta(days=32)).replace(day=1)
    month_end_d = month_end.strftime("%Y-%m-%d")
    today_d = datetime.now().date()
    through_today = (today_d.year, today_d.month) == (int(year_str), int(month_str))
    if through_today:
        balance_cutoff_d = (today_d + timedelta(days=1)).isoformat()
    else:
        balance_cutoff_d = month_end_d
    account_balances = fetch_account_balances_through(conn, balance_cutoff_d, uid)
    balance_as_of_d = datetime.strptime(balance_cutoff_d, "%Y-%m-%d").date() - timedelta(days=1)
    balance_summary = summarize_account_balances(conn, uid, account_balances, balance_as_of_d)
    return month_filter, account_balances, balance_summary, balance_as_of_d, through_today


def account_list(conn, uid: int, month: str | None) -> AccountListOut:
    month_filter, rows, summary, as_of_d, through_today = balances_for_month(conn, uid, month)
    opening_by_id = {
        int(r["id"]): float(r["opening_balance"])
        for r in conn.execute("SELECT id, opening_balance FROM accounts WHERE user_id = ?", (uid,))
    }
    card_status_by_id = summary["card_status_by_id"]
    items = []
    for row in rows:
        aid = int(row["id"])
        card = is_credit_card(row)
        opening = opening_by_id.get(aid, 0.0)
        status = card_status_by_id.get(aid)
        items.append(
            AccountOut(
                id=aid,
                name=row["name"],
                account_type=row["account_type"] or "bank",
                is_credit_card=card,
                opening_balance=opening,
                opening_balance_input=abs(opening) if card else opening,
                credit_limit=row["credit_limit"],
                statement_day=row["statement_day"],
                due_day=row["due_day"],
                current_balance=float(row["current_balance"]),
                bank=detect_bank(row["name"]),
                card=status,
                can_pay=bool(status and status["owed"] > 0),
            )
        )
    return AccountListOut(
        items=items,
        totals=BalanceTotals(
            cash_total=summary["cash_total"],
            cards_total=summary["cards_total"],
            net_total=summary["net_total"],
        ),
        has_cards=bool(card_status_by_id),
        month=month_filter,
        balance_as_of=as_of_d.isoformat(),
        through_today=through_today,
    )


# --- writes -------------------------------------------------------------------


def _form(body: AccountIn) -> dict:
    """The JSON body as the old form mapping: absent/null -> missing, else text."""
    return {k: str(v) for k, v in body.model_dump().items() if v is not None}


def _account_fields_from_form(form):
    """Name, signed opening balance and card settings from an account form, or
    (None, message) when something is invalid (old routes/accounts.py, unchanged).

    For a credit card the opening balance is entered as the amount owed, so it
    is stored negative like any spending on the card would leave it.
    """
    opening_balance = _parse_opening_balance(form.get("opening_balance"))
    if opening_balance is None:
        return None, "Invalid opening balance."
    account_type = "credit" if form.get("account_type") == "credit" else "bank"
    fields = {
        "name": form.get("name", "").strip(),
        "account_type": account_type,
        "opening_balance": opening_balance,
        "credit_limit": None,
        "statement_day": None,
        "due_day": None,
    }
    if account_type == "bank":
        return fields, None

    fields["opening_balance"] = -abs(opening_balance) or 0.0
    limit_raw = (form.get("credit_limit") or "").strip()
    if limit_raw:
        try:
            fields["credit_limit"] = float(limit_raw)
        except ValueError:
            return None, "Invalid credit limit."
        if fields["credit_limit"] < 0:
            return None, "Invalid credit limit."
    for key, label in (("statement_day", "statement day"), ("due_day", "payment due day")):
        raw = (form.get(key) or "").strip()
        if not raw:
            continue
        try:
            day = int(raw)
        except ValueError:
            return None, f"Invalid {label}."
        if not 1 <= day <= 31:
            return None, f"The {label} must be between 1 and 31."
        fields[key] = day
    if fields["due_day"] and not fields["statement_day"]:
        return None, "Set the statement day too, so the due date can be worked out."
    return fields, None


def _validated(body: AccountIn) -> dict:
    fields, error = _account_fields_from_form(_form(body))
    if error:
        raise ApiError(400, error)
    if not fields["name"]:
        # The old form route silently ignored a blank name.
        raise ApiError(400, NAME_REQUIRED)
    return fields


def _one(conn, uid: int, account_id: int) -> AccountOut:
    for item in account_list(conn, uid, None).items:
        if item.id == account_id:
            return item
    raise ApiError(404, NOT_FOUND)


@router.get("", response_model=AccountListOut)
def list_accounts(user: User, conn: DB, month: str | None = None):
    """month=YYYY-MM (blank/invalid = current month): balances through today
    for the current month, else through the end of the chosen month."""
    return account_list(conn, user.id, month)


@router.post("", response_model=AccountOut)
def add_account(body: AccountIn, user: User, conn: DB):
    fields = _validated(body)
    cur = conn.execute(
        """
        INSERT OR IGNORE INTO accounts
            (user_id, name, opening_balance, account_type, credit_limit, statement_day, due_day)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user.id,
            fields["name"],
            fields["opening_balance"],
            fields["account_type"],
            fields["credit_limit"],
            fields["statement_day"],
            fields["due_day"],
        ),
    )
    conn.commit()
    if cur.rowcount == 0:
        # INSERT OR IGNORE hit UNIQUE(user_id, name): the old route redirected as if it had worked.
        raise ApiError(400, NAME_TAKEN)
    return _one(conn, user.id, int(cur.lastrowid))


@router.put("/{account_id}", response_model=AccountOut)
def edit_account(account_id: int, body: AccountIn, user: User, conn: DB):
    fields = _validated(body)
    try:
        cur = conn.execute(
            """
            UPDATE accounts
            SET name = ?, opening_balance = ?, account_type = ?, credit_limit = ?,
                statement_day = ?, due_day = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                fields["name"],
                fields["opening_balance"],
                fields["account_type"],
                fields["credit_limit"],
                fields["statement_day"],
                fields["due_day"],
                account_id,
                user.id,
            ),
        )
    except sqlite3.IntegrityError:
        # Old app: unhandled IntegrityError (500) when renaming onto an existing name.
        conn.rollback()
        raise ApiError(400, NAME_TAKEN) from None
    if cur.rowcount == 0:
        raise ApiError(404, NOT_FOUND)
    conn.commit()
    return _one(conn, user.id, account_id)


@router.delete("/{account_id}", response_model=OkOut)
def delete_account(account_id: int, user: User, conn: DB):
    try:
        cursor = conn.execute(
            "DELETE FROM accounts WHERE id = ? AND user_id = ?",
            (account_id, user.id),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        # Old app: the foreign keys (expenses, income, transfers, recurring
        # rules) raised past the route and the user got a 500.
        conn.rollback()
        raise ApiError(400, IN_USE) from None
    if cursor.rowcount == 0:
        raise ApiError(404, NOT_FOUND)
    return OkOut()
