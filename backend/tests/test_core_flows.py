"""Core flows (old tests/test_core_flows.py): register, log out, the
long-lived login cookie, and the expense add/edit/delete cycle. Income,
accounts/categories and per-panel loading are PENDING with their routers."""

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
    income half is PENDING with the income router)."""
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
