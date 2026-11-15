"""Month end reconciliation (new in the rewrite, no old-app counterpart).

POST /reconciliation/preview works out the plan for the balances the user
typed; POST /reconciliation/apply works it out again from the same input and
records it in one go, so it always matches the data at that moment. See
services/reconciliation.py for how the plan is made."""

from __future__ import annotations

from datetime import date as date_cls
from datetime import timedelta

from fastapi import APIRouter

from vbx.core.banks import detect_bank
from vbx.core.finance import fetch_account_balances_through, is_credit_card
from vbx.core.helpers import coerce_txn_day, normalize_txn_day_from_form

from ..deps import DB, User
from ..errors import ApiError
from ..schemas.reconciliation import (
    ReconcileAccountOut,
    ReconcileAdjustmentOut,
    ReconcileAppliedOut,
    ReconcileIn,
    ReconcilePlanOut,
    ReconcileStartAccount,
    ReconcileStartOut,
    ReconcileTransferOut,
)
from ..services.reconciliation import BALANCING_NOTE, OTHER_CATEGORY, TRANSFER_NOTE, plan_moves, to_cents

router = APIRouter(prefix="/reconciliation", tags=["reconciliation"])

NO_BALANCES = "Enter at least one balance."
INVALID_ACCOUNT = "Invalid account."
INVALID_DATE = "Invalid date."


def _day(raw: str | None) -> str:
    """YYYY-MM-DD from the request (blank = today), or ApiError(400)."""
    raw_day = (raw or "").strip()
    if raw_day and not coerce_txn_day(raw_day):
        raise ApiError(400, INVALID_DATE)
    return normalize_txn_day_from_form(raw_day)


def _balances_on(conn, uid: int, day: str) -> dict:
    """id -> balance row, through the end of `day` (entries dated that day included), by name."""
    cutoff = (date_cls.fromisoformat(day) + timedelta(days=1)).isoformat()
    return {int(r["id"]): r for r in fetch_account_balances_through(conn, cutoff, uid)}


@router.get("", response_model=ReconcileStartOut)
def start(user: User, conn: DB, date: str | None = None):
    """Every account with its recorded balance at the end of `date` (default today)."""
    day = _day(date)
    rows = _balances_on(conn, user.id, day)
    return ReconcileStartOut(
        date=day,
        accounts=[
            ReconcileStartAccount(
                account_id=aid,
                name=r["name"],
                is_credit_card=is_credit_card(r),
                bank=detect_bank(r["name"]),
                system_balance=to_cents(r["current_balance"]) / 100,
            )
            for aid, r in rows.items()
        ],
    )


def _plan(conn, uid: int, body: ReconcileIn):
    """(plan, raw transfers, raw adjustments) for the request."""
    day = _day(body.date)
    if not body.balances:
        raise ApiError(400, NO_BALANCES)
    rows = _balances_on(conn, uid, day)
    order = {aid: i for i, aid in enumerate(rows)}  # by name, as listed

    actual: dict[int, int] = {}
    for b in body.balances:
        if b.account_id not in rows:
            raise ApiError(400, INVALID_ACCOUNT)
        actual[b.account_id] = to_cents(b.actual_balance)

    accounts = []
    diffs: dict[int, int] = {}
    for aid in sorted(actual, key=lambda a: order[a]):
        row = rows[aid]
        system = to_cents(row["current_balance"])
        diffs[aid] = actual[aid] - system
        accounts.append(
            ReconcileAccountOut(
                account_id=aid,
                name=row["name"],
                is_credit_card=is_credit_card(row),
                system_balance=system / 100,
                actual_balance=actual[aid] / 100,
                difference=diffs[aid] / 100,
            )
        )

    transfers, adjustments = plan_moves(diffs, order)
    name = lambda aid: rows[aid]["name"]  # noqa: E731
    plan = ReconcilePlanOut(
        date=day,
        accounts=accounts,
        transfers=[
            ReconcileTransferOut(
                from_account_id=m.from_id,
                from_account_name=name(m.from_id),
                to_account_id=m.to_id,
                to_account_name=name(m.to_id),
                amount=m.cents / 100,
            )
            for m in transfers
        ],
        adjustments=[
            ReconcileAdjustmentOut(
                account_id=m.to_id if m.to_id is not None else m.from_id,
                account_name=name(m.to_id if m.to_id is not None else m.from_id),
                kind="income" if m.to_id is not None else "expense",
                amount=m.cents / 100,
                category_name=OTHER_CATEGORY,
            )
            for m in adjustments
        ],
        notes=BALANCING_NOTE,
        transfer_notes=TRANSFER_NOTE,
    )
    return plan, transfers, adjustments


def _other_category(conn, uid: int, table: str) -> int:
    """The user's "Other" category in `table` (any letter case), created when missing."""
    row = conn.execute(
        f"SELECT id FROM {table} WHERE user_id = ? AND lower(name) = lower(?) ORDER BY id LIMIT 1",
        (uid, OTHER_CATEGORY),
    ).fetchone()
    if row:
        return int(row["id"])
    cur = conn.execute(f"INSERT INTO {table} (user_id, name) VALUES (?, ?)", (uid, OTHER_CATEGORY))
    return int(cur.lastrowid)


@router.post("/preview", response_model=ReconcilePlanOut)
def preview(body: ReconcileIn, user: User, conn: DB):
    plan, _t, _a = _plan(conn, user.id, body)
    return plan


@router.post("/apply", response_model=ReconcileAppliedOut)
def apply(body: ReconcileIn, user: User, conn: DB):
    uid = user.id
    plan, transfers, adjustments = _plan(conn, uid, body)
    day = plan.date
    try:
        for m in transfers:
            conn.execute(
                "INSERT INTO account_transfers "
                "(user_id, from_account_id, to_account_id, amount, transferred_at, notes) VALUES (?, ?, ?, ?, ?, ?)",
                (uid, m.from_id, m.to_id, m.cents / 100, day, TRANSFER_NOTE),
            )
        for m in adjustments:
            if m.to_id is not None:
                cat = _other_category(conn, uid, "income_categories")
                conn.execute(
                    "INSERT INTO income_entries (user_id, notes, amount, category_id, account_id, received_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (uid, BALANCING_NOTE, m.cents / 100, cat, m.to_id, day),
                )
            else:
                cat = _other_category(conn, uid, "categories")
                conn.execute(
                    "INSERT INTO expenses (user_id, notes, amount, category_id, account_id, spent_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (uid, BALANCING_NOTE, -(m.cents / 100), cat, m.from_id, day),
                )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    if transfers or adjustments:
        message = "Balances reconciled."
    else:
        message = "Everything already matches."
    return ReconcileAppliedOut(**plan.model_dump(), message=message)
