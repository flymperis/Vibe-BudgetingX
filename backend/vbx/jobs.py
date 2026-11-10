"""Background jobs (Telegram poller, nightly backup).

STUB: a later task fills this in. It is called from the app's startup only when
VBX_ENABLE_JOBS=true. The old app started these from gunicorn's post_fork via
app.arm_background_jobs(): telegram_bot.start_poller(get_connection,
fetch_account_balances_through, <db dir>/telegram_poll.lock) and
backup.start_scheduler(DB_PATH).
"""

from __future__ import annotations

import os


def jobs_enabled() -> bool:
    return os.environ.get("VBX_ENABLE_JOBS", "").strip().lower() == "true"


def start_background_jobs() -> None:
    """TODO(jobs task): start the Telegram poller and the backup scheduler."""
    return None
