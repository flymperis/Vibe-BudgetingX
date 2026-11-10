"""GET /api/summary: the old "Consolidated" panel for a selected month."""

from __future__ import annotations

from pydantic import BaseModel

from .budget import BudgetSummary
from .home import MonthBalances, MonthTotals


class BreakdownRow(BaseModel):
    category_name: str
    total_amount: float  # positive spending (expenses) or income, for the month


class SummaryOut(MonthTotals, MonthBalances):
    """The "Net Balance" card showed net_total (sum of the per-account balances),
    the Balances column every account's current_balance."""

    month: str
    income_breakdown: list[BreakdownRow]  # by amount, largest first
    # Expenses column without budgeting: by amount, largest first.
    expense_breakdown: list[BreakdownRow]
    budget_enabled: bool
    # Expenses column with budgeting on: budget.rows, then budget.unbudgeted
    # (no budget/left), then budget.other. None while budgeting is off.
    budget: BudgetSummary | None = None
