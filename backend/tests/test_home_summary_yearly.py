"""GET /api/home, /api/summary, /api/yearly: the old Home, Consolidated and
Yearly panels of routes/dashboard.py::index (no old test file of their own)."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from vbx.core.finance import monthly_total_balances_for_year

from .conftest import first_ids, get_connection, register_and_login
from .helpers_budget import receive, refund, spend, user


def _setup(client, username):
    api = register_and_login(client, username)
    uid, cats, acc = user(username)
    _cat, inc, _acc = first_ids(username)
    return api, uid, cats, acc, inc


def _add_account(uid, name, opening=0.0, **card):
    conn = get_connection()
    cols = ["user_id", "name", "opening_balance", *card.keys()]
    conn.execute(
        f"INSERT INTO accounts ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})",
        (uid, name, opening, *card.values()),
    )
    conn.commit()
    aid = conn.execute("SELECT id FROM accounts WHERE user_id = ? AND name = ?", (uid, name)).fetchone()["id"]
    conn.close()
    return int(aid)


def test_home_month_totals_and_net(client):
    api, uid, cats, acc, inc = _setup(client, "home-totals")
    spend(uid, cats["General"], acc, 40, "2026-03-01")
    spend(uid, cats["Other"], acc, 10, "2026-03-31")
    refund(uid, cats["General"], acc, 5, "2026-03-15")
    spend(uid, cats["General"], acc, 999, "2026-04-01")  # next month
    receive(uid, inc, acc, 100, "2026-03-20")

    body = api.get("/api/home", params={"month": "2026-03"}).json()
    assert body["month"] == "2026-03"
    assert (body["total_income"], body["total_expenses"], body["net"]) == (100.0, 45.0, 55.0)
    assert body["budget_enabled"] is False and body["budget_card"] is None

    empty = api.get("/api/home", params={"month": "2025-01"}).json()
    assert (empty["total_income"], empty["total_expenses"], empty["net"]) == (0.0, 0.0, 0.0)


def test_home_month_parameter_handling(client):
    api, *_ = _setup(client, "home-params")
    this_month = date.today().strftime("%Y-%m")
    for params, expected in (
        ({}, this_month),
        ({"month": "2026-3"}, "2026-03"),
        ({"month": "nonsense"}, this_month),
        ({"month": "2026-13"}, this_month),
        ({"cal_year": "2025", "cal_month": "11"}, "2025-11"),
        ({"cal_year": "1999", "cal_month": "11"}, this_month),
        ({"cal_year": "2025"}, this_month),
        ({"month": "2024-02", "cal_year": "2025", "cal_month": "11"}, "2024-02"),  # month wins
    ):
        for path in ("/api/home", "/api/summary"):
            assert api.get(path, params=params).json()["month"] == expected, (path, params)


def test_balances_run_through_month_end_for_another_month(client):
    api, uid, cats, acc, inc = _setup(client, "home-scope-past")
    conn = get_connection()
    conn.execute("UPDATE accounts SET opening_balance = 100 WHERE id = ?", (acc,))
    conn.commit()
    conn.close()
    spend(uid, cats["General"], acc, 30, "2026-02-28")
    spend(uid, cats["General"], acc, 7, "2026-03-01")  # after February
    receive(uid, inc, acc, 20, "2026-01-10")

    body = api.get("/api/home", params={"month": "2026-02"}).json()
    assert body["balance_scope"] == "month_end"
    assert (body["balance_cutoff"], body["balance_as_of"]) == ("2026-03-01", "2026-02-28")
    assert [(a["name"], a["current_balance"]) for a in body["accounts"]] == [("Main", 90.0)]
    assert (body["cash_total"], body["cards_total"], body["net_total"], body["has_cards"]) == (90.0, 0.0, 90.0, False)


def test_balances_run_through_today_for_the_current_month(client):
    api, uid, cats, acc, _inc = _setup(client, "home-scope-today")
    today = date.today()
    spend(uid, cats["General"], acc, 10, today.isoformat())
    spend(uid, cats["General"], acc, 1000, (today + timedelta(days=1)).isoformat())  # tomorrow: excluded

    body = api.get("/api/home", params={"month": today.strftime("%Y-%m")}).json()
    assert body["balance_scope"] == "today"
    assert body["balance_cutoff"] == (today + timedelta(days=1)).isoformat()
    assert body["balance_as_of"] == today.isoformat()
    assert body["accounts"][0]["current_balance"] == -10.0
    # Same numbers as bootstrap's "current balance".
    boot = api.get("/api/bootstrap").json()
    assert boot["accounts"][0]["current_balance"] == body["accounts"][0]["current_balance"]


def test_credit_card_status_is_judged_on_the_last_covered_day(client):
    api, uid, cats, acc, _inc = _setup(client, "home-card")
    card = _add_account(uid, "Eurobank Visa", 0, account_type="credit", credit_limit=1000, statement_day=5, due_day=25)
    spend(uid, cats["General"], card, 200, "2026-01-03")  # on the 5 Jan statement
    spend(uid, cats["General"], card, 50, "2026-01-10")

    body = api.get("/api/home", params={"month": "2026-01"}).json()
    assert body["has_cards"] is True
    cards = {a["name"]: a for a in body["accounts"]}
    visa = cards["Eurobank Visa"]
    assert visa["is_credit_card"] is True and visa["account_type"] == "credit"
    assert visa["current_balance"] == -250.0
    assert visa["bank"]["slug"] == "eurobank"
    status = visa["card"]
    assert (status["owed"], status["limit"], status["available"], status["used_pct"]) == (250.0, 1000.0, 750.0, 25.0)
    # As of 31 Jan, the last statement closed on 5 Jan and fell due 25 Jan.
    assert status["statement"]["closed_on"] == "2026-01-05"
    assert status["statement"]["amount"] == 200.0
    assert status["statement"]["due_on"] == "2026-01-25"
    assert status["statement"]["state"] == "overdue"
    assert cards["Main"]["card"] is None
    assert (body["cash_total"], body["cards_total"], body["net_total"]) == (0.0, -250.0, -250.0)


def test_summary_breakdowns_and_net_balance(client):
    api, uid, cats, acc, inc = _setup(client, "summary-break")
    conn = get_connection()
    salary = conn.execute("SELECT id FROM income_categories WHERE user_id = ? AND name = 'Salary'", (uid,)).fetchone()[
        "id"
    ]
    conn.close()
    savings = _add_account(uid, "Savings", 500)
    spend(uid, cats["General"], acc, 10, "2026-05-01")
    spend(uid, cats["Other"], acc, 25, "2026-05-02")
    refund(uid, cats["Other"], acc, 5, "2026-05-03")
    receive(uid, salary, acc, 1000, "2026-05-01")
    receive(uid, inc, savings, 50, "2026-05-04")
    receive(uid, inc, acc, 999, "2026-06-01")

    body = api.get("/api/summary", params={"month": "2026-05"}).json()
    assert (body["total_income"], body["total_expenses"], body["net"]) == (1050.0, 30.0, 1020.0)
    assert body["expense_breakdown"] == [
        {"category_name": "Other", "total_amount": 20.0},
        {"category_name": "General", "total_amount": 10.0},
    ]
    assert body["income_breakdown"] == [
        {"category_name": "Salary", "total_amount": 1000.0},
        {"category_name": "General", "total_amount": 50.0},
    ]
    assert [(a["name"], a["current_balance"]) for a in body["accounts"]] == [("Main", 970.0), ("Savings", 550.0)]
    assert body["net_total"] == 1520.0  # the "Net Balance" card
    assert body["budget_enabled"] is False and body["budget"] is None


def test_summary_budget_table_with_unbudgeted_and_other(client):
    api, uid, cats, acc, _inc = _setup(client, "summary-budget")
    api.post("/api/budget/toggle", json={"enabled": True})
    api.post("/api/budget/defaults", json={"amounts": {str(cats["General"]): "100"}, "other_amount": "15"})
    spend(uid, cats["Other"], acc, 20, "2026-05-02")

    b = api.get("/api/summary", params={"month": "2026-05"}).json()["budget"]
    assert [(r["name"], r["spent"], r["budget"], r["remaining"]) for r in b["rows"]] == [("General", 0.0, 100.0, 100.0)]
    assert b["unbudgeted"] == [{"category_id": cats["Other"], "name": "Other", "spent": 20.0}]
    assert (b["other"]["name"], b["other"]["spent"], b["other"]["budget"], b["other"]["remaining"]) == (
        "Everything else",
        20.0,
        15.0,
        -5.0,
    )


def test_read_endpoints_only_see_the_users_own_rows(client, app):
    _api, uid, cats, acc, inc = _setup(client, "home-owner")
    spend(uid, cats["General"], acc, 40, "2026-05-01")
    receive(uid, inc, acc, 60, "2026-05-01")

    other = register_and_login(TestClient(app), "home-other")
    home = other.get("/api/home", params={"month": "2026-05"}).json()
    assert (home["total_income"], home["total_expenses"]) == (0.0, 0.0)
    assert [a["current_balance"] for a in home["accounts"]] == [0.0]
    summary = other.get("/api/summary", params={"month": "2026-05"}).json()
    assert summary["expense_breakdown"] == [] and summary["income_breakdown"] == []
    yearly = other.get("/api/yearly", params={"year": "2026"}).json()
    assert yearly["total_income"] == 0.0 and yearly["total_expenses"] == 0.0


def test_yearly_rows_totals_and_balances(client):
    api, uid, cats, acc, inc = _setup(client, "yearly-rows")
    conn = get_connection()
    conn.execute("UPDATE accounts SET opening_balance = 10 WHERE id = ?", (acc,))
    conn.commit()
    conn.close()
    spend(uid, cats["General"], acc, 30, "2025-01-15")
    refund(uid, cats["General"], acc, 5, "2025-01-20")
    receive(uid, inc, acc, 100, "2025-03-01")
    spend(uid, cats["General"], acc, 12.5, "2025-12-31")
    spend(uid, cats["General"], acc, 1, "2024-12-31")  # previous year
    receive(uid, inc, acc, 1, "2026-01-01")  # next year

    body = api.get("/api/yearly", params={"year": "2025"}).json()
    assert body["year"] == 2025
    rows = body["rows"]
    assert [r["month"] for r in rows] == list(range(1, 13))
    assert (rows[0]["income"], rows[0]["expenses"], rows[0]["delta"]) == (0.0, 25.0, -25.0)
    assert (rows[2]["income"], rows[2]["expenses"], rows[2]["delta"]) == (100.0, 0.0, 100.0)
    assert rows[11]["expenses"] == 12.5
    assert (body["total_income"], body["total_expenses"], body["total_delta"]) == (100.0, 37.5, 62.5)
    # Balance after each month: opening 10, -1 in Dec 2024.
    assert rows[0]["total_balance"] == 10 - 1 - 25
    assert rows[1]["total_balance"] == 10 - 1 - 25
    assert rows[2]["total_balance"] == 10 - 1 - 25 + 100
    assert rows[11]["total_balance"] == 10 - 1 - 25 + 100 - 12.5
    conn = get_connection()
    expected = monthly_total_balances_for_year(conn, 2025, date.today(), uid)
    conn.close()
    assert [r["total_balance"] for r in rows] == expected


def test_yearly_year_parameter_handling(client):
    api, *_ = _setup(client, "yearly-params")
    this_year = date.today().year
    for raw, expected in (
        (None, this_year),
        ("", this_year),
        ("2030", 2030),
        (" 2001 ", 2001),
        ("1999", this_year),
        ("2101", this_year),
        ("abc", this_year),
    ):
        params = {} if raw is None else {"year": raw}
        body = api.get("/api/yearly", params=params).json()
        assert body["year"] == expected, raw
        assert len(body["rows"]) == 12
