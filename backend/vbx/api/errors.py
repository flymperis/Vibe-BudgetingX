"""Every error leaves the API as {"detail": "<human message>"}.

Raise ApiError(status, message) from routers and dependencies. Request
validation errors (FastAPI's 422) are answered with 400 and one readable line.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _location(loc) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path", "header", "cookie")]
    return ".".join(parts)


def validation_message(exc: RequestValidationError) -> str:
    messages = []
    for err in exc.errors():
        where = _location(err.get("loc", ()))
        msg = str(err.get("msg") or "Invalid value")
        messages.append(f"{where}: {msg}" if where else msg)
    return "; ".join(messages) or "Invalid request."


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_request: Request, exc: ApiError):
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_request: Request, exc: RequestValidationError):
        return JSONResponse({"detail": validation_message(exc)}, status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_request: Request, exc: StarletteHTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return JSONResponse({"detail": detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))
