"""Expenses. Amounts are signed as stored: negative = spending, positive = refund/credit."""

from __future__ import annotations

from pydantic import BaseModel


class ExpenseIn(BaseModel):
    """Lenient on purpose, like the old form: amount and ids may be numbers or
    strings; an unparsable amount becomes 0, a blank date becomes today."""

    notes: str | None = ""
    amount: float | str | None = "0"
    category_id: int | str | None = None
    account_id: int | str | None = None
    spent_at: str | None = ""


class ExpenseOut(BaseModel):
    id: int
    category_id: int
    account_id: int
    notes: str
    amount: float
    spent_at: str  # YYYY-MM-DD
    created_at: str | None = None
    category_name: str
    account_name: str


class ExpenseListOut(BaseModel):
    items: list[ExpenseOut]
    page: int
    pages: int
    total: int  # number of matching rows
    page_size: int
    month: str | None  # the month filter in effect (YYYY-MM), None = all months
    category_id: int | None  # the category filter in effect, None = all
