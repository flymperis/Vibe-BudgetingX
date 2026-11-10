"""Reports logic lifted from the Reports panel of the old routes/dashboard.py::index.

The old page computed every section whenever `panel=reports` was served (the
sections were switched client-side). Here each section has its own endpoint and
computes only what that section showed, with the same core calls and arguments.
Only the sections that show portfolio values (overview, investments) reach the
price code (vbx.core.prices.ensure_*_month_price: stored month-end prices first,
then CoinGecko history / yfinance for a missing past month, the live quote for
the current month).

Charts: the old app drew inline SVG from finance.balance_line_chart_spec and
finance.cash_flow_chart_spec. Here the same series are returned with the value
range those specs computed (min/max padding included), so the frontend can draw
them without recomputing anything.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from vbx.core import tags
from vbx.core.finance import (
    account_balance_at_cutoff,
    build_monthly_chart_rows,
    category_spend_ranking,
    compute_crypto_holdings,
    compute_stock_holdings,
    expense_pivot_for_report_year,
    monthly_cash_flow_for_year,
    monthly_crypto_portfolio_values_for_year,
    monthly_stock_portfolio_values_for_year,
    monthly_total_balances_for_year,
    portfolio_baseline_before_year,
)
from vbx.core.helpers import normalize_report_account, normalize_year

from . import investments as inv

# --- charts -------------------------------------------------------------------------


def balance_chart(rows: list[dict]) -> dict:
    """Series and value range of finance.balance_line_chart_spec(rows): the
    range is the data min/max padded by 5% (or by max(2% of |value|, 1), or 1,
    when every value is equal); y_mid is the middle tick."""
    points = [
        {
            "month_num": int(r["month_num"]),
            "month_label": r["month_label"],
            "short": r["month_label"][:3],
            "value": float(r["total_balance"]),
            "change": float(r.get("change", 0.0)),
        }
        for r in rows
    ]
    vals = [p["value"] for p in points]
    if not vals:
        return {"points": [], "y_min": None, "y_max": None, "y_mid": None}
    y_lo = min(vals)
    y_hi = max(vals)
    span = y_hi - y_lo
    if span <= 0:
        eps = max(abs(y_lo) * 0.02, 1.0) if y_lo != 0 else 1.0
        y_min = y_lo - eps
        y_max = y_hi + eps
    else:
        pad = span * 0.05
        y_min = y_lo - pad
        y_max = y_hi + pad
    y_rng = y_max - y_min or 1.0
    return {"points": points, "y_min": y_min, "y_max": y_max, "y_mid": y_min + y_rng / 2}


def cash_flow_chart(months: list[dict]) -> dict:
    """Series and value range of finance.cash_flow_chart_spec(months).

    has_data is False when the old chart was empty (no month with income or
    spending). The range always includes 0 and is padded by 8% of the span.
    Per month: an income bar when income != 0, a spending bar when expenses
    != 0, a net point only when the month had either (has_net_point)."""
    series = [
        {
            "month": int(m["month"]),
            "label": m["label"],
            "short": m["short"],
            "income": float(m["income"]),
            "expenses": float(m["expenses"]),
            "net": float(m["net"]),
            "has_net_point": bool(m["income"] or m["expenses"]),
        }
        for m in months
    ]
    empty = {"has_data": False, "months": series, "y_min": None, "y_max": None}
    if not months or not any(m["income"] or m["expenses"] for m in months):
        return empty
    incomes = [s["income"] for s in series]
    expenses = [s["expenses"] for s in series]
    nets = [s["net"] for s in series]
    y_hi = max([0.0] + incomes + nets)
    y_lo = min([0.0] + expenses + nets)
    span = y_hi - y_lo
    if span <= 0:
        return empty
    pad = span * 0.08
    return {"has_data": True, "months": series, "y_min": y_lo - pad, "y_max": y_hi + pad}


# --- sections -------------------------------------------------------------------------


def _today():
    return datetime.now().date()


def _portfolios(conn, user_id: int, report_year: int, today_d) -> dict:
    """Crypto (EUR) and stock (USD) month-end portfolio values for the year,
    exactly as the old reports block: baseline = value at the end of the
    previous year, then one value per month, each priced by
    prices_for_holdings_at_month_end (which stores past month-end prices in
    crypto_month_prices / stock_month_prices; the caller commits)."""
    crypto_txs = inv.crypto_transactions(conn, user_id)
    stock_txs = inv.stock_transactions(conn, user_id)

    crypto_baseline = portfolio_baseline_before_year(
        conn, crypto_txs, report_year, today_d, compute_crypto_holdings, "coin_id", "crypto"
    )
    crypto_monthly = monthly_crypto_portfolio_values_for_year(conn, crypto_txs, report_year, today_d)
    crypto_rows = build_monthly_chart_rows(crypto_monthly, report_year, baseline=crypto_baseline)

    stock_baseline = portfolio_baseline_before_year(
        conn, stock_txs, report_year, today_d, compute_stock_holdings, "symbol", "stock"
    )
    stock_monthly = monthly_stock_portfolio_values_for_year(conn, stock_txs, report_year, today_d)
    stock_rows = build_monthly_chart_rows(stock_monthly, report_year, baseline=stock_baseline)

    # Value at the end of the reported year, or today when that year is still
    # running (the old asset_idx). Crypto is EUR, stocks USD: never summed.
    asset_idx = (today_d.month - 1) if report_year == today_d.year else 11
    return {
        "crypto_baseline": crypto_baseline,
        "stock_baseline": stock_baseline,
        "crypto_chart": balance_chart(crypto_rows),
        "stock_chart": balance_chart(stock_rows),
        "crypto_value": crypto_monthly[asset_idx] if len(crypto_monthly) > asset_idx else 0.0,
        "stock_value": stock_monthly[asset_idx] if len(stock_monthly) > asset_idx else 0.0,
    }


def _account_label(conn, user_id: int, account_id: int | None) -> str:
    if account_id is None:
        return "All accounts"
    accounts = conn.execute(
        "SELECT id, name FROM accounts WHERE user_id = ? ORDER BY name",
        (user_id,),
    ).fetchall()
    for acc in accounts:
        if int(acc["id"]) == int(account_id):
            return str(acc["name"])
    return "All accounts"


def overview(conn, user_id: int, year_raw: str | None, account_raw: str | None) -> dict:
    today_d = _today()
    report_year = normalize_year(year_raw)
    report_account_id = normalize_report_account(account_raw, conn, user_id)

    jan1_this_year = f"{report_year:04d}-01-01"
    prev_balance_total = account_balance_at_cutoff(conn, jan1_this_year, user_id, report_account_id)
    report_live_cutoff = (today_d + timedelta(days=1)).isoformat()
    report_live_balance = account_balance_at_cutoff(conn, report_live_cutoff, user_id, report_account_id)
    report_balances_list = monthly_total_balances_for_year(conn, report_year, today_d, user_id, report_account_id)
    report_balance_rows = build_monthly_chart_rows(report_balances_list, report_year, baseline=prev_balance_total)

    cash_flow = monthly_cash_flow_for_year(conn, report_year, user_id)
    for m in cash_flow["months"]:
        # The month-by-month table listed only months with income or spending.
        m["active"] = bool(m["income"] or m["expenses"])
    portfolios = _portfolios(conn, user_id, report_year, today_d)
    conn.commit()
    return {
        "year": report_year,
        "current_year": today_d.year,
        "account_id": report_account_id,
        "account_label": _account_label(conn, user_id, report_account_id),
        "cash_flow": cash_flow,
        "cash_flow_chart": cash_flow_chart(cash_flow["months"]),
        "bank_baseline": prev_balance_total,
        "bank_chart": balance_chart(report_balance_rows),
        "bank_balance": report_live_balance,
        "crypto_value": portfolios["crypto_value"],
        "stock_value": portfolios["stock_value"],
    }


def spending(conn, user_id: int, year_raw: str | None) -> dict:
    report_year = normalize_year(year_raw)
    return {
        "year": report_year,
        "categories": category_spend_ranking(conn, report_year, user_id),
        "expense_pivot": expense_pivot_for_report_year(conn, report_year, user_id),
    }


def investments(conn, user_id: int, year_raw: str | None) -> dict:
    today_d = _today()
    report_year = normalize_year(year_raw)
    portfolios = _portfolios(conn, user_id, report_year, today_d)
    conn.commit()
    return {"year": report_year, "current_year": today_d.year, **portfolios}


def tags_report(conn, user_id: int, tag_raw: str | None) -> dict:
    """Every tag with its totals; with ?tag=, that tag's detail too (None when
    nothing carries it: the old page then said "Nothing is tagged #x yet.")."""
    selected_tag = (tag_raw or "").strip()
    return {
        "tags": tags.summary(conn, user_id),
        "selected_tag": selected_tag or None,
        "tag": tags.detail(conn, user_id, selected_tag) if selected_tag else None,
    }
