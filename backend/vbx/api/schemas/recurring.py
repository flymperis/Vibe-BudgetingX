"""Recurring rules: post an expense or income entry every N weeks/months/years."""

from __future__ import annotations

from pydantic import BaseModel


class RecurringIn(BaseModel):
    """The old rule form, field for field. Values may be numbers or strings.

    - category_choice: "e-<expense category id>" or "i-<income category id>".
    - amount: made positive (abs); must end up > 0.
    - indefinitely: true / "1" runs forever; otherwise months_to_run (how many
      times, > 0) is required.
    - interval_unit week|month|year (default month), interval_count 1..99 (default 1).
    - start_date (YYYY-MM-DD): the first entry; a past date catches up. Leave the
      key out (or null) for the pre-interval behaviour: day_of_month in the
      current month, never back-dated before today (on edit: keep the stored
      first date and take day_of_month, default the stored day).
    - enabled (edit only): true / "1" keeps the rule active. Like the old
      checkbox, leaving it out pauses the rule.
    """

    category_choice: str | None = None
    amount: float | str | None = ""
    account_id: int | str | None = None
    indefinitely: bool | int | str | None = None
    months_to_run: int | str | None = None
    interval_unit: str | None = None
    interval_count: int | str | None = None
    start_date: str | None = None
    day_of_month: int | str | None = None
    notes: str | None = ""
    enabled: bool | int | str | None = None


class RecurringOut(BaseModel):
    id: int
    entry_type: str  # expense | income
    category_choice: str  # "e-<id>" / "i-<id>", the value the old category select used
    amount: float  # positive; posted negative for an expense
    category_id: int
    account_id: int
    day_of_month: int
    months_to_run: int | None  # how many times in total; None = indefinitely
    interval_unit: str  # week | month | year
    interval_count: int
    start_date: str | None  # YYYY-MM-DD, the first entry
    notes: str
    enabled: bool
    created_at: str | None = None
    account_name: str
    category_name: str | None  # None if the category no longer exists


class RecurringListOut(BaseModel):
    items: list[RecurringOut]  # ordered by day_of_month, then id (old panel order)


class RecurringSavedOut(BaseModel):
    rule: RecurringOut
    message: str  # "Recurring rule added." / "Recurring rule updated."
