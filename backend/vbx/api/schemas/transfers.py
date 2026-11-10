"""Transfers between the user's own accounts."""

from __future__ import annotations

from pydantic import BaseModel


class TransferIn(BaseModel):
    """The old transfer form. The amount is made positive (abs); a blank date is today."""

    from_account_id: int | str | None = None
    to_account_id: int | str | None = None
    amount: float | str | None = ""
    transferred_at: str | None = ""
    notes: str | None = ""


class TransferOut(BaseModel):
    id: int
    from_account_id: int
    to_account_id: int
    amount: float  # always positive
    transferred_at: str  # YYYY-MM-DD
    notes: str
    from_account_name: str
    to_account_name: str


class TransferSavedOut(BaseModel):
    transfer: TransferOut
    message: str  # "Transfer recorded."


class TransferDefaults(BaseModel):
    """What the old transfer form was pre-filled with. With ?pay_card=<card id>
    (the "Pay card" link): the card in To, the first non-card account in From,
    and the unpaid statement (rounded to cents) in amount."""

    from_account_id: int | None
    to_account_id: int | None
    amount: float | None
    transferred_at: str  # today, YYYY-MM-DD


class TransferListOut(BaseModel):
    items: list[TransferOut]  # newest first (by date, then id)
    limit: int  # TRANSFER_LOG_LIMIT: only this many are listed
    defaults: TransferDefaults
