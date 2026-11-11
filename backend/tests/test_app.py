"""App wiring: error format, SPA serving, router discovery, boot steps."""

import sqlite3

from fastapi.testclient import TestClient

from vbx.api import main as vb_main
from vbx.core import db as vb_db

from .conftest import csrf_token, get_connection, register_and_login


def _schema(conn):
    return sorted(
        (r[0], r[1], r[2] or "")
        for r in conn.execute("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")
    )


def test_unknown_api_path_is_json_404(client):
    resp = client.get("/api/does-not-exist")
    assert resp.status_code == 404
    assert resp.json() == {"detail": "Not Found"}


def test_validation_errors_are_400_with_a_readable_detail(client):
    api = register_and_login(client, "errors-user")
    resp = api.put("/api/expenses/not-a-number", json={})
    assert resp.status_code == 400
    assert "expense_id" in resp.json()["detail"]
    resp = api.post("/api/expenses", content=b"{not json", headers={"Content-Type": "application/json"})
    assert resp.status_code == 400
    assert isinstance(resp.json()["detail"], str)


def test_routers_are_discovered_under_api(app):
    paths = set(app.openapi()["paths"])
    assert {"/api/auth/session", "/api/auth/login", "/api/bootstrap", "/api/expenses"} <= paths


def test_spa_is_served_with_index_fallback(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>spa</title>", encoding="utf-8")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    spa = TestClient(vb_main.create_app(static_dir=tmp_path))

    assert spa.get("/").text.startswith("<!doctype html>")
    assert spa.get("/expenses/123").text.startswith("<!doctype html>")  # client-side route
    resp = spa.get("/assets/app.js")
    assert resp.status_code == 200 and resp.text == "console.log(1)"
    assert spa.get("/../conftest.py").text.startswith("<!doctype html>")  # never outside the folder
    resp = spa.get("/api/nope")
    assert resp.status_code == 404 and resp.json() == {"detail": "Not Found"}
    assert spa.get("/api/auth/session").status_code == 200
    assert spa.get("/static/banks/eurobank.png").headers["content-type"] == "image/png"


def test_pwa_files_are_served_without_login_with_their_types(tmp_path):
    """Old test_pwa_manifest.py::test_manifest_served_without_login: the manifest
    is public (the login screen links it) and typed application/manifest+json,
    also on Windows where the registry does not know .webmanifest."""
    (tmp_path / "index.html").write_text("<!doctype html>", encoding="utf-8")
    (tmp_path / "manifest.webmanifest").write_text('{"name": "Vibe Budgeting"}', encoding="utf-8")
    (tmp_path / "icons").mkdir()
    (tmp_path / "icons" / "apple-touch-icon.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    (tmp_path / "favicon.ico").write_bytes(b"\x00\x00\x01\x00")
    spa = TestClient(vb_main.create_app(static_dir=tmp_path))

    resp = spa.get("/manifest.webmanifest")  # no session cookie
    assert resp.status_code == 200
    assert resp.headers["content-type"].split(";")[0] == "application/manifest+json"
    assert resp.json()["name"] == "Vibe Budgeting"
    assert spa.get("/icons/apple-touch-icon.png").headers["content-type"] == "image/png"
    assert spa.get("/favicon.ico").headers["content-type"] == "image/x-icon"


def test_no_spa_folder_means_no_catch_all(client):
    assert client.get("/").status_code == 404


def test_init_db_is_idempotent_and_keeps_the_schema(client):
    """Boot runs init_db() every time; a second run must not change the schema."""
    conn = get_connection()
    before = _schema(conn)
    conn.close()
    vb_db.init_db()
    vb_main.create_app()
    conn = get_connection()
    after = _schema(conn)
    conn.close()
    assert before == after


def test_init_db_migrates_a_pre_multiuser_database(tmp_path, monkeypatch):
    """An old single-user database (no users table, `item` column, unsigned
    expenses) opens: the migrations add users/user_id and the newer columns.

    Expense rows are left out on purpose: with foreign keys on, the old
    migrate_users_multitenancy cannot DROP a categories table that expense rows
    still reference (old-app behaviour, kept unchanged; see PORTING_NOTES)."""
    path = tmp_path / "legacy.db"
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
        CREATE TABLE income_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
        CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
                               opening_balance REAL NOT NULL DEFAULT 0);
        CREATE TABLE expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT NOT NULL DEFAULT '',
                               amount REAL NOT NULL CHECK (amount >= 0), category_id INTEGER NOT NULL,
                               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        INSERT INTO categories (name) VALUES ('Food');
        INSERT INTO accounts (name, opening_balance) VALUES ('Wallet', 12.5);
        """
    )
    conn.commit()
    conn.close()
    monkeypatch.setattr(vb_db, "DB_PATH", str(path))
    monkeypatch.setattr(vb_db, "_wal_attempted", False)
    vb_db.init_db()
    conn = vb_db.get_connection()
    first = _schema(conn)
    conn.close()
    vb_db.init_db()  # and again: idempotent

    conn = vb_db.get_connection()
    assert _schema(conn) == first
    users = [u["username"] for u in conn.execute("SELECT username FROM users")]
    cats = [(r["name"], r["user_id"]) for r in conn.execute("SELECT name, user_id FROM categories ORDER BY id")]
    wallet = conn.execute(
        "SELECT user_id, opening_balance, account_type FROM accounts WHERE name = 'Wallet'"
    ).fetchone()
    expense_cols = {r["name"] for r in conn.execute("PRAGMA table_info(expenses)")}
    expenses_sql = conn.execute("SELECT sql FROM sqlite_master WHERE name = 'expenses'").fetchone()["sql"]
    conn.close()
    assert users == ["admin"]
    assert ("Food", 1) in cats
    assert (wallet["user_id"], wallet["opening_balance"], wallet["account_type"]) == (1, 12.5, "bank")
    assert {"notes", "account_id", "spent_at", "user_id"} <= expense_cols and "item" not in expense_cols
    assert "amount >= 0" not in expenses_sql  # spending is stored signed


def test_csrf_token_survives_login(client, app):
    """The SPA fetches the token once from /api/auth/session; login keeps it."""
    token = csrf_token(client)
    register_and_login(client, "token-keeper")
    assert csrf_token(client) == token
