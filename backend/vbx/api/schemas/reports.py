"""Reports: overview, spending, tags and investments sections.

Amounts are as the old report showed them: expenses signed as stored
(negative = spending, positive = refund), income positive. Bank and crypto
values are EUR, stock values USD (never summed).
"""

from __future__ import annotations

from pydantic import BaseModel

# --- charts -----------------------------------------------------------------------


class BalancePoint(BaseModel):
    month_num: int
    month_label: str  # "January"
    short: str  # "Jan"
    value: float  # balance / portfolio value at the month's end (today for the running month)
    change: float  # vs the previous month (January: vs the value before the year)


class BalanceChart(BaseModel):
    """Old balance_line_chart_spec: 12 points; y axis from y_min to y_max
    (data range padded as the old chart did), middle tick y_mid."""

    points: list[BalancePoint]
    y_min: float | None
    y_max: float | None
    y_mid: float | None


class CashFlowPoint(BaseModel):
    month: int
    label: str
    short: str
    income: float  # income bar above zero when != 0
    expenses: float  # signed; spending bar below zero when != 0
    net: float
    has_net_point: bool  # the net line skips months without activity


class CashFlowChart(BaseModel):
    """Old cash_flow_chart_spec: has_data False = the empty chart."""

    has_data: bool
    months: list[CashFlowPoint]
    y_min: float | None
    y_max: float | None


# --- overview ---------------------------------------------------------------------


class CashFlowMonth(BaseModel):
    month: int
    label: str
    short: str
    income: float
    expenses: float  # signed, net of refunds
    net: float  # income + expenses
    active: bool  # shown in the month-by-month table


class CashFlow(BaseModel):
    """finance.monthly_cash_flow_for_year."""

    months: list[CashFlowMonth]
    total_income: float
    total_expenses: float
    total_net: float
    savings_rate: float | None  # % of income kept; None without income
    active_month_count: int
    avg_income: float | None  # per active month
    avg_expenses: float | None
    avg_net: float | None
    best_month: CashFlowMonth | None
    worst_month: CashFlowMonth | None


class OverviewOut(BaseModel):
    year: int
    current_year: int  # assets are "today's prices" when year == current_year, else "end of year"
    account_id: int | None  # None = all accounts
    account_label: str  # "All accounts" or the account name
    cash_flow: CashFlow
    cash_flow_chart: CashFlowChart
    bank_baseline: float  # balance before Jan 1 (January's change is against it)
    bank_chart: BalanceChart
    bank_balance: float  # selected account(s) through today
    crypto_value: float  # EUR, end of year or today
    stock_value: float  # USD, end of year or today


# --- spending ---------------------------------------------------------------------


class CategoryRankRow(BaseModel):
    name: str
    total: float  # signed
    prev_total: float | None
    delta: float | None  # total - prev_total; None = nothing to compare ("new this year" when has_previous)
    share: float  # % of the year's outflow


class CategoryRanking(BaseModel):
    """finance.category_spend_ranking: biggest outflow first."""

    rows: list[CategoryRankRow]
    outflow_total: float
    prev_year: int
    has_previous: bool


class PivotRow(BaseModel):
    name: str
    months: list[float]  # 12 values, as stored (signed); the old table left zeros blank
    total: float
    avg: float | None  # over months with a non-zero value


class ExpensePivot(BaseModel):
    """finance.expense_pivot_for_report_year: category x month."""

    rows: list[PivotRow]
    month_headers: list[str]  # "01.Jan" ...
    month_totals: list[float]
    grand_total: float
    active_month_count: int
    avg_monthly_total: float | None


class SpendingOut(BaseModel):
    year: int
    categories: CategoryRanking
    expense_pivot: ExpensePivot


# --- tags -------------------------------------------------------------------------


class TagSummary(BaseModel):
    tag: str  # most recent spelling, without '#'
    key: str  # case/accent-free key; pass it back as ?tag=
    spent: float  # spending net of refunds, positive
    income: float
    net: float
    count: int
    first: str  # YYYY-MM-DD
    last: str


class TagCategory(BaseModel):
    name: str
    total: float  # spent in this category
    share: float  # % of the tag's spending (may be negative for a refund-only category)


class TagRow(BaseModel):
    kind: str  # expense | income
    id: int
    day: str
    amount: float  # signed as stored
    notes: str
    category: str
    account: str | None
    tags: list[str]


class TagDetail(TagSummary):
    categories: list[TagCategory]  # biggest first
    rows: list[TagRow]  # newest first


class TagsOut(BaseModel):
    tags: list[TagSummary]  # most recently used first
    selected_tag: str | None  # the ?tag= asked for (stripped)
    tag: TagDetail | None  # None when nothing carries selected_tag ("Nothing is tagged #x yet.")


# --- investments ------------------------------------------------------------------


class ReportInvestmentsOut(BaseModel):
    year: int
    current_year: int
    crypto_baseline: float  # EUR, end of the previous year
    stock_baseline: float  # USD
    crypto_chart: BalanceChart  # EUR month-end values
    stock_chart: BalanceChart  # USD month-end values
    crypto_value: float  # EUR, end of year or today
    stock_value: float  # USD, end of year or today


class SectionOut(BaseModel):
    section: str  # overview | spending | tags | investments
    sections: list[str]
