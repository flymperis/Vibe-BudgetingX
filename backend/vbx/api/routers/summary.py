"""GET /api/summary: the old "Consolidated" panel (routes/dashboard.py::index
+ _summary.html)."""

from __future__ import annotations

from fastapi import APIRouter

from ..deps import DB, User
from ..schemas.summary import BreakdownRow, SummaryOut
from ..services.budget import month_summary, summary_out
from ..services.home import month_balances, month_totals, month_window, resolve_month

router = APIRouter(tags=["summary"])


@router.get("/summary", response_model=SummaryOut)
def summary(
    user: User,
    conn: DB,
    month: str | None = None,
    cal_year: str | None = None,
    cal_month: str | None = None,
):
    """Month totals, income/expense breakdowns per category, the budget table
    when budgeting is on, and account balances as of ?month=YYYY-MM."""
    uid = user.id
    win = month_window(resolve_month(month, cal_year, cal_month))
    totals = month_totals(conn, uid, win)
    expense_breakdown = conn.execute(
        """
        SELECT c.name AS category_name, COALESCE(-SUM(e.amount), 0) AS total_amount
        FROM expenses e
        JOIN categories c ON c.id = e.category_id
        WHERE e.user_id = ? AND date(e.spent_at) >= date(?) AND date(e.spent_at) < date(?)
        GROUP BY c.name
        ORDER BY total_amount DESC
        """,
        (uid, win.month_start_d, win.month_end_d),
    ).fetchall()
    income_breakdown = conn.execute(
        """
        SELECT c.name AS category_name, SUM(i.amount) AS total_amount
        FROM income_entries i
        JOIN income_categories c ON c.id = i.category_id
        WHERE i.user_id = ? AND date(i.received_at) >= date(?) AND date(i.received_at) < date(?)
        GROUP BY c.name
        ORDER BY total_amount DESC
        """,
        (uid, win.month_start_d, win.month_end_d),
    ).fetchall()
    balances = month_balances(conn, uid, win)
    budget_enabled, budget_summary = month_summary(conn, uid, win.month_filter)
    return SummaryOut(
        month=win.month_filter,
        **totals.model_dump(),
        **balances.model_dump(),
        income_breakdown=[BreakdownRow(**dict(r)) for r in income_breakdown],
        expense_breakdown=[BreakdownRow(**dict(r)) for r in expense_breakdown],
        budget_enabled=budget_enabled,
        budget=None if budget_summary is None else summary_out(budget_summary),
    )
