"""Session cookie settings, secret key and password hashing.

The secret key is resolved exactly like the old app's _resolve_secret_key():
FLASK_SECRET_KEY if set, otherwise a random key persisted in a `secret_key`
file next to the database.
"""

from __future__ import annotations

import os
import secrets
import sys

from werkzeug.security import check_password_hash, generate_password_hash

from vbx.core import db
from vbx.core.config import _env_flag

__all__ = [
    "SESSION_COOKIE",
    "SESSION_MAX_AGE",
    "check_password_hash",
    "generate_password_hash",
    "resolve_secret_key",
    "secure_cookies",
]

SESSION_COOKIE = "vbx_session"
SESSION_MAX_AGE = 365 * 24 * 60 * 60  # logins are long-lived, as in the old app (PERMANENT_SESSION_LIFETIME)


def secure_cookies() -> bool:
    """Secure flag on the session cookie; enable only behind HTTPS."""
    return _env_flag("VB_SECURE_COOKIES", False)


def resolve_secret_key() -> str:
    """FLASK_SECRET_KEY if set; otherwise a random key persisted next to the
    DB so sessions survive restarts, instead of a hardcoded fallback value."""
    env_key = os.environ.get("FLASK_SECRET_KEY", "").strip()
    if env_key:
        return env_key

    key_path = os.path.join(os.path.dirname(db.DB_PATH) or ".", "secret_key")
    try:
        with open(key_path, encoding="utf-8") as f:
            existing = f.read().strip()
        if existing:
            return existing
    except FileNotFoundError:
        pass

    generated = secrets.token_hex(32)
    os.makedirs(os.path.dirname(key_path) or ".", exist_ok=True)
    try:
        fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(generated)
    except FileExistsError:
        with open(key_path, encoding="utf-8") as f:
            generated = f.read().strip()
    print(
        f"[vibe-budgeting] WARNING: FLASK_SECRET_KEY not set; generated and "
        f"persisted a random key at {key_path!r}. Set FLASK_SECRET_KEY "
        "explicitly in production (see README).",
        file=sys.stderr,
    )
    return generated
