"""Accounts (banks/cash and credit cards) with balances and card status."""

from __future__ import annotations

from pydantic import BaseModel

from .bootstrap import BalanceTotals, BankBadge, CardStatus


class AccountIn(BaseModel):
    """The old account form. opening_balance for a credit card is what is owed
    on it (stored negative). Card fields are ignored for a bank account."""

    name: str | None = ""
    account_type: str | None = "bank"  # "credit" makes a card; anything else is a bank account
    opening_balance: float | str | None = "0"
    credit_limit: float | str | None = None
    statement_day: int | str | None = None
    due_day: int | str | None = None


class AccountOut(BaseModel):
    id: int
    name: str
    account_type: str  # bank | credit
    is_credit_card: bool
    opening_balance: float  # as stored (negative = owed on a card)
    opening_balance_input: float  # what the edit form shows: owed (positive) for a card, signed for a bank
    credit_limit: float | None = None
    statement_day: int | None = None
    due_day: int | None = None
    current_balance: float  # opening balance plus every movement before the cutoff (see AccountListOut)
    bank: BankBadge | None = None
    card: CardStatus | None = None  # credit cards only, judged as of balance_as_of
    can_pay: bool  # card with something owed: the old "Pay card" link (GET /api/transfers?pay_card=id)


class AccountListOut(BaseModel):
    items: list[AccountOut]  # ordered by name
    totals: BalanceTotals
    has_cards: bool  # old panel: show Cash & bank / Credit cards subtotals, else just a total
    month: str  # YYYY-MM the balances are for
    balance_as_of: str  # YYYY-MM-DD: last day included (today for the current month, else month end)
    through_today: bool  # True when the selected month is the current one
