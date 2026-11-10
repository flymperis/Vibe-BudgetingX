"""Core flows (old tests/test_core_flows.py): register, log out, the
long-lived login cookie, the expense and income add cycles, accounts and
categories, and a "loads for a new user" check for the income, categories,
accounts, transfers and recurring endpoints."""

import re

from fastapi.testclient import TestClient

from .conftest import DEFAULT_PASSWORD, csrf_token, first_ids, get_connection, register_and_login


def test_register_and_bootstrap_load(client):
    """Old: test_register_and_dashboard_load."""
    api = register_and_login(client, "alice")
    resp = api.get("/api/bootstrap")
    assert resp.status_code == 200
    assert resp.json()["user"]["username"] == "alice"


def test_logout_requires_csrf_then_succeeds(client):
    api = register_and_login(client, "bob")

    resp = client.post("/api/auth/logout")
    assert resp.status_code == 403  # missing CSRF token is rejected (old app: 400)
    assert resp.json() == {"detail": "Invalid or missing CSRF token."}

    resp = api.post("/api/auth/logout")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    resp = client.get("/api/bootstrap")
    assert resp.status_code == 401  # old app: bounced to /login once logged out


def _session_cookie_header(resp) -> str:
    cookies = [h for h in resp.headers.get_list("set-cookie") if h.startswith("vbx_session=")]
    assert cookies, "login did not set a session cookie"
    return cookies[-1]


