"""Budgets, ported from the old routes/budget.py (toggle, defaults, override,
clear-month, restore-month) and the budget panel of routes/dashboard.py::index."""

from __future__ import annotations

import calendar
import re

from fastapi import APIRouter

from vbx.core import budget
from vbx.core.helpers import resolve_month_filter_from_request

from ..deps import DB, User
from ..errors import ApiError
from ..schemas.budget import BudgetDefaultsIn, BudgetMonthIn, BudgetOverrideIn, BudgetPanelOut, BudgetToggleIn
from ..schemas.common import OkOut
from ..services.budget import budget_panel

router = APIRouter(prefix="/budget", tags=["budget"])

_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

INVALID_MONTH = "Invalid month."
BAD_AMOUNTS = "Budget amounts must be numbers of zero or more."


def _strict_month(raw):
    """YYYY-MM with a real month number, or None — unlike normalize_month, a
    bad value is not silently swapped for the current month."""
    text = (raw or "").strip()
    return text if _MONTH_RE.match(text) else None


def _month_label(ym):
    """'2026-09' -> 'September 2026', for messages."""
    year_str, month_str = ym.split("-", 1)
    return f"{calendar.month_name[int(month_str)]} {year_str}"


def _is_one(value) -> bool:
    """The old `request.form.get(name) == "1"` for JSON values: "1", 1 or true."""
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value == 1
    return value == "1"


def _form_text(value) -> str:
    """A JSON value as the old form string ('' for null)."""
    return "" if value is None else str(value)


@router.get("", response_model=BudgetPanelOut)
def get_budget(
    user: User,
    conn: DB,
    month: str | None = None,
    cal_year: str | None = None,
    cal_month: str | None = None,
):
    """The budget panel for ?month=YYYY-MM (or ?cal_year=&cal_month=; anything
    invalid falls back to the current month, like the old dashboard)."""
    month_filter = resolve_month_filter_from_request({"month": month, "cal_year": cal_year, "cal_month": cal_month})
    return budget_panel(conn, user.id, month_filter)


@router.post("/toggle", response_model=OkOut)
def toggle_budget(body: BudgetToggleIn, user: User, conn: DB):
    enabled = _is_one(body.enabled)
    budget.set_enabled(conn, user.id, enabled)
    conn.commit()
    return OkOut(message="Budgeting enabled." if enabled else "Budgeting disabled.")


@router.post("/defaults", response_model=OkOut)
def save_budget_defaults(body: BudgetDefaultsIn, user: User, conn: DB):
    """Every category's default monthly budget in one request. All values are
    parsed before anything is written, so one bad field leaves the saved
    budgets untouched. The fixed flag is only touched for categories whose
    amount was sent. Ids that are not the user's categories are ignored."""
    uid = user.id
    category_ids = [int(row["id"]) for row in conn.execute("SELECT id FROM categories WHERE user_id = ?", (uid,))]
    updates = []
    fixed_updates = []
    for cid in category_ids:
        key = str(cid)
        if key not in body.amounts:
            continue
        try:
            updates.append((cid, budget.parse_amount(body.amounts.get(key))))
        except ValueError:
            raise ApiError(400, BAD_AMOUNTS) from None
        fixed_updates.append((cid, _is_one(body.fixed.get(key))))
    other_amount = None
    other_provided = "other_amount" in body.model_fields_set
    if other_provided:
        try:
            other_amount = budget.parse_amount(body.other_amount)
        except ValueError:
            raise ApiError(400, BAD_AMOUNTS) from None
    for cid, amount in updates:
        budget.set_default(conn, uid, cid, amount)
    for cid, fixed in fixed_updates:
        budget.set_fixed(conn, uid, cid, fixed)
    if other_provided:
        budget.set_other_amount(conn, uid, other_amount)
    conn.commit()
    return OkOut(message="Monthly budgets saved.")


@router.post("/override", response_model=OkOut)
def save_budget_override(body: BudgetOverrideIn, user: User, conn: DB):
    uid = user.id
    ym = _strict_month(body.month)
    if ym is None:
        raise ApiError(400, INVALID_MONTH)
    try:
        category_id = int(_form_text(body.category_id))
        amount = None if _is_one(body.clear) else budget.parse_amount(body.amount)
    except (TypeError, ValueError):
        raise ApiError(400, "Invalid budget amount.") from None

    if not budget.category_owned(conn, uid, category_id):
        raise ApiError(404, "Category not found.")
    cleared = budget.is_month_cleared(conn, uid, ym)
    budget.set_override(conn, uid, category_id, ym, amount)
    conn.commit()
    if amount is not None:
        message = "Budget for this month saved."
    elif cleared:
        # The month has no default to fall back to — dropping the override
        # leaves the category with no budget at all, not "reset".
        message = "Budget for this month removed."
    else:
        message = "Budget for this month reset to the default."
    return OkOut(message=message)


@router.post("/clear-month", response_model=OkOut)
def clear_month(body: BudgetMonthIn, user: User, conn: DB):
    ym = _strict_month(body.month)
    if ym is None:
        raise ApiError(400, INVALID_MONTH)
    budget.clear_month(conn, user.id, ym)
    conn.commit()
    return OkOut(message=f"Cleared the budget for {_month_label(ym)}.")


@router.post("/restore-month", response_model=OkOut)
def restore_month(body: BudgetMonthIn, user: User, conn: DB):
    ym = _strict_month(body.month)
    if ym is None:
        raise ApiError(400, INVALID_MONTH)
    budget.restore_month(conn, user.id, ym)
    conn.commit()
    return OkOut(message=f"Restored the monthly budgets for {_month_label(ym)}.")
