"""Background jobs: the Telegram poller and the nightly database backup.

Ported from the old app.py::arm_background_jobs / arm_telegram_poller, which
gunicorn's post_fork called in every worker. Here the app's startup (lifespan)
calls start_background_jobs() only when VBX_ENABLE_JOBS=true, so dev servers
and tests never poll Telegram or start the backup thread.

- Telegram: telegram_bot.start_poller(get_connection,
  fetch_account_balances_through, <db dir>/telegram_poll.lock). Started at
  most once per process (same double-checked guard as the old app); across
  processes/workers the lock file (an fcntl lock on Linux) lets exactly one
  poll.
- Backup: backup.start_scheduler(DB_PATH), which has its own once-per-process
  guard and stays off when VB_BACKUP_KEEP_DAYS=0.
"""

from __future__ import annotations

import os
import threading

from vbx.core import backup, db, telegram_bot
from vbx.core.finance import fetch_account_balances_through


def jobs_enabled() -> bool:
    return os.environ.get("VBX_ENABLE_JOBS", "").strip().lower() == "true"


def poll_lock_path() -> str:
    """telegram_poll.lock next to the database, as in the old app."""
    return os.path.join(os.path.dirname(db.DB_PATH) or ".", "telegram_poll.lock")


_telegram_poller_armed = False
_telegram_poller_guard = threading.Lock()


def arm_telegram_poller() -> None:
    global _telegram_poller_armed
    if _telegram_poller_armed:
        return
    with _telegram_poller_guard:
        if _telegram_poller_armed:
            return
        telegram_bot.start_poller(db.get_connection, fetch_account_balances_through, poll_lock_path())
        _telegram_poller_armed = True


def start_background_jobs() -> bool:
    """Start the per-process background threads: the Telegram poller and the
    nightly backup. Does nothing (returns False) unless VBX_ENABLE_JOBS=true.
    Safe to call more than once."""
    if not jobs_enabled():
        return False
    arm_telegram_poller()
    backup.start_scheduler(db.DB_PATH)
    return True
