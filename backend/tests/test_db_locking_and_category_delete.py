"""Connection settings and locking (old tests/test_db_locking_and_category_delete.py).

The category-delete tests of the old file are PENDING with the categories
router; the connection, concurrency and leaked-transaction tests are here, plus
a check that the API's per-request connection is always closed.
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
