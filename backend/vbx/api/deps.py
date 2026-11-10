"""Shared FastAPI dependencies: database connection, logged-in user, CSRF."""

from __future__ import annotations

import hmac
import sqlite3
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from vbx.core import db
from vbx.core.config import _CSRF_SAFE_METHODS

from .errors import ApiError

CSRF_HEADER = "X-CSRF-Token"
CSRF_ERROR = "Invalid or missing CSRF token."
NOT_LOGGED_IN = "Not logged in."


def get_db() -> Iterator[sqlite3.Connection]:
    """One connection per request (old db.get_connection(): WAL, foreign keys,
    busy timeout), always closed. Uncommitted work is rolled back by close().

    check_same_thread=False because FastAPI may open the connection, run the
    endpoint and close it on different threadpool threads; it is still only
    ever used by one request at a time."""
    conn = db.get_connection(check_same_thread=False)
    try:
        yield conn
    finally:
        conn.close()


@dataclass(frozen=True)
class CurrentUser:
    id: int
    username: str


def current_user(request: Request) -> CurrentUser:
    """The old app's _require_login: a session user_id that is an int, else 401."""
    uid = request.session.get("user_id")
    if not uid:
        raise ApiError(401, NOT_LOGGED_IN)
    try:
        user_id = int(uid)
    except (TypeError, ValueError):
        request.session.pop("user_id", None)
        request.session.pop("username", None)
        raise ApiError(401, NOT_LOGGED_IN) from None
    return CurrentUser(id=user_id, username=request.session.get("username") or "")


def csrf_protect(request: Request) -> None:
    """Applied to every route. Non-GET/HEAD/OPTIONS/TRACE requests under /api
    must send X-CSRF-Token equal to the token in the session (the old app's
    _csrf_protect, minus the form-field variant)."""
    if request.method in _CSRF_SAFE_METHODS:
        return
    if not request.url.path.startswith("/api"):
        return
    expected = request.session.get("_csrf_token")
    submitted = request.headers.get(CSRF_HEADER, "")
    if not expected or not submitted or not hmac.compare_digest(str(expected), str(submitted)):
        raise ApiError(403, CSRF_ERROR)


DB = Annotated[sqlite3.Connection, Depends(get_db)]
User = Annotated[CurrentUser, Depends(current_user)]
