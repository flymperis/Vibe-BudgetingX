"""Expenses, ported from the old routes/expenses.py (writes) and the expenses
list of routes/dashboard.py (filters, pagination)."""

from __future__ import annotations

from fastapi import APIRouter

from vbx.core.config import LIST_PAGE_SIZE
from vbx.core.helpers import (
    _user_owns_account,
    _user_owns_category,
    coerce_txn_day,
    month_bounds_dates,
    normalize_expense_amount,
    normalize_list_page,
    normalize_optional_category_id,
    normalize_txn_day_from_form,
    parse_optional_month,
)

from ..deps import DB, User
from ..errors import ApiError
from ..schemas.common import OkOut
from ..schemas.expenses import ExpenseIn, ExpenseListOut, ExpenseOut

router = APIRouter(prefix="/expenses", tags=["expenses"])

_SELECT = """
    SELECT
        e.id,
        e.category_id,
        e.account_id,
        e.notes,
        e.amount,
        e.spent_at,
        e.created_at,
        c.name AS category_name,
        a.name AS account_name
    FROM expenses e
    JOIN categories c ON c.id = e.category_id
    JOIN accounts a ON a.id = e.account_id
"""


def _out(row) -> ExpenseOut:
    data = dict(row)
    data["spent_at"] = coerce_txn_day(data["spent_at"])
    data["created_at"] = None if data["created_at"] is None else str(data["created_at"])
    return ExpenseOut(**data)


def _get(conn, expense_id: int, user_id: int) -> ExpenseOut:
    row = conn.execute(f"{_SELECT} WHERE e.id = ? AND e.user_id = ?", (expense_id, user_id)).fetchone()
    if row is None:
        raise ApiError(404, "Expense not found.")
    return _out(row)


def _text(value, default: str = "") -> str:
    return (default if value is None else str(value)).strip()


def _validated_fields(conn, body: ExpenseIn, user_id: int) -> tuple:
    """(notes, amount, category_id, account_id, spent_at) exactly as the old
    add/edit routes computed them, or ApiError(400)."""
    notes = _text(body.notes)
    amount = _text(body.amount, "0")
    category_raw = _text(body.category_id)
    account_raw = _text(body.account_id)
    spent_at_raw = _text(body.spent_at)
    if not (category_raw and account_raw):
        # The old form route silently ignored this case (redirect, nothing saved).
        raise ApiError(400, "Choose a category and an account.")
    try:
        category_id = int(category_raw)
        account_id = int(account_raw)
    except (TypeError, ValueError):
        raise ApiError(400, "Invalid category or account.") from None
    spent_at = normalize_txn_day_from_form(spent_at_raw)
    if not _user_owns_category(conn, category_id, user_id, expense=True) or not _user_owns_account(
        conn, account_id, user_id
    ):
        raise ApiError(400, "Invalid category or account.")
    return notes, normalize_expense_amount(amount), category_id, account_id, spent_at


@router.get("", response_model=ExpenseListOut)
def list_expenses(
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
    expense_filter_month = parse_optional_month(month)
    expense_where = "WHERE e.user_id = ?"
    expense_where_params: list = [uid]
    if expense_filter_month:
        eb = month_bounds_dates(expense_filter_month)
        expense_where += " AND date(e.spent_at) >= date(?) AND date(e.spent_at) < date(?)"
        expense_where_params.extend([eb[0], eb[1]])
    expense_filter_category_id = normalize_optional_category_id(category_id)
    if expense_filter_category_id is not None:
        if not conn.execute(
            "SELECT 1 FROM categories WHERE id = ? AND user_id = ?",
            (expense_filter_category_id, uid),
        ).fetchone():
            expense_filter_category_id = None
        else:
            expense_where += " AND e.category_id = ?"
            expense_where_params.append(expense_filter_category_id)

    expense_total = conn.execute(
        f"SELECT COUNT(*) AS n FROM expenses e {expense_where}",
        expense_where_params,
    ).fetchone()["n"]
    expense_num_pages = max(1, (expense_total + LIST_PAGE_SIZE - 1) // LIST_PAGE_SIZE)
    expense_page = min(normalize_list_page(page), expense_num_pages)
    expense_offset = (expense_page - 1) * LIST_PAGE_SIZE
    rows = conn.execute(
        f"""
        {_SELECT}
        {expense_where}
        ORDER BY e.spent_at DESC
        LIMIT ? OFFSET ?
        """,
        (*expense_where_params, LIST_PAGE_SIZE, expense_offset),
    ).fetchall()
    return ExpenseListOut(
        items=[_out(r) for r in rows],
        page=expense_page,
        pages=expense_num_pages,
        total=expense_total,
        page_size=LIST_PAGE_SIZE,
        month=expense_filter_month,
        category_id=expense_filter_category_id,
    )


@router.post("", response_model=ExpenseOut)
def add_expense(body: ExpenseIn, user: User, conn: DB):
    notes, amount, category_id, account_id, spent_at = _validated_fields(conn, body, user.id)
    cur = conn.execute(
        """
        INSERT INTO expenses (user_id, notes, amount, category_id, account_id, spent_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (user.id, notes, amount, category_id, account_id, spent_at),
    )
    conn.commit()
    return _get(conn, int(cur.lastrowid), user.id)


@router.put("/{expense_id}", response_model=ExpenseOut)
def edit_expense(expense_id: int, body: ExpenseIn, user: User, conn: DB):
    notes, amount, category_id, account_id, spent_at = _validated_fields(conn, body, user.id)
    cur = conn.execute(
        """
        UPDATE expenses
        SET notes = ?, amount = ?, category_id = ?, account_id = ?, spent_at = ?
        WHERE id = ? AND user_id = ?
        """,
        (notes, amount, category_id, account_id, spent_at, expense_id, user.id),
    )
    if cur.rowcount == 0:
        raise ApiError(404, "Expense not found.")
    conn.commit()
    return _get(conn, expense_id, user.id)


@router.delete("/{expense_id}", response_model=OkOut)
def delete_expense(expense_id: int, user: User, conn: DB):
    cur = conn.execute(
        "DELETE FROM expenses WHERE id = ? AND user_id = ?",
        (expense_id, user.id),
    )
    if cur.rowcount == 0:
        raise ApiError(404, "Expense not found.")
    conn.commit()
    return OkOut()
