"""GET /api/bootstrap: reference data every screen needs."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from .auth import UserOut
from .common import IdName


class BankBadge(BaseModel):
    """banks.detect_bank(): recognised from the account name, not stored."""

    slug: str
    name: str
    label: str
    bg: str
    fg: str
    logo: str | None = None


class CardStatement(BaseModel):
    closed_on: date
    amount: float
    paid: float
    remaining: float
    due_on: date | None = None
    state: str  # none | paid | overdue | soon | open


class CardStatus(BaseModel):
    """finance.credit_card_status() as of today."""

    owed: float
    credit: float
    limit: float | None = None
    available: float | None = None
    used_pct: float | None = None
    used_level: str  # ok | warn | over
    statement: CardStatement | None = None


class AccountOut(BaseModel):
    id: int
    name: str
    account_type: str  # bank | credit
    is_credit_card: bool
    opening_balance: float
    credit_limit: float | None = None
    statement_day: int | None = None
    due_day: int | None = None
    current_balance: float  # opening balance plus every movement through today
    bank: BankBadge | None = None
    card: CardStatus | None = None


class BalanceTotals(BaseModel):
    cash_total: float
    cards_total: float
    net_total: float


class BootstrapOut(BaseModel):
    user: UserOut
    today: str  # YYYY-MM-DD, server TZ
    month: str  # YYYY-MM, server TZ
    accounts: list[AccountOut]
    balance_totals: BalanceTotals
    categories: list[IdName]
    income_categories: list[IdName]
    tag_names: list[str]  # every tag, most recently used first
    recent_tags: list[str]  # the few offered as chips (tags.chip_tags)
    budget_enabled: bool
    posted_recurring: int  # recurring entries posted by this request
