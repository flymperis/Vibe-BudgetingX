"""Month end reconciliation: the user's real balances in, a plan of transfers
and "balancing input" entries out."""

from __future__ import annotations

from pydantic import BaseModel

from .bootstrap import BankBadge


class ReconcileStartAccount(BaseModel):
    account_id: int
    name: str
    is_credit_card: bool
    bank: BankBadge | None = None  # as on AccountOut
    system_balance: float  # through the end of `date`


class ReconcileStartOut(BaseModel):
    """GET /reconciliation: every account with its recorded balance on a day."""

    date: str  # YYYY-MM-DD
    accounts: list[ReconcileStartAccount]


class ReconcileBalanceIn(BaseModel):
    account_id: int
    # Signed like the account's balance: a card that owes 300 is -300.
    actual_balance: float


class ReconcileIn(BaseModel):
    """Accounts left out are not touched. A blank date is today."""

    date: str | None = ""
    balances: list[ReconcileBalanceIn]


class ReconcileAccountOut(BaseModel):
    account_id: int
    name: str
    is_credit_card: bool
    system_balance: float  # balance through the end of `date`
    actual_balance: float
    difference: float  # actual - system


class ReconcileTransferOut(BaseModel):
    from_account_id: int
    from_account_name: str
    to_account_id: int
    to_account_name: str
    amount: float  # always positive


class ReconcileAdjustmentOut(BaseModel):
    """What is left after the transfers, booked to the "Other" category."""

    account_id: int
    account_name: str
    kind: str  # "expense" (money missing) or "income" (money found)
    amount: float  # always positive
    category_name: str


class ReconcilePlanOut(BaseModel):
    date: str  # YYYY-MM-DD
    accounts: list[ReconcileAccountOut]
    transfers: list[ReconcileTransferOut]
    adjustments: list[ReconcileAdjustmentOut]
    notes: str  # description written on the adjustments ("balancing input")
    transfer_notes: str


class ReconcileAppliedOut(ReconcilePlanOut):
    message: str
