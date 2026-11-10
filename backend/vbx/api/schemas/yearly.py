"""GET /api/yearly: the old "Yearly overview" table."""

from __future__ import annotations

from pydantic import BaseModel


class YearlyRow(BaseModel):
    month: int  # 1..12 (the old table showed the English month name)
    income: float
    expenses: float  # -SUM(expenses.amount) in the month
    delta: float  # income - expenses
    # All accounts' balance after the month (finance.monthly_total_balances_for_year):
    # through month end, through today for the current month, and capped at
    # today for months that have not ended yet.
    total_balance: float


class YearlyOut(BaseModel):
    year: int  # year in effect (invalid/missing = current year)
    rows: list[YearlyRow]  # always 12, January first
    total_income: float
    total_expenses: float
    total_delta: float  # total_income - total_expenses (no balance total: the old row showed a dash)
