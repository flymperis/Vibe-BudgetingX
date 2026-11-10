"""GET /api/bootstrap: what the old dashboard gave every panel.

Like the old index route, each call first posts any due recurring entries
(finance.apply_recurring_entries) and commits.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter

from vbx.core import budget, tags
from vbx.core.banks import detect_bank
from vbx.core.finance import (
    apply_recurring_entries,
    fetch_account_balances_through,
    is_credit_card,
    summarize_account_balances,
)

from ..deps import DB, User
from ..schemas.auth import UserOut
from ..schemas.bootstrap import AccountOut, BalanceTotals, BootstrapOut
from ..schemas.common import IdName

router = APIRouter(tags=["bootstrap"])


@router.get("/bootstrap", response_model=BootstrapOut)
def bootstrap(user: User, conn: DB):
    uid = user.id
    posted_recurring = apply_recurring_entries(conn, uid)
    if posted_recurring > 0:
        conn.commit()

    categories = conn.execute(
        "SELECT id, name FROM categories WHERE user_id = ? ORDER BY name",
        (uid,),
    ).fetchall()
    income_categories = conn.execute(
        "SELECT id, name FROM income_categories WHERE user_id = ? ORDER BY name",
        (uid,),
    ).fetchall()
    accounts = conn.execute(
        "SELECT id, name, opening_balance, account_type, credit_limit, statement_day, due_day "
        "FROM accounts WHERE user_id = ? ORDER BY name",
        (uid,),
    ).fetchall()
    opening_by_id = {int(a["id"]): float(a["opening_balance"]) for a in accounts}

    # Balances as the Home panel shows them for the current month: every
    # movement through today, card statements judged as of today.
    today_d = datetime.now().date()
    balance_cutoff_d = (today_d + timedelta(days=1)).isoformat()
    account_balances = fetch_account_balances_through(conn, balance_cutoff_d, uid)
    balance_summary = summarize_account_balances(conn, uid, account_balances, today_d)
    card_status_by_id = balance_summary["card_status_by_id"]

    reports_tags = tags.summary(conn, uid)
    budget_enabled = budget.is_enabled(conn, uid)
    conn.commit()

    return BootstrapOut(
        user=UserOut(id=uid, username=user.username),
        today=today_d.isoformat(),
        month=today_d.strftime("%Y-%m"),
        accounts=[
            AccountOut(
                id=int(row["id"]),
                name=row["name"],
                account_type=row["account_type"] or "bank",
                is_credit_card=is_credit_card(row),
                opening_balance=opening_by_id.get(int(row["id"]), 0.0),
                credit_limit=row["credit_limit"],
                statement_day=row["statement_day"],
                due_day=row["due_day"],
                current_balance=float(row["current_balance"]),
                bank=detect_bank(row["name"]),
                card=card_status_by_id.get(int(row["id"])),
            )
            for row in account_balances
        ],
        balance_totals=BalanceTotals(
            cash_total=balance_summary["cash_total"],
            cards_total=balance_summary["cards_total"],
            net_total=balance_summary["net_total"],
        ),
        categories=[IdName(id=int(c["id"]), name=c["name"]) for c in categories],
        income_categories=[IdName(id=int(c["id"]), name=c["name"]) for c in income_categories],
        tag_names=[t["tag"] for t in reports_tags],
        recent_tags=tags.chip_tags(reports_tags, today_d),
        budget_enabled=budget_enabled,
        posted_recurring=posted_recurring,
    )
