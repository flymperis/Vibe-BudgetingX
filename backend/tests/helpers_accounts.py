"""Helpers for the income / categories / accounts / transfers / recurring tests."""

from fastapi.testclient import TestClient

from .conftest import first_ids, get_connection, register_and_login


def new_user(app, username):
    """(api, category_id, income_category_id, account_id) for a fresh user on
    their own TestClient, so several users can act in one test."""
    api = register_and_login(TestClient(app), username)
    cat, inc, acc = first_ids(username)
    return api, cat, inc, acc


def row(table, row_id):
    conn = get_connection()
    try:
        return conn.execute(f"SELECT * FROM {table} WHERE id = ?", (row_id,)).fetchone()
    finally:
        conn.close()


def account_id(uid, name):
    conn = get_connection()
    try:
        r = conn.execute("SELECT id FROM accounts WHERE user_id = ? AND name = ?", (uid, name)).fetchone()
    finally:
        conn.close()
    return None if r is None else int(r["id"])
