"""Budgets (old routes/budget.py + the budget panel of routes/dashboard.py).

Amounts are spending as positive numbers (spent = -SUM(expenses.amount)),
budgets are >= 0. pct is spent / budget * 100 (100 when the budget is 0 and
something was spent, else 0); status is "ok" | "warn" (>= 80 %) | "over".
"""

from __future__ import annotations

from pydantic import BaseModel


class BudgetLine(BaseModel):
    """One budgeted line of budget.budget_for_month(): a category row, or the
    "Everything else" line (category_id None, default/override None)."""

    category_id: int | None = None
    name: str
    default: float | None = None  # the category's default amount (None on a cleared month)
    override: float | None = None  # this month's own amount, if any
    budget: float  # effective amount for the month
    spent: float
    remaining: float  # budget - spent (negative when over)
    pct: float
    status: str  # ok | warn | over


class UnbudgetedLine(BaseModel):
    category_id: int
    name: str
    spent: float


class BudgetSummary(BaseModel):
    """budget.budget_for_month() for one month (by_category left out: it is
    `rows` keyed by category_id)."""

    ym: str
    cleared: bool  # the month was cleared: defaults and other_amount do not apply
    rows: list[BudgetLine]  # categories with a budget this month, by name
    unbudgeted: list[UnbudgetedLine]  # spending without a budget, by name
    unbudgeted_spent: float
    other: BudgetLine | None  # "Everything else" (other_amount), None when unset or cleared
    total_budget: float
    total_spent: float
    total_remaining: float
    total_pct: float
    total_status: str
    over: list[BudgetLine]  # rows over budget, then "Everything else" if over


class BudgetFormRow(BaseModel):
    """A row of the "Monthly budgets" form. Ordered: active categories first by
    3-month average spending (highest first) then name; inactive ones by name."""

    id: int
    name: str
    default: float | None  # saved default amount, None = no default
    avg: float  # average monthly spending over the 3 months before the month
    active: bool
    fixed: bool


class MonthSnapshot(BaseModel):
    """budget.month_budget_snapshots(): a month with its own amounts, and the
    effective amount of every category that had one ("copy from month")."""

    ym: str
    amounts: dict[str, float]  # category id (as a string) -> amount


class BudgetPanelOut(BaseModel):
    month: str  # YYYY-MM in effect
    enabled: bool
    # Everything below is empty/None while budgeting is disabled (amounts are kept).
    summary: BudgetSummary | None = None
    form_rows: list[BudgetFormRow] = []
    other_amount: float | None = None  # the saved "Everything else" amount (also on a cleared month)
    defaults_total: float = 0.0  # sum of saved defaults + other_amount (the form's live total)
    has_any_default: bool = False  # the old form opened itself when False and other_amount was None
    can_clear_month: bool = False  # "Clear current month": not cleared, or cleared with own amounts
    cleared_total_spent: float | None = None  # on a cleared month: total_spent + unbudgeted spending
    month_snapshots: list[MonthSnapshot] = []


class BudgetToggleIn(BaseModel):
    enabled: bool | int | str | None = None  # true / 1 / "1" enable; anything else disables


class BudgetDefaultsIn(BaseModel):
    """The old form: amount_<id> -> amounts["<id>"], fixed_<id> -> fixed["<id>"],
    other_amount as is. Only categories present in `amounts` are touched; a
    category in `amounts` but not true in `fixed` loses its fixed flag. A
    blank/null amount removes the default. other_amount is only changed when
    the key is sent (null/"" clears it)."""

    amounts: dict[str, float | int | str | None] = {}
    fixed: dict[str, bool | int | str | None] = {}
    other_amount: float | int | str | None = None
    month: str | None = None  # accepted and ignored, like the old hidden field


class BudgetOverrideIn(BaseModel):
    month: str | None = None  # YYYY-MM, strict
    category_id: int | str | None = None
    amount: float | int | str | None = None  # blank/null also drops the override
    clear: bool | int | str | None = None  # true / 1 / "1": drop this month's override


class BudgetMonthIn(BaseModel):
    month: str | None = None  # YYYY-MM, strict
