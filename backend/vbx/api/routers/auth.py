"""Auth, ported from the old routes/auth.py (same rules and messages)."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Request

from vbx.core import config
from vbx.core.db import seed_user_defaults
from vbx.core.helpers import get_csrf_token

from ..deps import DB
from ..errors import ApiError
from ..schemas.auth import AuthOut, LoginIn, RegisterIn, SessionOut, UserOut
from ..schemas.common import OkOut
from ..security import check_password_hash, generate_password_hash

router = APIRouter(prefix="/auth", tags=["auth"])


def _session_user(request: Request) -> UserOut | None:
    uid = request.session.get("user_id")
    if not uid:
        return None
    try:
        return UserOut(id=int(uid), username=request.session.get("username") or "")
    except (TypeError, ValueError):
        return None


def _log_in(request: Request, user_id: int, username: str) -> AuthOut:
    request.session["user_id"] = user_id
    request.session["username"] = username
    return AuthOut(user=UserOut(id=user_id, username=username), csrf_token=get_csrf_token(request.session))


@router.get("/session", response_model=SessionOut)
def session_info(request: Request):
    return SessionOut(
        user=_session_user(request),
        csrf_token=get_csrf_token(request.session),
        allow_registration=config.ALLOW_REGISTRATION,
    )


@router.post("/login", response_model=AuthOut)
def login(body: LoginIn, request: Request, conn: DB):
    username = (body.username or "").strip()
    password = body.password or ""
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    # Always run a hash comparison so response timing does not reveal
    # whether the username exists (mitigates user enumeration).
    password_hash = row["password_hash"] if row else config._DUMMY_PASSWORD_HASH
    password_ok = check_password_hash(password_hash, password)
    if row and password_ok:
        return _log_in(request, int(row["id"]), username)
    raise ApiError(401, "Invalid username or password.")


@router.post("/register", response_model=AuthOut)
def register(body: RegisterIn, request: Request, conn: DB):
    if not config.ALLOW_REGISTRATION:
        raise ApiError(403, "Registration is disabled.")
    if _session_user(request) is not None:
        raise ApiError(400, "Already logged in. Log out to create another account.")
    username = (body.username or "").strip()
    password = body.password or ""
    password2 = body.password2 or ""
    if not config._USERNAME_RE.fullmatch(username):
        raise ApiError(400, "Username must be 3–32 characters (letters, digits, . _ -).")
    if len(password) < 8:
        raise ApiError(400, "Password must be at least 8 characters.")
    if password != password2:
        raise ApiError(400, "Passwords do not match.")
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        uid = int(conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"])
        seed_user_defaults(conn, uid)
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise ApiError(400, "That username is already taken.") from None
    return _log_in(request, uid, username)


@router.post("/logout", response_model=OkOut)
def logout(request: Request):
    request.session.pop("user_id", None)
    request.session.pop("username", None)
    return OkOut()
