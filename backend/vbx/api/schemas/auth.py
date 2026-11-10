"""Auth contract (docs/ARCHITECTURE.md, fixed)."""

from __future__ import annotations

from pydantic import BaseModel


class UserOut(BaseModel):
    id: int
    username: str


class SessionOut(BaseModel):
    user: UserOut | None
    csrf_token: str
    allow_registration: bool


class AuthOut(BaseModel):
    user: UserOut
    csrf_token: str


# Missing fields are treated as empty strings, like request.form.get(...) or "".
class LoginIn(BaseModel):
    username: str | None = None
    password: str | None = None


class RegisterIn(BaseModel):
    username: str | None = None
    password: str | None = None
    password2: str | None = None
