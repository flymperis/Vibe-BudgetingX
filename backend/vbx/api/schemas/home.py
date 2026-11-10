"""GET /api/home: the old Home panel for a selected month."""

from __future__ import annotations

from pydantic import BaseModel

from .bootstrap import BankBadge, CardStatus


class MonthTotals(BaseModel):
    total_income: float  # SUM(income) in the month
    total_expenses: float  # -SUM(expenses.amount) in the month (refunds reduce it)
    net: float  # total_income - total_expenses


class BalanceAccount(BaseModel):
    id: int
    name: str
    account_type: str  # bank | credit
    is_credit_card: bool
    current_balance: float  # opening balance + movements before balance_cutoff
    bank: BankBadge | None = None
    card: CardStatus | None = None  # credit cards only, as of balance_as_of


class MonthBalances(BaseModel):
    """Account balances as the selected month shows them (accounts by name)."""

    # "today": the current month is selected, balances run through today.
    # "month_end": another month, balances run through its last day.
    balance_scope: str
    balance_cutoff: str  # exclusive cutoff date, YYYY-MM-DD
    balance_as_of: str  # last day included (balance_cutoff - 1), YYYY-MM-DD
    accounts: list[BalanceAccount]
    cash_total: float
    cards_total: float
    net_total: float  # cash_total + cards_total
    # With a card the old list showed Cash & bank / Credit cards / Net (all
    # accounts); without one a single Total (all accounts) = net_total.
    has_cards: bool


class HomeBudgetCard(BaseModel):
    total_spent: float
    total_budget: float
    total_remaining: float  # negative = over by -total_remaining
    total_pct: float
    total_status: str  # ok | warn | over
    over: list[str]  # names over budget ("Over budget: a, b")


class HomeOut(MonthTotals, MonthBalances):
    month: str  # YYYY-MM in effect
    budget_enabled: bool
    # The budget card: only when budgeting is on and the month has a budgeted
    # row or an "Everything else" amount; None = no card.
    budget_card: HomeBudgetCard | None = None
