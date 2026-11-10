"""Helpers for the budget / home / summary / yearly tests (old tests/test_budget.py
helpers, plus direct-SQL stand-ins for other domains' routes)."""

from __future__ import annotations

import io

from openpyxl import load_workbook

from vbx.core import budget
from vbx.core.excel_io import _build_export_workbook, _run_import_workbook

from .conftest import get_connection


def user(username):
    """(user_id, {category name: id}, first account id), like the old _user()."""
    conn = get_connection()
    try:
        uid = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()["id"]
        cats = {
            row["name"]: row["id"] for row in conn.execute("SELECT id, name FROM categories WHERE user_id = ?", (uid,))
        }
        account_id = conn.execute("SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()[
            "id"
        ]
    finally:
        conn.close()
    return uid, cats, account_id


def spend(uid, category_id, account_id, amount, day):
    conn = get_connection()
    conn.execute(
        "INSERT INTO expenses (user_id, notes, amount, category_id, account_id, spent_at) VALUES (?, '', ?, ?, ?, ?)",
        (uid, -abs(amount), category_id, account_id, day),
    )
    conn.commit()
    conn.close()


def refund(uid, category_id, account_id, amount, day):
    """A refund: stored amount is positive (spent = -SUM(amount))."""
    conn = get_connection()
    conn.execute(
        "INSERT INTO expenses (user_id, notes, amount, category_id, account_id, spent_at) VALUES (?, '', ?, ?, ?, ?)",
        (uid, abs(amount), category_id, account_id, day),
    )
    conn.commit()
    conn.close()


def receive(uid, category_id, account_id, amount, day):
    conn = get_connection()
    conn.execute(
        "INSERT INTO income_entries (user_id, notes, amount, category_id, account_id, received_at)"
        " VALUES (?, '', ?, ?, ?, ?)",
        (uid, amount, category_id, account_id, day),
    )
    conn.commit()
    conn.close()


def core_summary(uid, ym):
    """budget.budget_for_month straight from core (the old _summary())."""
    conn = get_connection()
    try:
        return budget.budget_for_month(conn, uid, ym)
    finally:
        conn.close()


def call(fn, *args, **kwargs):
    """Run a vbx.core.budget function on a fresh connection and commit."""
    conn = get_connection()
    try:
        result = fn(conn, *args, **kwargs)
        conn.commit()
        return result
    finally:
        conn.close()


def add_category(uid, name):
    """Stand-in for the old POST /categories/add (INSERT OR IGNORE)."""
    conn = get_connection()
    conn.execute("INSERT OR IGNORE INTO categories(user_id, name) VALUES (?, ?)", (uid, name))
    conn.commit()
    row = conn.execute("SELECT id FROM categories WHERE user_id = ? AND name = ?", (uid, name)).fetchone()
    conn.close()
    return int(row["id"])


def delete_category(uid, category_id):
    """Stand-in for the old POST /categories/<id>/delete on an unused category."""
    conn = get_connection()
    cur = conn.execute("DELETE FROM categories WHERE id = ? AND user_id = ?", (category_id, uid))
    conn.commit()
    conn.close()
    assert cur.rowcount == 1


def export_bytes(uid) -> bytes:
    """What the old GET /export/excel returned (excel_io._build_export_workbook)."""
    conn = get_connection()
    try:
        wb = _build_export_workbook(conn, uid)
    finally:
        conn.close()
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def import_bytes(uid, data: bytes, *, replace_movements=False, sync_opening_balances=False) -> list[str]:
    """What the old POST /import/excel ran; returns the error list ([] = success,
    the old "Import failed. <errors>" flash otherwise)."""
    wb = load_workbook(io.BytesIO(data), data_only=True)
    return _run_import_workbook(wb, replace_movements, sync_opening_balances, uid)


def workbook_bytes(wb) -> bytes:
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
