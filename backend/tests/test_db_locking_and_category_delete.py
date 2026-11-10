"""Connection settings and locking (old tests/test_db_locking_and_category_delete.py).

Connection settings, concurrency and the leaked-transaction demonstration,
deleting a category that is still referenced (refused with a 400 and the old
message instead of a flash), plus a check that the API's per-request
connection is always closed.
"""

import sqlite3
import threading

import pytest

from vbx.api import deps
from vbx.core import db as vb_db

from .conftest import get_connection, register_and_login

# --------------------------------------------------------------------------
# 1. Connection settings
# --------------------------------------------------------------------------


def test_busy_timeout_is_actually_applied():
    """connect(timeout=) is supposed to set this; assert it rather than assume."""
    conn = get_connection()
    try:
        assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == vb_db.BUSY_TIMEOUT_MS
    finally:
        conn.close()


def test_foreign_keys_stay_on():
    conn = get_connection()
    try:
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    finally:
        conn.close()


def test_journal_mode_is_wal_or_a_working_fallback():
    """WAL needs shared memory, which some networked filesystems (PythonAnywhere,
    NFS, SMB) cannot provide. Falling back is fine; crashing or ending up in a
    broken mode is not."""
    conn = get_connection()
    try:
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0].lower()
    finally:
        conn.close()
    assert mode in {"wal", "delete", "truncate", "persist"}


def test_request_connection_has_the_same_settings_and_is_always_closed(client, monkeypatch):
    """get_db hands out an old-style connection and closes it even when the
    endpoint fails, so a failed request can never leave the file locked."""
    opened = []
    real = vb_db.get_connection

    def tracking(*args, **kwargs):
        conn = real(*args, **kwargs)
        opened.append(conn)
        return conn

    monkeypatch.setattr(vb_db, "get_connection", tracking)
    gen = deps.get_db()
    conn = next(gen)
    assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == vb_db.BUSY_TIMEOUT_MS
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    with pytest.raises(RuntimeError):
        gen.throw(RuntimeError("endpoint blew up"))
    with pytest.raises(sqlite3.ProgrammingError):
        conn.execute("SELECT 1")  # closed

    api = register_and_login(client, "lock-closed")
    opened.clear()
    api.post("/api/expenses", json={"category_id": "x", "account_id": "y", "amount": "1"})  # 400 inside
    api.get("/api/bootstrap")
    assert opened, "requests did not use get_db"
    for c in opened:
        with pytest.raises(sqlite3.ProgrammingError):
            c.execute("SELECT 1")


# --------------------------------------------------------------------------
# 3. The lock itself
# --------------------------------------------------------------------------


def test_concurrent_writers_do_not_deadlock():
    """Two writers overlapping on the same file. Serialising is fine — raising
    OperationalError is not."""
    errors = []
    barrier = threading.Barrier(2, timeout=10)

    def writer(tag):
        try:
            barrier.wait()
            for i in range(10):
                conn = get_connection()
                try:
                    conn.execute(
                        "INSERT INTO users (username, password_hash) VALUES (?, 'x')",
                        (f"conc-{tag}-{i}",),
                    )
                    conn.commit()
                finally:
                    conn.close()
        except Exception as exc:  # noqa: BLE001 - the point is to surface any of them
            errors.append(f"{tag}: {type(exc).__name__}: {exc}")

    threads = [threading.Thread(target=writer, args=(t,)) for t in ("a", "b")]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
        assert not t.is_alive(), "writer thread hung — likely a lock"

    assert not errors, f"concurrent writes failed: {errors}"


def test_a_leaked_transaction_blocks_writers_in_every_journal_mode(tmp_path):
    """Documents why closing the connection is the fix and WAL is not.

    WAL stops readers blocking writers; it does nothing about a write
    transaction that was never closed.
    """
    results = {}
    for mode in ("DELETE", "WAL"):
        path = tmp_path / f"{mode}.db"
        setup = sqlite3.connect(path)
        setup.execute(f"PRAGMA journal_mode = {mode}")
        setup.executescript(
            "CREATE TABLE parent (id INTEGER PRIMARY KEY);"
            "CREATE TABLE child (id INTEGER PRIMARY KEY,"
            " parent_id INTEGER NOT NULL REFERENCES parent(id));"
            "INSERT INTO parent (id) VALUES (1);"
            "INSERT INTO child (id, parent_id) VALUES (1, 1);"
        )
        setup.commit()
        setup.close()

        held = sqlite3.connect(path, timeout=0.5)
        held.execute("PRAGMA foreign_keys = ON")
        with pytest.raises(sqlite3.IntegrityError):
            held.execute("DELETE FROM parent WHERE id = 1")  # leaves a transaction open

        other = sqlite3.connect(path, timeout=0.5)
        try:
            other.execute("INSERT INTO parent (id) VALUES (2)")
            other.commit()
            results[mode] = "unblocked"
        except sqlite3.OperationalError:
            results[mode] = "blocked"
        finally:
            other.close()

        held.rollback()  # what the fix's finally/rollback does
        held.close()

        after = sqlite3.connect(path, timeout=0.5)
        try:
            after.execute("INSERT INTO parent (id) VALUES (3)")
            after.commit()
            results[mode + "-after-close"] = "unblocked"
        except sqlite3.OperationalError:
            results[mode + "-after-close"] = "blocked"
        finally:
            after.close()

    assert results["DELETE"] == "blocked"
    assert results["WAL"] == "blocked", "WAL alone does not rescue a leaked transaction"
    assert results["DELETE-after-close"] == "unblocked"
    assert results["WAL-after-close"] == "unblocked"


