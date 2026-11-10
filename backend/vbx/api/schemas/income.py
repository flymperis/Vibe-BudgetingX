"""Income entries. Amounts are stored positive (normalize_income_amount)."""

from __future__ import annotations

from pydantic import BaseModel


class IncomeIn(BaseModel):
    """Lenient on purpose, like the old form: amount and ids may be numbers or
    strings; an unparsable amount becomes 0, a negative one is made positive,
    a blank date becomes today."""

    notes: str | None = ""
    amount: float | str | None = "0"
    category_id: int | str | None = None
    account_id: int | str | None = None
    received_at: str | None = ""


class IncomeOut(BaseModel):
    id: int
    category_id: int
    account_id: int
    notes: str
    amount: float
    received_at: str  # YYYY-MM-DD
    created_at: str | None = None
    category_name: str
    account_name: str


class IncomeListOut(BaseModel):
    items: list[IncomeOut]
    page: int
    pages: int
    total: int  # number of matching rows
    page_size: int
    month: str | None  # the month filter in effect (YYYY-MM), None = all months
    category_id: int | None  # the income category filter in effect, None = all
