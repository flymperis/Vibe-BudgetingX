"""GET /api/yearly: the old "Yearly overview" panel (routes/dashboard.py::index
+ _yearly.html)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter

from vbx.core.finance import monthly_total_balances_for_year
from vbx.core.helpers import normalize_year

from ..deps import DB, User
from ..schemas.yearly import YearlyOut, YearlyRow

router = APIRouter(tags=["yearly"])


@router.get("/yearly", response_model=YearlyOut)
def yearly(user: User, conn: DB, year: str | None = None):
    """Income, expenses, delta and total balance per month of ?year=YYYY
    (2000..2100; anything else = current year)."""
    uid = user.id
    year_filter = normalize_year(year)
    year_start_d = f"{year_filter:04d}-01-01"
    year_end_d = f"{year_filter + 1:04d}-01-01"
    expense_by_month = {
        row["m"]: float(row["total"])
        for row in conn.execute(
            """
            SELECT CAST(strftime('%m', spent_at) AS INTEGER) AS m,
                   COALESCE(-SUM(amount), 0) AS total
            FROM expenses
            WHERE user_id = ? AND date(spent_at) >= date(?) AND date(spent_at) < date(?)
            GROUP BY m
            """,
            (uid, year_start_d, year_end_d),
        )
    }
    income_by_month = {
        row["m"]: float(row["total"])
        for row in conn.execute(
            """
            SELECT CAST(strftime('%m', received_at) AS INTEGER) AS m,
                   COALESCE(SUM(amount), 0) AS total
            FROM income_entries
            WHERE user_id = ? AND date(received_at) >= date(?) AND date(received_at) < date(?)
            GROUP BY m
            """,
            (uid, year_start_d, year_end_d),
        )
    }

    today_d = datetime.now().date()
    yearly_month_balances = monthly_total_balances_for_year(conn, year_filter, today_d, uid)
    yearly_rows = []
    yearly_total_income = 0.0
    yearly_total_expenses = 0.0
    for month_num in range(1, 13):
        inc = income_by_month.get(month_num, 0.0)
        exp = expense_by_month.get(month_num, 0.0)
        delta = inc - exp
        yearly_total_income += inc
        yearly_total_expenses += exp
        yearly_rows.append(
            YearlyRow(
                month=month_num,
                income=inc,
                expenses=exp,
                delta=delta,
                total_balance=yearly_month_balances[month_num - 1],
            )
        )
    yearly_total_delta = yearly_total_income - yearly_total_expenses
    return YearlyOut(
        year=year_filter,
        rows=yearly_rows,
        total_income=yearly_total_income,
        total_expenses=yearly_total_expenses,
        total_delta=yearly_total_delta,
    )
