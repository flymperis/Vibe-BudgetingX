"""The budget part of the old routes/dashboard.py::index, shared by the
budget, home and summary routers."""

from __future__ import annotations

import sqlite3

from vbx.core import budget

from ..schemas.budget import BudgetFormRow, BudgetLine, BudgetPanelOut, BudgetSummary, MonthSnapshot, UnbudgetedLine


def _line(row: dict) -> BudgetLine:
    return BudgetLine(
        category_id=row.get("category_id"),
        name=row["name"],
        default=row.get("default"),
        override=row.get("override"),
        budget=row["budget"],
        spent=row["spent"],
        remaining=row["remaining"],
        pct=row["pct"],
        status=row["status"],
    )


def summary_out(summary: dict) -> BudgetSummary:
    """budget.budget_for_month()'s dict as the API model."""
    return BudgetSummary(
        ym=summary["ym"],
        cleared=summary["cleared"],
        rows=[_line(r) for r in summary["rows"]],
        unbudgeted=[UnbudgetedLine(**u) for u in summary["unbudgeted"]],
        unbudgeted_spent=summary["unbudgeted_spent"],
        other=None if summary["other"] is None else _line(summary["other"]),
        total_budget=summary["total_budget"],
        total_spent=summary["total_spent"],
        total_remaining=summary["total_remaining"],
        total_pct=summary["total_pct"],
        total_status=summary["total_status"],
        over=[_line(r) for r in summary["over"]],
    )


def month_summary(conn: sqlite3.Connection, uid: int, month_filter: str) -> tuple[bool, dict | None]:
    """(budget_enabled, budget_summary) exactly as the old index computed them."""
    budget_enabled = budget.is_enabled(conn, uid)
    budget_summary = budget.budget_for_month(conn, uid, month_filter) if budget_enabled else None
    return budget_enabled, budget_summary


def budget_panel(conn: sqlite3.Connection, uid: int, month_filter: str) -> BudgetPanelOut:
    """Everything the old _budget.html panel showed for month_filter."""
    budget_enabled, budget_summary = month_summary(conn, uid, month_filter)
    if not budget_enabled:
        return BudgetPanelOut(month=month_filter, enabled=False)

    categories = conn.execute(
        "SELECT id, name FROM categories WHERE user_id = ? ORDER BY name",
        (uid,),
    ).fetchall()
    budget_defaults = budget.default_budgets(conn, uid)
    # The manual-budgets form edits the saved other_amount regardless of
    # which month is being viewed, so it must be read directly rather than
    # via budget_summary["other"] — on a cleared month that's always None.
    budget_other_amount = budget.get_other_amount(conn, uid)
    category_ids = [int(cat["id"]) for cat in categories]
    history = budget.spending_history(conn, uid, month_filter, category_ids=category_ids, defaults=budget_defaults)
    fixed_ids = budget.fixed_categories(conn, uid)
    budget_form_rows = []
    for cat in categories:
        cid = int(cat["id"])
        hist = history.get(cid, {"avg": 0.0, "suggested": 0.0, "active": False})
        budget_form_rows.append(
            {
                "id": cid,
                "name": cat["name"],
                "default": budget_defaults.get(cid),
                "avg": hist["avg"],
                "active": hist["active"],
                "fixed": cid in fixed_ids,
            }
        )
    budget_form_rows.sort(key=lambda r: (0, -r["avg"], r["name"]) if r["active"] else (1, r["name"]))

    budget_month_snapshots = [
        {"ym": snap["ym"], "amounts": {str(cid): amt for cid, amt in snap["amounts"].items()}}
        for snap in budget.month_budget_snapshots(conn, uid)
    ]

    # Template arithmetic of _budget.html, done here.
    with_default = [r for r in budget_form_rows if r["default"] is not None]
    defaults_total = sum(r["default"] for r in with_default) + (budget_other_amount or 0)
    cleared = budget_summary["cleared"]
    cleared_total_spent = None
    if cleared and not budget_summary["rows"]:
        cleared_total_spent = budget_summary["total_spent"] + sum(u["spent"] for u in budget_summary["unbudgeted"])

    return BudgetPanelOut(
        month=month_filter,
        enabled=True,
        summary=summary_out(budget_summary),
        form_rows=[BudgetFormRow(**r) for r in budget_form_rows],
        other_amount=budget_other_amount,
        defaults_total=defaults_total,
        has_any_default=bool(with_default),
        can_clear_month=(not cleared) or bool(budget_summary["rows"]),
        cleared_total_spent=cleared_total_spent,
        month_snapshots=[MonthSnapshot(**s) for s in budget_month_snapshots],
    )
