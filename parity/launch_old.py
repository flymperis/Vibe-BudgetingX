"""Run the OLD Flask app (read-only repo) for the parity harness.

Usage (parity/.venv-old interpreter, -B so nothing is written into the old repo):
    python -B launch_old.py --old-repo C:/.../Vibe-Budgeting --port 5601

Environment expected from the harness: DATABASE_PATH (a temp copy, never a file
inside the old repo), FLASK_SECRET_KEY, TZ, PARITY_NOW (ISO, frozen clock).

What this launcher adds, all in this process only (nothing in the old repo):
* fakeenv: network guard, deterministic prices, offline Telegram/Ollama,
  frozen clock (applied to the old modules before app.py's import-time
  init_db and again after the routes are imported).
* background jobs are NOT armed: app.arm_background_jobs() is only called by
  gunicorn's post_fork / `python app.py`; we import app and serve it with
  werkzeug ourselves, so no Telegram poller and no backup scheduler start.
* test-only routes under /__parity/ (localhost only), handled in a
  before_request hook placed ahead of the app's login/CSRF hooks:
    GET /__parity/ping
    GET /__parity/context     -> JSON of the kwargs the last dashboard
                                 render_template() received (exact numbers)
    GET /__parity/login_as/<uid> -> sets the Flask session user (mode d: real
                                 DB copies, where passwords are unknown)
"""

from __future__ import annotations

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--old-repo", required=True)
    ap.add_argument("--port", type=int, required=True)
    args = ap.parse_args()

    old_repo = os.path.abspath(args.old_repo)
    db_path = os.path.abspath(os.environ["DATABASE_PATH"])
    if os.path.normcase(db_path).startswith(os.path.normcase(old_repo + os.sep)):
        raise SystemExit("refusing to run the old app on a database inside the old repo")

    sys.path.insert(0, HERE)
    import fakeenv

    fakeenv.install_network_guard()
    if os.environ.get("PARITY_NOW"):
        fakeenv.set_frozen_now(os.environ["PARITY_NOW"])

    sys.path.insert(0, old_repo)
    # Import every old top-level module first so the clock and the network
    # edges are patched before app.py runs init_db() at import time.
    import importlib

    for name in (
        "config", "db", "prices", "finance", "helpers", "budget", "shared", "tags", "banks",
        "integrations", "telegram_bot", "telegram_notify", "telegram_parse", "telegram_ask",
        "excel_io", "backup",
    ):
        importlib.import_module(name)
    fakeenv.freeze_modules([old_repo])
    fakeenv.patch_prices(sys.modules["prices"])
    fakeenv.patch_telegram(sys.modules["telegram_bot"])
    fakeenv.patch_integrations(sys.modules["integrations"])

    import app as app_module  # runs _prepare_sqlite_storage + init_db
    from routes import dashboard, investments

    fakeenv.freeze_modules([old_repo])
    investments.urlopen = fakeenv.fake_urlopen

    from flask import Response, request, session

    flask_app = app_module.app
    captured = {"ctx": None}
    real_render = dashboard.render_template

    def capturing_render(template, **ctx):
        captured["ctx"] = fakeenv.to_jsonable(ctx)
        return real_render(template, **ctx)

    dashboard.render_template = capturing_render

    def parity_hook():
        path = request.path
        if not path.startswith("/__parity/"):
            return None
        if request.remote_addr not in ("127.0.0.1", "::1"):
            return Response("forbidden", status=403)
        if path == "/__parity/ping":
            return Response("ok")
        if path == "/__parity/context":
            return Response(json.dumps(captured["ctx"]), mimetype="application/json")
        if path.startswith("/__parity/login_as/"):
            uid = int(path.rsplit("/", 1)[1])
            conn = sys.modules["db"].get_connection()
            try:
                row = conn.execute("SELECT username FROM users WHERE id = ?", (uid,)).fetchone()
            finally:
                conn.close()
            if not row:
                return Response("no such user", status=404)
            session.permanent = True
            session["user_id"] = uid
            session["username"] = row["username"]
            return Response("ok")
        return Response("not found", status=404)

    flask_app.before_request_funcs.setdefault(None, []).insert(0, parity_hook)

    from werkzeug.serving import make_server

    server = make_server("127.0.0.1", args.port, flask_app, threaded=False)
    print(f"[parity-old] serving on {args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