# --------------------------------------------------------------------------
# 2. Deleting a category that is still referenced
# --------------------------------------------------------------------------


def _ids(username):
    conn = get_connection()
    uid = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()["id"]
    cat = conn.execute("SELECT id, name FROM categories WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()
    inc = conn.execute(
        "SELECT id, name FROM income_categories WHERE user_id = ? ORDER BY id LIMIT 1",
        (uid,),
    ).fetchone()
    acc = conn.execute("SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()["id"]
    conn.close()
    return uid, cat, inc, acc


def test_deleting_category_with_expenses_is_refused_not_a_500(client):
    api = register_and_login(client, "lock-delete-expense")
    uid, cat, _inc, acc = _ids("lock-delete-expense")

    resp = api.post(
        "/api/expenses",
        json={"notes": "coffee", "amount": "-4.20", "category_id": cat["id"], "account_id": acc},
    )
    assert resp.status_code == 200

    resp = api.delete(f"/api/categories/{cat['id']}")
    assert resp.status_code == 400, "must not 500"  # old: 200 page with a flash-error
    detail = resp.json()["detail"]
    assert "still has" in detail and "1 expense" in detail
    assert detail == f"“{cat['name']}” still has 1 expense. Reassign or delete it first."

    # and the category survives
    conn = get_connection()
    try:
        assert conn.execute("SELECT COUNT(*) FROM categories WHERE id = ?", (cat["id"],)).fetchone()[0] == 1
    finally:
        conn.close()


def test_deleting_income_category_with_entries_is_refused(client):
    api = register_and_login(client, "lock-delete-income")
    uid, _cat, inc, acc = _ids("lock-delete-income")

    api.post(
        "/api/income",
        json={"notes": "salary", "amount": "1200", "category_id": inc["id"], "account_id": acc},
    )

    resp = api.delete(f"/api/income-categories/{inc['id']}")
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "still has" in detail and "1 income entry" in detail
    # never the naive plural
    assert "income entrys" not in detail


def test_unused_category_still_deletes(client):
    """The guard must not block the normal case."""
    api = register_and_login(client, "lock-delete-ok")

    api.post("/api/categories", json={"name": "Disposable"})
    conn = get_connection()
    row = conn.execute("SELECT id FROM categories WHERE name = 'Disposable'").fetchone()
    conn.close()
    assert row is not None

    resp = api.delete(f"/api/categories/{row['id']}")
    assert resp.status_code == 200

    conn = get_connection()
    try:
        assert conn.execute("SELECT COUNT(*) FROM categories WHERE id = ?", (row["id"],)).fetchone()[0] == 0
    finally:
        conn.close()


def test_recurring_rule_blocks_delete_even_though_it_has_no_foreign_key(client):
    """recurring_entries.category_id has no FK, so this would not raise — the
    rows would just be silently orphaned. Blocked deliberately."""
    api = register_and_login(client, "lock-delete-recurring")
    uid, cat, _inc, acc = _ids("lock-delete-recurring")

    conn = get_connection()
    conn.execute(
        "INSERT INTO recurring_entries"
        " (user_id, entry_type, amount, category_id, account_id, day_of_month, notes, enabled)"
        " VALUES (?, 'expense', 50.0, ?, ?, 1, '', 1)",
        (uid, cat["id"], acc),
    )
    conn.commit()
    conn.close()

    resp = api.delete(f"/api/categories/{cat['id']}")
    assert resp.status_code == 400
    assert "1 recurring rule" in resp.json()["detail"]


def test_refused_delete_does_not_leave_the_database_locked(client):
    """The regression that matters: after a refused delete, the next write must
    still go through. Before the fix this raised OperationalError."""
    api = register_and_login(client, "lock-no-leak")
    uid, cat, _inc, acc = _ids("lock-no-leak")

    api.post("/api/expenses", json={"notes": "x", "amount": "-1", "category_id": cat["id"], "account_id": acc})
    assert api.delete(f"/api/categories/{cat['id']}").status_code == 400

    # the write that used to fail with "database is locked"
    resp = api.post("/api/categories", json={"name": "AfterRefusal"})
    assert resp.status_code == 200

    conn = get_connection()
    try:
        assert (
            conn.execute(
                "SELECT COUNT(*) FROM categories WHERE name = 'AfterRefusal' AND user_id = ?",
                (uid,),
            ).fetchone()[0]
            == 1
        )
    finally:
        conn.close()
