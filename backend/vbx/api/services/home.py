"""Month figures and "balances as of the selected month" from the old
routes/dashboard.py::index, shared by the home and summary routers."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta

from vbx.core.banks import detect_bank
from vbx.core.finance import fetch_account_balances_through, is_credit_card, summarize_account_balances
from vbx.core.helpers import resolve_month_filter_from_request

from ..schemas.home import BalanceAccount, MonthBalances, MonthTotals

# balance_scope values. The old hints, for reference:
#   SCOPE_TODAY: "Account balances use opening balance plus movements through
#     today (only while this month is selected)."
#   SCOPE_MONTH_END: "Account balances are through the end of <Month YYYY>
#     (opening balance plus movements up to then)."
SCOPE_TODAY = "today"
SCOPE_MONTH_END = "month_end"


def resolve_month(month: str | None, cal_year: str | None, cal_month: str | None) -> str:
    """The old resolve_month_filter_from_request on the query parameters."""
    return resolve_month_filter_from_request({"month": month, "cal_year": cal_year, "cal_month": cal_month})


@dataclass(frozen=True)
class MonthWindow:
    month_filter: str
    month_start_d: str  # YYYY-MM-DD, inclusive
    month_end_d: str  # YYYY-MM-DD, exclusive


def month_window(month_filter: str) -> MonthWindow:
    """The old index's month_start_d / month_end_d."""
    year_str, month_str = month_filter.split("-", 1)
    month_start = datetime(int(year_str), int(month_str), 1)
    month_end = month_start + timedelta(days=32)
    month_end = month_end.replace(day=1)
    return MonthWindow(month_filter, month_start.strftime("%Y-%m-%d"), month_end.strftime("%Y-%m-%d"))


def month_totals(conn: sqlite3.Connection, uid: int, win: MonthWindow) -> MonthTotals:
    total_expenses = conn.execute(
        """
        SELECT COALESCE(-SUM(amount), 0) AS total
        FROM expenses
        WHERE user_id = ? AND date(spent_at) >= date(?) AND date(spent_at) < date(?)
        """,
        (uid, win.month_start_d, win.month_end_d),
    ).fetchone()["total"]
    total_income = conn.execute(
        """
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM income_entries
        WHERE user_id = ? AND date(received_at) >= date(?) AND date(received_at) < date(?)
        """,
        (uid, win.month_start_d, win.month_end_d),
    ).fetchone()["total"]
    return MonthTotals(
        total_income=total_income,
        total_expenses=total_expenses,
        net=total_income - total_expenses,
    )


def month_balances(conn: sqlite3.Connection, uid: int, win: MonthWindow) -> MonthBalances:
    """Account balances for the selected month: through today while the
    current month is selected, else through the end of the selected month.
    Card statements are judged on the last day the balances cover."""
    year_str, month_str = win.month_filter.split("-", 1)
    today_d = datetime.now().date()
    sel_y, sel_m = int(year_str), int(month_str)
    if (today_d.year, today_d.month) == (sel_y, sel_m):
        balance_cutoff_d = (today_d + timedelta(days=1)).isoformat()
        scope = SCOPE_TODAY
    else:
        balance_cutoff_d = win.month_end_d
        scope = SCOPE_MONTH_END

    account_balances = fetch_account_balances_through(conn, balance_cutoff_d, uid)
    balance_as_of_d = datetime.strptime(balance_cutoff_d, "%Y-%m-%d").date() - timedelta(days=1)
    balance_summary = summarize_account_balances(conn, uid, account_balances, balance_as_of_d)
    card_status_by_id = balance_summary["card_status_by_id"]
    return MonthBalances(
        balance_scope=scope,
        balance_cutoff=balance_cutoff_d,
        balance_as_of=balance_as_of_d.isoformat(),
        accounts=[
            BalanceAccount(
                id=int(row["id"]),
                name=row["name"],
                account_type=row["account_type"] or "bank",
                is_credit_card=is_credit_card(row),
                current_balance=float(row["current_balance"]),
                bank=detect_bank(row["name"]),
                card=card_status_by_id.get(int(row["id"])),
            )
            for row in account_balances
        ],
        cash_total=balance_summary["cash_total"],
        cards_total=balance_summary["cards_total"],
        net_total=balance_summary["net_total"],
        has_cards=bool(card_status_by_id),
    )
