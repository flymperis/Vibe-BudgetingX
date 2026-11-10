"""Models shared by several domains."""

from __future__ import annotations

from pydantic import BaseModel


class OkOut(BaseModel):
    """Answer for a mutation that has no object to return."""

    ok: bool = True
    message: str | None = None


class IdName(BaseModel):
    id: int
    name: str
