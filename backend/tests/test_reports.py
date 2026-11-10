"""Reports API (old tests/test_reports.py): cash flow, savings rate, category
ranking and charts, asserted on the JSON the report endpoints return, plus the
other numbers of the old Reports panel (bank balance chart and account filter,
expense pivot, portfolio values)."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from vbx.core.finance import balance_line_chart_spec, build_monthly_chart_rows, cash_flow_chart_spec

from .conftest import get_connection, register_and_login, user_id
from .helpers_investments import add_crypto, add_stock, fresh_price_caches, patch_fetchers


def _seed(username, rows):
    """rows: (kind, amount, date, category_name) - amounts as stored."""
    uid = user_id(username)
    conn = get_connection()
    cat = conn.execute("SELECT id FROM categories WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()["id"]
    inc_cat = conn.execute("SELECT id FROM income_categories WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()[
        "id"
    ]
    acc = conn.execute("SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()["id"]
    for kind, amount, day, category_name in rows:
        if kind == "expense":
            cid = cat
            if category_name:
                existing = conn.execute(
                    "SELECT id FROM categories WHERE user_id = ? AND name = ?", (uid, category_name)
                ).fetchone()
                if existing:
                    cid = existing["id"]
                else:
                    cid = conn.execute(
                        "INSERT INTO categories (user_id, name) VALUES (?, ?)", (uid, category_name)
                    ).lastrowid
            conn.execute(
                "INSERT INTO expenses (user_id, notes, amount, category_id, account_id, spent_at)"
                " VALUES (?, '', ?, ?, ?, ?)",
                (uid, amount, cid, acc, day),
            )
        else:
            conn.execute(
                "INSERT INTO income_entries (user_id, notes, amount, category_id, account_id, received_at)"
                " VALUES (?, '', ?, ?, ?, ?)",
                (uid, amount, inc_cat, acc, day),
            )
    conn.commit()
    conn.close()
    return uid


def test_cash_flow_nets_income_against_signed_expenses(client):
    """Expenses are stored signed, so a refund must reduce spending rather than
    add to it."""
    api = register_and_login(client, "reports-cashflow")
    _seed(
        "reports-cashflow",
        [
            ("income", 2000.0, "2024-01-15", None),
            ("expense", -500.0, "2024-01-20", None),
            ("expense", 100.0, "2024-01-25", None),  # refund
            ("income", 1000.0, "2024-02-10", None),
            ("expense", -1500.0, "2024-02-11", None),
        ],
    )
    cf = api.get("/api/reports/overview", params={"year": "2024"}).json()["cash_flow"]

    jan, feb = cf["months"][0], cf["months"][1]
    assert jan["income"] == 2000.0
    assert jan["expenses"] == -400.0  # -500 spent, +100 refunded
    assert jan["net"] == 1600.0
    assert feb["net"] == -500.0

    assert cf["total_income"] == 3000.0
    assert cf["total_expenses"] == -1900.0
    assert cf["total_net"] == 1100.0
    assert cf["active_month_count"] == 2
    assert cf["total_income"] + cf["total_expenses"] == cf["total_net"]
    # the month-by-month table lists active months only
    assert [m["label"] for m in cf["months"] if m["active"]] == ["January", "February"]
    assert (cf["avg_income"], cf["avg_expenses"], cf["avg_net"]) == (1500.0, -950.0, 550.0)


def test_savings_rate_and_month_extremes(client):
    api = register_and_login(client, "reports-savings")
    _seed(
        "reports-savings",
        [
            ("income", 1000.0, "2024-03-01", None),
            ("expense", -250.0, "2024-03-02", None),
            ("income", 1000.0, "2024-04-01", None),
            ("expense", -1200.0, "2024-04-02", None),
        ],
    )
    cf = api.get("/api/reports/overview", params={"year": "2024"}).json()["cash_flow"]
    assert round(cf["savings_rate"], 2) == 27.5  # kept 550 of 2000
    assert cf["best_month"]["label"] == "March"
    assert cf["worst_month"]["label"] == "April"


def test_savings_rate_is_none_without_income(client):
    api = register_and_login(client, "reports-nosavings")
    _seed("reports-nosavings", [("expense", -80.0, "2024-05-04", None)])
    cf = api.get("/api/reports/overview", params={"year": "2024"}).json()["cash_flow"]
    assert cf["savings_rate"] is None
    assert cf["total_net"] == -80.0


def test_category_ranking_orders_by_outflow_with_shares_and_deltas(client):
    api = register_and_login(client, "reports-categories")
    _seed(
        "reports-categories",
        [
            ("expense", -300.0, "2024-01-10", "Rent"),
            ("expense", -100.0, "2024-01-11", "Food"),
            ("expense", -60.0, "2024-02-12", "NewThing"),
            ("expense", -200.0, "2023-01-10", "Rent"),
        ],
    )
    body = api.get("/api/reports/spending", params={"year": "2024"}).json()
    ranking = body["categories"]
    by_name = {r["name"]: r for r in ranking["rows"]}
    names = [r["name"] for r in ranking["rows"]]
    assert names[0] == "Rent"
    assert ranking["outflow_total"] == 460.0
    assert round(by_name["Rent"]["share"], 1) == 65.2
    assert round(sum(r["share"] for r in ranking["rows"]), 1) == 100.0
    assert by_name["Rent"]["delta"] == -100.0
    assert by_name["Rent"]["prev_total"] == -200.0
    assert by_name["NewThing"]["delta"] is None
    assert ranking["prev_year"] == 2023
    assert ranking["has_previous"] is True


def test_refund_only_category_does_not_distort_shares(client):
    api = register_and_login(client, "reports-refunds")
    _seed(
        "reports-refunds",
        [
            ("expense", -100.0, "2024-06-01", "Groceries"),
            ("expense", 40.0, "2024-06-02", "Refunds"),
        ],
    )
    ranking = api.get("/api/reports/spending", params={"year": "2024"}).json()["categories"]
    by_name = {r["name"]: r for r in ranking["rows"]}
    assert ranking["outflow_total"] == 100.0
    assert by_name["Refunds"]["share"] == 0.0
    assert by_name["Groceries"]["share"] == 100.0
    assert ranking["rows"][-1]["name"] == "Refunds"


def test_chart_only_plots_months_that_happened(client):
    api = register_and_login(client, "reports-chart")
    _seed(
        "reports-chart",
        [
            ("income", 900.0, "2024-01-05", None),
            ("expense", -400.0, "2024-01-06", None),
            ("income", 900.0, "2024-02-05", None),
        ],
    )
    body = api.get("/api/reports/overview", params={"year": "2024"}).json()
    chart = body["cash_flow_chart"]
    assert chart["has_data"] is True
    assert len([m for m in chart["months"] if m["has_net_point"]]) == 2
    assert len(chart["months"]) == 12  # axis still spans the year
    assert [m["short"] for m in chart["months"]][:2] == ["Jan", "Feb"]
    bars = [(m["month"], kind) for m in chart["months"] for kind in ("income", "expenses") if m[kind]]
    assert bars == [(1, "income"), (1, "expenses"), (2, "income")]
    # same series and value range as the old SVG spec
    spec = cash_flow_chart_spec(body["cash_flow"]["months"])
    assert len(spec["net_dots"]) == 2 and len(spec["bars"]) == 3
    assert spec["y_ticks"][0]["text"] == f"{chart['y_max']:,.0f}"
    assert spec["y_ticks"][2]["text"] == f"{chart['y_min']:,.0f}"
    assert chart["y_max"] == pytest.approx(900 + 1300 * 0.08)
    assert chart["y_min"] == pytest.approx(-400 - 1300 * 0.08)


def test_chart_spec_handles_an_empty_year(client):
    spec = cash_flow_chart_spec([])
    assert spec["bars"] == []
    assert spec["net_points"] == ""
    assert spec["net_dots"] == []
    api = register_and_login(client, "reports-empty")
    body = api.get("/api/reports/overview", params={"year": "2001"}).json()
    assert body["cash_flow_chart"]["has_data"] is False
    assert body["cash_flow_chart"]["y_min"] is None
    assert body["cash_flow"]["best_month"] is None
    assert not any(m["active"] for m in body["cash_flow"]["months"])


def test_legacy_report_section_links_still_resolve(client):
    """Old bookmarks used bank/crypto/stocks; they must land on a section."""
    api = register_and_login(client, "reports-legacy")
    for legacy, expected in (
        ("bank", "overview"),
        ("crypto", "investments"),
        ("stocks", "investments"),
        ("nonsense", "overview"),
        ("", "overview"),
        ("Spending", "spending"),
        ("tags", "tags"),
    ):
        resp = api.get("/api/reports/section", params={"section": legacy})
        assert resp.status_code == 200
        assert resp.json()["section"] == expected, legacy
    assert api.get("/api/reports/section").json() == {
        "section": "overview",
        "sections": ["overview", "spending", "tags", "investments"],
    }


# --- beyond the old file: the rest of the Reports panel -----------------------------


def test_year_falls_back_to_current_year(client):
    api = register_and_login(client, "reports-year")
    this_year = date.today().year
    for raw in ("", "abc", "1999", "2101", None):
        params = {} if raw is None else {"year": raw}
        assert api.get("/api/reports/overview", params=params).json()["year"] == this_year
        assert api.get("/api/reports/spending", params=params).json()["year"] == this_year
        assert api.get("/api/reports/investments", params=params).json()["year"] == this_year
    assert api.get("/api/reports/spending", params={"year": " 2024 "}).json()["year"] == 2024
    assert api.get("/api/reports/overview").json()["current_year"] == this_year


def test_bank_chart_and_account_filter(client, app):
    api = register_and_login(client, "reports-bank")
    uid = user_id("reports-bank")
    conn = get_connection()
    main = conn.execute("SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()["id"]
    conn.execute("UPDATE accounts SET opening_balance = 100 WHERE id = ?", (main,))
    savings = conn.execute(
        "INSERT INTO accounts (user_id, name, opening_balance) VALUES (?, 'Savings', 1000)", (uid,)
    ).lastrowid
    conn.commit()
    conn.close()
    _seed(
        "reports-bank",
        [
            ("income", 500.0, "2023-06-01", None),  # before the year: part of the baseline
            ("expense", -50.0, "2024-02-10", None),
            ("income", 200.0, "2024-03-10", None),
        ],
    )

    every = api.get("/api/reports/overview", params={"year": "2024", "account": "all"}).json()
    assert (every["account_id"], every["account_label"]) == (None, "All accounts")
    assert every["bank_baseline"] == 1600.0
    values = [p["value"] for p in every["bank_chart"]["points"]]
    assert values[:3] == [1600.0, 1550.0, 1750.0] and values[-1] == 1750.0
    changes = [p["change"] for p in every["bank_chart"]["points"]]
    assert changes[:3] == [0.0, -50.0, 200.0]
    assert every["bank_balance"] == 1750.0
    assert every["bank_chart"]["points"][0] == {
        "month_num": 1,
        "month_label": "January",
        "short": "Jan",
        "value": 1600.0,
        "change": 0.0,
    }
    # the value range is the old spec's (5% padding), ticks included
    chart = every["bank_chart"]
    assert chart["y_min"] == pytest.approx(1550 - 200 * 0.05)
    assert chart["y_max"] == pytest.approx(1750 + 200 * 0.05)
    rows = build_monthly_chart_rows(values, 2024, baseline=1600.0)
    ticks = balance_line_chart_spec(rows)["y_ticks"]
    assert [t["text"] for t in ticks] == [f"{chart['y_max']:.2f}", f"{chart['y_mid']:.2f}", f"{chart['y_min']:.2f}"]

    only_savings = api.get("/api/reports/overview", params={"year": "2024", "account": str(savings)}).json()
    assert (only_savings["account_id"], only_savings["account_label"]) == (savings, "Savings")
    assert only_savings["bank_baseline"] == 1000.0
    assert {p["value"] for p in only_savings["bank_chart"]["points"]} == {1000.0}
    assert only_savings["bank_chart"]["y_min"] == pytest.approx(1000 - 20)  # flat line: 2% padding
    assert only_savings["bank_balance"] == 1000.0
    # cash flow is not filtered by account (as before)
    assert only_savings["cash_flow"]["total_income"] == 200.0

    # someone else's account, or junk, is "all accounts"
    other = register_and_login(TestClient(app), "reports-bank-other")
    resp = other.get("/api/reports/overview", params={"year": "2024", "account": str(savings)}).json()
    assert (resp["account_id"], resp["account_label"]) == (None, "All accounts")
    assert resp["bank_baseline"] == 0.0
    for junk in ("x", "", "ALL", "999999"):
        assert api.get("/api/reports/overview", params={"account": junk}).json()["account_id"] is None


def test_expense_pivot_for_the_year(client):
    api = register_and_login(client, "reports-pivot")
    _seed(
        "reports-pivot",
        [
            ("expense", -10.0, "2024-01-05", "Food"),
            ("expense", -20.0, "2024-01-25", "Food"),
            ("expense", -5.0, "2024-03-01", "Food"),
            ("expense", -100.0, "2024-03-02", "Rent"),
            ("expense", -999.0, "2023-12-31", "Rent"),
        ],
    )
    pivot = api.get("/api/reports/spending", params={"year": "2024"}).json()["expense_pivot"]
    assert pivot["month_headers"][0] == "01.Jan" and len(pivot["month_headers"]) == 12
    food, rent = pivot["rows"]  # by category name
    assert food["name"] == "Food" and food["months"][:3] == [-30.0, 0.0, -5.0]
    assert food["total"] == -35.0 and food["avg"] == -17.5
    assert rent["total"] == -100.0 and rent["avg"] == -100.0
    assert pivot["month_totals"][:3] == [-30.0, 0.0, -105.0]
    assert pivot["grand_total"] == -135.0
    assert pivot["active_month_count"] == 2
    assert pivot["avg_monthly_total"] == -67.5


def test_reports_are_per_user(client, app):
    api = register_and_login(client, "reports-mine")
    _seed("reports-mine", [("expense", -10.0, "2024-01-05", "Food"), ("income", 5.0, "2024-01-05", None)])
    other = register_and_login(TestClient(app), "reports-theirs")
    assert other.get("/api/reports/spending", params={"year": "2024"}).json()["categories"]["rows"] == []
    assert other.get("/api/reports/overview", params={"year": "2024"}).json()["cash_flow"]["total_income"] == 0.0
    assert api.get("/api/reports/overview", params={"year": "2024"}).json()["cash_flow"]["total_income"] == 5.0


def test_reports_need_login(client):
    for section in ("overview", "spending", "tags", "investments", "section"):
        assert client.get(f"/api/reports/{section}").status_code == 401


def test_portfolio_values_by_month_end(client, monkeypatch):
    """Crypto (EUR) and stocks (USD) valued at stored month-end prices; the
    baseline is the end of the previous year; the reported value is December's
    for a past year. Never summed together."""
    api = register_and_login(client, "reports-portfolio")
    add_crypto(api, quantity="2", price_per_unit="100", fee="0", transacted_at="2023-12-15")
    add_crypto(api, quantity="1", price_per_unit="100", fee="0", transacted_at="2024-02-15")
    add_stock(api, quantity="3", price_per_unit="10", fee="0", transacted_at="2024-06-15")
    conn = get_connection()
    for month in range(1, 13):
        conn.execute(
            "INSERT OR REPLACE INTO crypto_month_prices (coin_id, year, month, price_eur, price_date, source) "
            "VALUES ('bitcoin', 2024, ?, ?, '2024-01-31', 'test')",
            (month, 100.0 + month),
        )
        conn.execute(
            "INSERT OR REPLACE INTO stock_month_prices (symbol, year, month, price_usd, price_date, source) "
            "VALUES ('AAPL', 2024, ?, ?, '2024-01-31', 'test')",
            (month, 20.0 + month),
        )
    conn.execute(
        "INSERT OR REPLACE INTO crypto_month_prices (coin_id, year, month, price_eur, price_date, source) "
        "VALUES ('bitcoin', 2023, 12, 90, '2023-12-31', 'test')"
    )
    conn.commit()
    conn.close()
    fresh_price_caches(monkeypatch)
    coingecko, finnhub = patch_fetchers(monkeypatch)

    body = api.get("/api/reports/investments", params={"year": "2024"}).json()
    assert body["crypto_baseline"] == 180.0  # 2 BTC x 90
    crypto = [p["value"] for p in body["crypto_chart"]["points"]]
    assert crypto[0] == 2 * 101.0
    assert crypto[1] == 3 * 102.0  # bought in February
    assert crypto[11] == 3 * 112.0
    assert body["crypto_chart"]["points"][0]["change"] == 202.0 - 180.0
    assert body["stock_baseline"] == 0.0
    stocks = [p["value"] for p in body["stock_chart"]["points"]]
    assert stocks[:5] == [0.0] * 5 and stocks[5] == 3 * 26.0 and stocks[11] == 3 * 32.0
    assert (body["crypto_value"], body["stock_value"]) == (336.0, 96.0)
    assert coingecko.calls == [] and finnhub.calls == []

    overview = api.get("/api/reports/overview", params={"year": "2024"}).json()
    assert (overview["crypto_value"], overview["stock_value"]) == (336.0, 96.0)


def test_portfolio_value_for_the_running_year_is_todays(client, monkeypatch):
    api = register_and_login(client, "reports-portfolio-now")
    today = date.today()
    add_crypto(api, quantity="2", price_per_unit="100", fee="0", transacted_at=f"{today.year}-01-01")
    fresh_price_caches(monkeypatch)
    patch_fetchers(monkeypatch, crypto_result={"bitcoin": {"price": 150.0, "change_24h": None}})
    body = api.get("/api/reports/investments").json()
    # the running month uses the live quote; every other month without a stored
    # or historical price falls back to it too and stores it - future months of
    # the year included (old behaviour, see docs/parity/D.md)
    assert body["crypto_chart"]["points"][today.month - 1]["value"] == 300.0
    assert body["crypto_value"] == 300.0  # today's month, not December
    conn = get_connection()
    stored = conn.execute(
        "SELECT COUNT(*) FROM crypto_month_prices WHERE coin_id = 'bitcoin' AND year = ? "
        "AND source = 'coingecko_live_fallback'",
        (today.year,),
    ).fetchone()[0]
    conn.close()
    assert stored == 11