def test_login_cookie_survives_closing_the_app(app, client):
    """A cookie without an expiry is dropped whenever an iOS home-screen app is
    closed, so logins must set a long-lived one (Max-Age here; the old Flask
    cookie used Expires)."""
    register_and_login(client, "pwa-user")

    fresh = TestClient(app)
    token = csrf_token(fresh)
    resp = fresh.post(
        "/api/auth/login",
        json={"username": "pwa-user", "password": DEFAULT_PASSWORD},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 200

    header = _session_cookie_header(resp)
    match = re.search(r"Max-Age=(\d+)", header, re.I)
    assert match, f"session cookie has no expiry: {header}"
    assert int(match.group(1)) > 300 * 24 * 3600
    assert "httponly" in header.lower()
    assert "samesite=lax" in header.lower()


def test_add_edit_delete_expense(client):
    api = register_and_login(client, "dave")
    boot = api.get("/api/bootstrap").json()
    category_id = boot["categories"][0]["id"]
    account_id = boot["accounts"][0]["id"]

    resp = api.post(
        "/api/expenses",
        json={"notes": "coffee", "amount": "3.50", "category_id": category_id, "account_id": account_id},
    )
    assert resp.status_code == 200
    assert resp.json()["notes"] == "coffee"
    assert any(e["notes"] == "coffee" for e in api.get("/api/expenses").json()["items"])

    conn = get_connection()
    row = conn.execute("SELECT id FROM expenses WHERE notes = 'coffee'").fetchone()
    conn.close()
    assert row is not None
    expense_id = row["id"]
    assert resp.json()["id"] == expense_id

    resp = api.put(
        f"/api/expenses/{expense_id}",
        json={"notes": "coffee and cake", "amount": "5.00", "category_id": category_id, "account_id": account_id},
    )
    assert resp.status_code == 200
    notes = [e["notes"] for e in api.get("/api/expenses").json()["items"]]
    assert "coffee and cake" in notes

    resp = api.delete(f"/api/expenses/{expense_id}")
    assert resp.status_code == 200
    notes = [e["notes"] for e in api.get("/api/expenses").json()["items"]]
    assert "coffee and cake" not in notes


def test_add_expense_with_chosen_date(client):
    """Old: test_add_expense_and_income_with_chosen_date (expense half; the
    income half is test_add_income_with_chosen_date)."""
    api = register_and_login(client, "hana")
    cat, _inc, acc = first_ids("hana")
    resp = api.post(
        "/api/expenses",
        json={"notes": "old lunch", "amount": "12", "category_id": cat, "account_id": acc, "spent_at": "2026-03-14"},
    )
    assert resp.status_code == 200
    assert resp.json()["spent_at"] == "2026-03-14"

    conn = get_connection()
    expense = conn.execute("SELECT spent_at FROM expenses WHERE notes = 'old lunch'").fetchone()
    conn.close()
    assert expense["spent_at"][:10] == "2026-03-14"


def test_domain_a_endpoints_load_for_a_new_user(client):
    """Old: test_dashboard_loads_every_panel (income, recurring, transfer and
    the settings banks/expense/income category sections)."""
    api = register_and_login(client, "carol")
    for url in (
        "/api/income",
        "/api/categories",
        "/api/income-categories",
        "/api/accounts",
        "/api/transfers",
        "/api/recurring",
    ):
        resp = api.get(url)
        assert resp.status_code == 200, f"{url} failed to load: {resp.text}"
    assert api.get("/api/income").json()["items"] == []
    assert [c["name"] for c in api.get("/api/categories").json()["items"]] == ["General", "Other"]
    assert [c["name"] for c in api.get("/api/income-categories").json()["items"]] == ["General", "Other", "Salary"]
    assert [a["name"] for a in api.get("/api/accounts").json()["items"]] == ["Main"]
    assert api.get("/api/transfers").json()["items"] == []
    assert api.get("/api/recurring").json()["items"] == []


def test_dashboard_loads_every_panel(client):
    """Old: every ?panel=<p> in config.ALLOWED_PANELS answered 200 for a new
    user. New: the data endpoint(s) of each panel (home, expenses, income,
    recurring, transfer, summary, budget, shared, yearly, reports,
    investments, settings), plus bootstrap."""
    api = register_and_login(client, "carol-panels")
    urls = (
        "/api/bootstrap",
        "/api/home",
        "/api/expenses",
        "/api/income",
        "/api/recurring",
        "/api/transfers",
        "/api/summary",
        "/api/budget",
        "/api/shared",
        "/api/yearly",
        "/api/reports/overview",
        "/api/reports/spending",
        "/api/reports/tags",
        "/api/reports/investments",
        "/api/investments",
        # settings sections (general is client-only)
        "/api/accounts",
        "/api/categories",
        "/api/income-categories",
        "/api/settings/integrations",
        "/api/export/excel",
        "/api/export/migration-template",
    )
    for url in urls:
        resp = api.get(url)
        assert resp.status_code == 200, f"{url} failed to load: {resp.text[:200]}"


def test_add_income_entry(client):
    api = register_and_login(client, "erin")
    boot = api.get("/api/bootstrap").json()
    category_id = boot["income_categories"][0]["id"]
    account_id = boot["accounts"][0]["id"]

    resp = api.post(
        "/api/income",
        json={"notes": "salary", "amount": "1500", "category_id": category_id, "account_id": account_id},
    )
    assert resp.status_code == 200

    conn = get_connection()
    row = conn.execute("SELECT amount FROM income_entries WHERE notes = 'salary'").fetchone()
    conn.close()
    assert row is not None
    assert row["amount"] == 1500.0
    assert resp.json()["amount"] == 1500.0


def test_add_income_with_chosen_date(client):
    """Old: test_add_expense_and_income_with_chosen_date (income half)."""
    api = register_and_login(client, "hana-income")
    _cat, inc, acc = first_ids("hana-income")
    resp = api.post(
        "/api/income",
        json={"notes": "old bonus", "amount": "12", "category_id": inc, "account_id": acc, "received_at": "2026-03-14"},
    )
    assert resp.status_code == 200
    assert resp.json()["received_at"] == "2026-03-14"

    conn = get_connection()
    income = conn.execute("SELECT received_at FROM income_entries WHERE notes = 'old bonus'").fetchone()
    conn.close()
    assert income["received_at"][:10] == "2026-03-14"


def test_add_account_and_category(client):
    api = register_and_login(client, "frank")

    resp = api.post("/api/accounts", json={"name": "Savings", "opening_balance": "100"})
    assert resp.status_code == 200
    assert "Savings" in [a["name"] for a in api.get("/api/accounts").json()["items"]]

    resp = api.post("/api/categories", json={"name": "Groceries"})
    assert resp.status_code == 200
    assert "Groceries" in [c["name"] for c in api.get("/api/categories").json()["items"]]
