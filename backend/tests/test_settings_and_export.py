"""Settings sections, integrations save and Excel downloads. Ported from the
old tests/test_settings_and_export.py: the pages became JSON endpoints."""

import pytest

from vbx.core import integrations

from .conftest import get_connection, register_and_login, user_id


@pytest.fixture(autouse=True)
def _no_telegram(monkeypatch):
    """GET /api/settings/integrations asks Telegram for the bot name when a
    bot is configured; never let that reach the network."""
    from vbx.core import telegram_bot

    monkeypatch.setattr(telegram_bot, "_telegram_api", lambda method, payload, token: (None, "offline"))


def test_settings_sections_load(client):
    """Old: every ?panel=settings&settings_section=<s> page answered 200. New:
    each section's data source answers 200 — general is client-only (theme),
    banks/expenses/income are the accounts and category lists, integrations
    is /api/settings/integrations, export and migration are the two downloads."""
    api = register_and_login(client, "settingstester")
    assert api.get("/api/bootstrap").status_code == 200
    for path in ("/api/accounts", "/api/categories", "/api/income-categories"):
        assert api.get(path).status_code == 200, path
    assert api.get("/api/settings/integrations").status_code == 200
    assert api.get("/api/export/excel").status_code == 200
    assert api.get("/api/export/migration-template").status_code == 200


def test_income_category_add_edit_delete(client):
    api = register_and_login(client, "inccattester")
    uid = user_id("inccattester")

    resp = api.post("/api/income-categories", json={"name": "Freelance"})
    assert resp.status_code == 200, resp.text

    conn = get_connection()
    row = conn.execute("SELECT id FROM income_categories WHERE name = 'Freelance' AND user_id = ?", (uid,)).fetchone()
    conn.close()
    assert row is not None
    cat_id = row["id"]

    resp = api.put(f"/api/income-categories/{cat_id}", json={"name": "Consulting"})
    assert resp.status_code == 200, resp.text

    conn = get_connection()
    row = conn.execute("SELECT name FROM income_categories WHERE id = ?", (cat_id,)).fetchone()
    conn.close()
    assert row["name"] == "Consulting"

    resp = api.delete(f"/api/income-categories/{cat_id}")
    assert resp.status_code == 200, resp.text

    conn = get_connection()
    assert conn.execute("SELECT id FROM income_categories WHERE id = ?", (cat_id,)).fetchone() is None
    conn.close()


def test_account_edit_and_delete(client):
    api = register_and_login(client, "accttester")
    uid = user_id("accttester")

    api.post("/api/accounts", json={"name": "Brokerage", "opening_balance": "500"})
    conn = get_connection()
    row = conn.execute(
        "SELECT id, opening_balance FROM accounts WHERE name = 'Brokerage' AND user_id = ?", (uid,)
    ).fetchone()
    conn.close()
    assert row is not None
    assert row["opening_balance"] == 500.0
    acct_id = row["id"]

    resp = api.put(f"/api/accounts/{acct_id}", json={"name": "Brokerage EU", "opening_balance": "750.25"})
    assert resp.status_code == 200, resp.text

    conn = get_connection()
    row = conn.execute("SELECT name, opening_balance FROM accounts WHERE id = ?", (acct_id,)).fetchone()
    conn.close()
    assert row["name"] == "Brokerage EU"
    assert row["opening_balance"] == 750.25

    resp = api.delete(f"/api/accounts/{acct_id}")
    assert resp.status_code == 200, resp.text

    conn = get_connection()
    assert conn.execute("SELECT id FROM accounts WHERE id = ?", (acct_id,)).fetchone() is None
    conn.close()


def test_integrations_save(client):
    api = register_and_login(client, "integrationstester")
    uid = user_id("integrationstester")

    resp = api.put(
        "/api/settings/integrations/ai",
        json={
            "ai_provider": "ollama",
            "ai_enabled": "1",
            "ai_base_url": "http://127.0.0.1:11434",
            "ai_model": "llama3",
            "ai_timeout": "30",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["message"] == "Integration settings saved."

    conn = get_connection()
    saved = integrations.get_user_integrations(conn, uid)
    conn.close()
    assert saved["ai_enabled"] is True
    assert saved["ai_base_url"] == "http://127.0.0.1:11434"
    assert saved["ai_model"] == "llama3"


def test_excel_export_downloads(client):
    api = register_and_login(client, "exporttester")

    resp = api.get("/api/export/excel")
    assert resp.status_code == 200
    assert "spreadsheetml" in resp.headers["Content-Type"]
    assert resp.content[:2] == b"PK"  # xlsx is a zip archive

    resp = api.get("/api/export/migration-template")
    assert resp.status_code == 200
    assert resp.content[:2] == b"PK"
