"""GET /api/home: the old Home panel (routes/dashboard.py::index + _home.html)."""

from __future__ import annotations

from fastapi import APIRouter

from ..deps import DB, User
from ..schemas.home import HomeBudgetCard, HomeOut
from ..services.budget import month_summary
from ..services.home import month_balances, month_totals, month_window, resolve_month

router = APIRouter(tags=["home"])


@router.get("/home", response_model=HomeOut)
def home(
    user: User,
    conn: DB,
    month: str | None = None,
    cal_year: str | None = None,
    cal_month: str | None = None,
):
    """Income / expenses / net for ?month=YYYY-MM (or ?cal_year=&cal_month=;
    invalid = current month), balances as of that month, and the budget card."""
    uid = user.id
    win = month_window(resolve_month(month, cal_year, cal_month))
    totals = month_totals(conn, uid, win)
    balances = month_balances(conn, uid, win)
    budget_enabled, budget_summary = month_summary(conn, uid, win.month_filter)
    card = None
    if budget_enabled and (budget_summary["rows"] or budget_summary["other"]):
        card = HomeBudgetCard(
            total_spent=budget_summary["total_spent"],
            total_budget=budget_summary["total_budget"],
            total_remaining=budget_summary["total_remaining"],
            total_pct=budget_summary["total_pct"],
            total_status=budget_summary["total_status"],
            over=[r["name"] for r in budget_summary["over"]],
        )
    return HomeOut(
        month=win.month_filter,
        **totals.model_dump(),
        **balances.model_dump(),
        budget_enabled=budget_enabled,
        budget_card=card,
    )
