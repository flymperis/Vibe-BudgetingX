"""Income entries, ported from the old routes/income.py (writes) and the
income list of routes/dashboard.py (filters, pagination)."""

from __future__ import annotations

from fastapi import APIRouter

from vbx.core.config import LIST_PAGE_SIZE
from vbx.core.helpers import (
    _user_owns_account,
    _user_owns_category,
    coerce_txn_day,
    month_bounds_dates,
    normalize_income_amount,
    normalize_list_page,
    normalize_optional_category_id,
    normalize_txn_day_from_form,
    parse_optional_month,
)

from ..deps import DB, User
from ..errors import ApiError
from ..schemas.common import OkOut
from ..schemas.income import IncomeIn, IncomeListOut, IncomeOut

router = APIRouter(prefix="/income", tags=["income"])

NOT_FOUND = "Income entry not found."

_SELECT = """
    SELECT
        i.id,
        i.category_id,
        i.account_id,
        i.notes,
        i.amount,
        i.received_at,
        i.created_at,
        c.name AS category_name,
        a.name AS account_name
    FROM income_entries i
    JOIN income_categories c ON c.id = i.category_id
    JOIN accounts a ON a.id = i.account_id
"""


def _out(row) -> IncomeOut:
    data = dict(row)
    data["received_at"] = coerce_txn_day(data["received_at"])
    data["created_at"] = None if data["created_at"] is None else str(data["created_at"])
    return IncomeOut(**data)


def _get(conn, income_id: int, user_id: int) -> IncomeOut:
    row = conn.execute(f"{_SELECT} WHERE i.id = ? AND i.user_id = ?", (income_id, user_id)).fetchone()
    if row is None:
        raise ApiError(404, NOT_FOUND)
    return _out(row)


def _text(value, default: str = "") -> str:
    return (default if value is None else str(value)).strip()


def _validated_fields(conn, body: IncomeIn, user_id: int) -> tuple:
    """(notes, amount, category_id, account_id, received_at) exactly as the old
    add/edit routes computed them, or ApiError(400)."""
    notes = _text(body.notes)
    amount = _text(body.amount, "0")
    account_raw = _text(body.account_id)
    category_raw = _text(body.category_id)
    received_at_raw = _text(body.received_at)
    if not (category_raw and account_raw):
        # The old form route silently ignored this case (redirect, nothing saved).
        raise ApiError(400, "Choose a category and an account.")
    try:
        category_id = int(category_raw)
        account_id = int(account_raw)
    except (TypeError, ValueError):
        raise ApiError(400, "Invalid category or account.") from None
    received_at = normalize_txn_day_from_form(received_at_raw)
    if not _user_owns_category(conn, category_id, user_id, expense=False) or not _user_owns_account(
        conn, account_id, user_id
    ):
        raise ApiError(400, "Invalid category or account.")
    return notes, normalize_income_amount(amount), category_id, account_id, received_at


@router.get("", response_model=IncomeListOut)
def list_income(
    user: User,
    conn: DB,
    month: str | None = None,
    category_id: str | None = None,
    page: str | None = None,
):
    """month=YYYY-MM (invalid or blank = all months), category_id (not owned or
    invalid = all categories), page (1-based, clamped to the last page).
    LIST_PAGE_SIZE rows per page, newest first."""
    uid = user.id
    income_filter_month = parse_optional_month(month)
    income_where = "WHERE i.user_id = ?"
    income_where_params: list = [uid]
    if income_filter_month:
        ib = month_bounds_dates(income_filter_month)
        income_where += " AND date(i.received_at) >= date(?) AND date(i.received_at) < date(?)"
        income_where_params.extend([ib[0], ib[1]])
    income_filter_category_id = normalize_optional_category_id(category_id)
    if income_filter_category_id is not None:
        if not conn.execute(
            "SELECT 1 FROM income_categories WHERE id = ? AND user_id = ?",
            (income_filter_category_id, uid),
        ).fetchone():
            income_filter_category_id = None
        else:
            income_where += " AND i.category_id = ?"
            income_where_params.append(income_filter_category_id)

    income_total = conn.execute(
        f"SELECT COUNT(*) AS n FROM income_entries i {income_where}",
        income_where_params,
    ).fetchone()["n"]
    income_num_pages = max(1, (income_total + LIST_PAGE_SIZE - 1) // LIST_PAGE_SIZE)
    income_page = min(normalize_list_page(page), income_num_pages)
    income_offset = (income_page - 1) * LIST_PAGE_SIZE
    rows = conn.execute(
        f"""
        {_SELECT}
        {income_where}
        ORDER BY i.received_at DESC
        LIMIT ? OFFSET ?
        """,
        (*income_where_params, LIST_PAGE_SIZE, income_offset),
    ).fetchall()
    return IncomeListOut(
        items=[_out(r) for r in rows],
        page=income_page,
        pages=income_num_pages,
        total=income_total,
        page_size=LIST_PAGE_SIZE,
        month=income_filter_month,
        category_id=income_filter_category_id,
    )


@router.post("", response_model=IncomeOut)
def add_income(body: IncomeIn, user: User, conn: DB):
    notes, amount, category_id, account_id, received_at = _validated_fields(conn, body, user.id)
    cur = conn.execute(
        """
        INSERT INTO income_entries (user_id, notes, amount, category_id, account_id, received_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (user.id, notes, amount, category_id, account_id, received_at),
    )
    conn.commit()
    return _get(conn, int(cur.lastrowid), user.id)


@router.put("/{income_id}", response_model=IncomeOut)
def edit_income(income_id: int, body: IncomeIn, user: User, conn: DB):
    notes, amount, category_id, account_id, received_at = _validated_fields(conn, body, user.id)
    cur = conn.execute(
        """
        UPDATE income_entries
        SET notes = ?, amount = ?, category_id = ?, account_id = ?, received_at = ?
        WHERE id = ? AND user_id = ?
        """,
        (notes, amount, category_id, account_id, received_at, income_id, user.id),
    )
    if cur.rowcount == 0:
        raise ApiError(404, NOT_FOUND)
    conn.commit()
    return _get(conn, income_id, user.id)


@router.delete("/{income_id}", response_model=OkOut)
def delete_income(income_id: int, user: User, conn: DB):
    cur = conn.execute(
        "DELETE FROM income_entries WHERE id = ? AND user_id = ?",
        (income_id, user.id),
    )
    if cur.rowcount == 0:
        raise ApiError(404, NOT_FOUND)
    conn.commit()
    return OkOut()
