"""Transfers between accounts, ported from the old routes/accounts.py
(add_transfer, delete_transfer) and the Transfer panel of
routes/dashboard.py::index (the log of the last TRANSFER_LOG_LIMIT transfers,
the form defaults and the "Pay card" pre-fill). Account balances for the panel
come from GET /api/accounts."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter

from vbx.core.config import TRANSFER_LOG_LIMIT
from vbx.core.finance import is_credit_card
from vbx.core.helpers import coerce_txn_day, normalize_txn_day_from_form

from ..deps import DB, User
from ..errors import ApiError
from ..schemas.common import OkOut
from ..schemas.transfers import TransferDefaults, TransferIn, TransferListOut, TransferOut, TransferSavedOut
from .accounts import balances_for_month

router = APIRouter(prefix="/transfers", tags=["transfers"])

NOT_FOUND = "Transfer not found."

_SELECT = """
    SELECT
        t.id,
        t.from_account_id,
        t.to_account_id,
        t.amount,
        t.transferred_at,
        t.notes,
        fa.name AS from_account_name,
        ta.name AS to_account_name
    FROM account_transfers t
    JOIN accounts fa ON fa.id = t.from_account_id
    JOIN accounts ta ON ta.id = t.to_account_id
"""


def _out(row) -> TransferOut:
    data = dict(row)
    data["transferred_at"] = coerce_txn_day(data["transferred_at"])
    return TransferOut(**data)


def _int_or_none(raw: str | None) -> int | None:
    """Flask's request.args.get(..., type=int): None when absent or not an int."""
    try:
        return int(raw) if raw is not None else None
    except ValueError:
        return None


@router.get("", response_model=TransferListOut)
def list_transfers(user: User, conn: DB, pay_card: str | None = None, month: str | None = None):
    """The last TRANSFER_LOG_LIMIT transfers and the form defaults. pay_card=<id>
    pre-fills paying that card; month (YYYY-MM, default current) is the month
    whose card statement is used, as on the old panel."""
    uid = user.id
    account_transfers = conn.execute(
        f"""
        {_SELECT}
        WHERE t.user_id = ?
        ORDER BY date(t.transferred_at) DESC, t.id DESC
        LIMIT ?
        """,
        (uid, TRANSFER_LOG_LIMIT),
    ).fetchall()
    accounts = conn.execute(
        "SELECT id, name, opening_balance, account_type, credit_limit, statement_day, due_day "
        "FROM accounts WHERE user_id = ? ORDER BY name",
        (uid,),
    ).fetchall()
    _month, _rows, balance_summary, _as_of, _today = balances_for_month(conn, uid, month)
    card_status_by_id = balance_summary["card_status_by_id"]

    transfer_from_id = int(accounts[0]["id"]) if accounts else None
    transfer_to_id = int(accounts[1]["id"]) if len(accounts) > 1 else transfer_from_id
    transfer_amount_default = None
    pay_card_id = _int_or_none(pay_card)
    if pay_card_id in card_status_by_id and len(accounts) > 1:
        others = [a for a in accounts if int(a["id"]) != pay_card_id]
        funding = [a for a in others if not is_credit_card(a)] or others
        transfer_from_id = int(funding[0]["id"])
        transfer_to_id = pay_card_id
        statement = card_status_by_id[pay_card_id]["statement"]
        if statement and statement["remaining"] > 0:
            # Old: the form value f"{remaining:.2f}".
            transfer_amount_default = round(statement["remaining"], 2)

    return TransferListOut(
        items=[_out(r) for r in account_transfers],
        limit=TRANSFER_LOG_LIMIT,
        defaults=TransferDefaults(
            from_account_id=transfer_from_id,
            to_account_id=transfer_to_id,
            amount=transfer_amount_default,
            transferred_at=datetime.now().date().isoformat(),
        ),
    )


def _text(value) -> str:
    return ("" if value is None else str(value)).strip()


@router.post("", response_model=TransferSavedOut)
def add_transfer(body: TransferIn, user: User, conn: DB):
    from_raw = _text(body.from_account_id)
    to_raw = _text(body.to_account_id)
    amount_raw = _text(body.amount)
    notes = _text(body.notes)
    transferred_at = normalize_txn_day_from_form(_text(body.transferred_at))

    if not from_raw or not to_raw:
        # The old form route silently ignored this case (redirect, nothing saved).
        raise ApiError(400, "Choose the two accounts.")

    try:
        from_id = int(from_raw)
        to_id = int(to_raw)
    except ValueError:
        raise ApiError(400, "Invalid accounts.") from None

    if from_id == to_id:
        raise ApiError(400, "Choose two different accounts.")

    try:
        amt = abs(float(amount_raw))
    except (TypeError, ValueError):
        amt = 0.0

    if amt <= 0:
        raise ApiError(400, "Enter a positive amount.")

    uid = user.id
    if (
        not conn.execute(
            "SELECT 1 FROM accounts WHERE id = ? AND user_id = ?",
            (from_id, uid),
        ).fetchone()
        or not conn.execute(
            "SELECT 1 FROM accounts WHERE id = ? AND user_id = ?",
            (to_id, uid),
        ).fetchone()
    ):
        raise ApiError(400, "Invalid accounts.")

    cur = conn.execute(
        """
        INSERT INTO account_transfers (user_id, from_account_id, to_account_id, amount, transferred_at, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (uid, from_id, to_id, amt, transferred_at, notes),
    )
    conn.commit()
    row = conn.execute(f"{_SELECT} WHERE t.id = ?", (int(cur.lastrowid),)).fetchone()
    return TransferSavedOut(transfer=_out(row), message="Transfer recorded.")


@router.delete("/{transfer_id}", response_model=OkOut)
def delete_transfer(transfer_id: int, user: User, conn: DB):
    cursor = conn.execute(
        "DELETE FROM account_transfers WHERE id = ? AND user_id = ?",
        (transfer_id, user.id),
    )
    conn.commit()
    if cursor.rowcount == 0:
        raise ApiError(404, NOT_FOUND)
    return OkOut()
