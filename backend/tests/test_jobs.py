"""Background jobs (vbx/jobs.py): the Telegram poller and the nightly backup
start only when VBX_ENABLE_JOBS=true, at most once per process, with the poll
lock next to the database. Threads are replaced by recorders, so nothing ever
polls Telegram or copies the database here."""

import os
import subprocess
import sys
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from vbx import jobs
from vbx.api import main as vb_main
from vbx.core import backup, db, telegram_bot
from vbx.core.finance import fetch_account_balances_through

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Threads:
    """Stands in for threading.Thread: records what would have started."""

    JOB_THREADS = ("telegram-poller", "nightly-backup")

    def __init__(self):
        self.started = []
        self.real = threading.Thread

    def __call__(self, target=None, args=(), name=None, daemon=None, **kw):
        if name not in self.JOB_THREADS:  # anything else (e.g. the test client) runs for real
            return self.real(target=target, args=args, name=name, daemon=daemon, **kw)
        recorder = self

        class _Thread:
            def start(self):
                recorder.started.append((name, target, args))

        return _Thread()

    def names(self):
        return [name for name, _target, _args in self.started]


@pytest.fixture
def threads(monkeypatch):
    rec = Threads()
    monkeypatch.setattr(threading, "Thread", rec)
    # Fresh per-process guards for every test.
    monkeypatch.setattr(jobs, "_telegram_poller_armed", False)
    monkeypatch.setattr(backup, "_started", False)
    monkeypatch.delenv("VB_BACKUP_KEEP_DAYS", raising=False)
    return rec


def test_nothing_starts_without_the_env_flag(threads, monkeypatch):
    for value in (None, "", "false", "1", "yes"):
        if value is None:
            monkeypatch.delenv("VBX_ENABLE_JOBS", raising=False)
        else:
            monkeypatch.setenv("VBX_ENABLE_JOBS", value)
        assert jobs.jobs_enabled() is False
        assert jobs.start_background_jobs() is False
    assert threads.started == []


def test_jobs_start_once_with_the_poll_lock_next_to_the_database(threads, monkeypatch):
    monkeypatch.setenv("VBX_ENABLE_JOBS", " TRUE ")
    assert jobs.start_background_jobs() is True
    assert jobs.start_background_jobs() is True  # idempotent
    jobs.arm_telegram_poller()
    assert sorted(threads.names()) == ["nightly-backup", "telegram-poller"]

    (_name, target, args) = next(t for t in threads.started if t[0] == "telegram-poller")
    assert target is telegram_bot._poll_loop
    assert args == (
        db.get_connection,
        fetch_account_balances_through,
        os.path.join(os.path.dirname(db.DB_PATH), "telegram_poll.lock"),
    )
    assert jobs.poll_lock_path() == args[2]


def test_backup_stays_off_when_keep_days_is_zero(threads, monkeypatch):
    monkeypatch.setenv("VBX_ENABLE_JOBS", "true")
    monkeypatch.setenv("VB_BACKUP_KEEP_DAYS", "0")
    jobs.start_background_jobs()
    assert threads.names() == ["telegram-poller"]


def test_app_startup_starts_jobs_only_with_the_flag(threads, monkeypatch):
    monkeypatch.delenv("VBX_ENABLE_JOBS", raising=False)
    with TestClient(vb_main.app) as c:
        assert c.get("/api/auth/session").status_code == 200
    assert threads.started == []

    monkeypatch.setenv("VBX_ENABLE_JOBS", "true")
    with TestClient(vb_main.app):
        pass
    with TestClient(vb_main.app):  # a second startup in the same process
        pass
    assert sorted(threads.names()) == ["nightly-backup", "telegram-poller"]


def test_a_second_poller_backs_off_when_the_lock_is_taken(tmp_path, monkeypatch):
    """Exactly one process polls: with the lock held elsewhere, _poll_loop
    returns before reading the config or calling Telegram."""
    lock_path = str(tmp_path / "telegram_poll.lock")
    calls = []
    monkeypatch.setattr(telegram_bot, "_telegram_api", lambda *a: calls.append(a) or (None, "no"))
    monkeypatch.setattr(telegram_bot, "_telegram_api_get", lambda *a: calls.append(a) or (None, "no"))

    def never(*_a):
        raise AssertionError("the second poller must not open the database")

    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR)
    try:
        if telegram_bot.fcntl is not None:
            telegram_bot.fcntl.flock(fd, telegram_bot.fcntl.LOCK_EX | telegram_bot.fcntl.LOCK_NB)
        telegram_bot._poll_loop(never, fetch_account_balances_through, lock_path)
    finally:
        os.close(fd)
    assert calls == []


def test_backup_command_line_as_a_module(tmp_path):
    """`python -m vbx.core.backup --label predeploy` (old: `python -m backup`)."""
    import sqlite3

    database = tmp_path / "database.db"
    conn = sqlite3.connect(database)
    conn.execute("CREATE TABLE t (x INTEGER)")
    conn.execute("INSERT INTO t VALUES (1)")
    conn.commit()
    conn.close()
    env = {
        **os.environ,
        "DATABASE_PATH": str(database),
        "VB_BACKUP_DIR": str(tmp_path / "backups"),
        "PYTHONIOENCODING": "utf-8",
    }
    env.pop("VBX_ENABLE_JOBS", None)
    out = subprocess.run(
        [sys.executable, "-m", "vbx.core.backup", "--label", "predeploy"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert out.returncode == 0, out.stderr
    printed = out.stdout.strip()
    assert os.path.dirname(printed) == str(tmp_path / "backups")
    match = backup.SNAPSHOT_RE.match(os.path.basename(printed))
    assert match and match.group(3) == "predeploy"
    copy = sqlite3.connect(printed)
    assert copy.execute("SELECT x FROM t").fetchall() == [(1,)]
    copy.close()
