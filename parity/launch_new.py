"""Run the NEW FastAPI app (backend/vbx) for the parity harness.

Usage (backend/.venv interpreter):
    python -B launch_new.py --backend C:/.../Vibe-BudgetingX/backend --port 5602

Same environment contract and the same fakeenv patches as launch_old.py.
Background jobs stay off (VBX_ENABLE_JOBS is forced to "false"). The SPA is not
served (VBX_STATIC_DIR points at a missing folder) so only /api answers.

Test-only routes (localhost only), inserted ahead of every app route in this
process; nothing is added to backend/:
    GET /__parity/ping
    GET /__parity/login_as/{uid} -> sets the session user (mode d)
"""

# no `from __future__ import annotations`: FastAPI must resolve the Request
# annotation of the routes defined inside main().
import argparse
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", required=True)
    ap.add_argument("--port", type=int, required=True)
    args = ap.parse_args()

    os.environ["VBX_ENABLE_JOBS"] = "false"
    os.environ["VBX_STATIC_DIR"] = os.path.join(HERE, "out", "_no_static_")
    backend = os.path.abspath(args.backend)

    sys.path.insert(0, HERE)
    import fakeenv

    fakeenv.install_network_guard()
    if os.environ.get("PARITY_NOW"):
        fakeenv.set_frozen_now(os.environ["PARITY_NOW"])

    sys.path.insert(0, backend)
    for name in (
        "config", "db", "prices", "finance", "helpers", "budget", "shared", "tags", "banks",
        "integrations", "telegram_bot", "telegram_notify", "telegram_parse", "telegram_ask",
        "excel_io", "backup",
    ):
        importlib.import_module(f"vbx.core.{name}")
    vbx_dir = os.path.join(backend, "vbx")
    fakeenv.freeze_modules([vbx_dir])
    fakeenv.patch_prices(sys.modules["vbx.core.prices"])
    fakeenv.patch_telegram(sys.modules["vbx.core.telegram_bot"])
    fakeenv.patch_integrations(sys.modules["vbx.core.integrations"])

    from vbx.api import main as api_main  # create_app(): init_db, routers
    from vbx.api.services import investments as inv_service

    fakeenv.freeze_modules([vbx_dir])
    inv_service.urlopen = fakeenv.fake_urlopen

    from fastapi import Request
    from fastapi.responses import PlainTextResponse

    app = api_main.app
    db = sys.modules["vbx.core.db"]

    def _local(request: Request) -> bool:
        return request.client is not None and request.client.host in ("127.0.0.1", "::1")

    @app.get("/__parity/ping", include_in_schema=False)
    def ping():
        return PlainTextResponse("ok")

    @app.get("/__parity/login_as/{uid}", include_in_schema=False)
    def login_as(uid: int, request: Request):
        if not _local(request):
            return PlainTextResponse("forbidden", status_code=403)
        conn = db.get_connection()
        try:
            row = conn.execute("SELECT username FROM users WHERE id = ?", (uid,)).fetchone()
        finally:
            conn.close()
        if not row:
            return PlainTextResponse("no such user", status_code=404)
        request.session["user_id"] = uid
        request.session["username"] = row["username"]
        return PlainTextResponse("ok")

    # Put the two parity routes first so no catch-all can shadow them.
    routes = app.router.routes
    mine = [r for r in routes if getattr(r, "path", "").startswith("/__parity/")]
    for r in mine:
        routes.remove(r)
    routes[0:0] = mine

    import uvicorn

    print(f"[parity-new] serving on {args.port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning", workers=1)


if __name__ == "__main__":
    main()
