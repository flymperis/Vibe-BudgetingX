"""Start/stop the two app processes on temp database copies."""

from __future__ import annotations

import os
import subprocess
import sys
import time

import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BACKEND = os.path.join(ROOT, "backend")
OLD_REPO = os.environ.get("VBX_PARITY_OLD_REPO", os.path.join(os.path.dirname(ROOT), "Vibe-Budgeting"))
OLD_PY = os.path.join(HERE, ".venv-old", "Scripts", "python.exe")
NEW_PY = os.path.join(BACKEND, ".venv", "Scripts", "python.exe")
if not os.path.exists(OLD_PY):  # POSIX layout
    OLD_PY = os.path.join(HERE, ".venv-old", "bin", "python")
if not os.path.exists(NEW_PY):
    NEW_PY = os.path.join(BACKEND, ".venv", "bin", "python")

SECRET = "parity-fixed-secret-key"
TZ = "UTC"
# Frozen "today" for both processes. Midday, far from midnight. Override with
# VBX_PARITY_NOW=YYYY-MM-DDTHH:MM:SS.
DEFAULT_NOW = "2026-11-10T12:00:00"


def parity_now() -> str:
    return os.environ.get("VBX_PARITY_NOW", DEFAULT_NOW)


class AppServer:
    def __init__(self, kind: str, db_path: str, port: int, workdir: str):
        assert kind in ("old", "new")
        self.kind, self.db_path, self.port, self.workdir = kind, db_path, port, workdir
        self.base = f"http://127.0.0.1:{port}"
        self.proc: subprocess.Popen | None = None
        self.log_path = os.path.join(workdir, f"{kind}-{port}.log")

    def start(self) -> AppServer:
        db_abs = os.path.normcase(os.path.abspath(self.db_path))
        if db_abs.startswith(os.path.normcase(os.path.abspath(OLD_REPO)) + os.sep):
            raise RuntimeError("refusing to use a database inside the old repo")
        os.makedirs(self.workdir, exist_ok=True)
        env = {
            k: v
            for k, v in os.environ.items()
            if not k.startswith(("VB_", "VBX_", "FLASK_", "TELEGRAM_", "FINNHUB_", "PYTHON"))
        }
        env.update(
            DATABASE_PATH=os.path.abspath(self.db_path),
            FLASK_SECRET_KEY=SECRET,
            TZ=TZ,
            PARITY_NOW=parity_now(),
            PYTHONDONTWRITEBYTECODE="1",
            PYTHONIOENCODING="utf-8",
            ALLOW_REGISTRATION="true",
            VB_BACKUP_KEEP_DAYS="0",
            VB_LEGACY_ADMIN_PASSWORD="parity-legacy-admin",
        )
        if self.kind == "old":
            env["PYTHONPATH"] = OLD_REPO
            cmd = [OLD_PY, "-B", os.path.join(HERE, "launch_old.py"), "--old-repo", OLD_REPO, "--port", str(self.port)]
        else:
            cmd = [NEW_PY, "-B", os.path.join(HERE, "launch_new.py"), "--backend", BACKEND, "--port", str(self.port)]
        self._log = open(self.log_path, "w", encoding="utf-8")
        self.proc = subprocess.Popen(cmd, cwd=self.workdir, env=env, stdout=self._log, stderr=subprocess.STDOUT)
        deadline = time.time() + 60
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError(f"{self.kind} app exited early; see {self.log_path}:\n{self.tail()}")
            try:
                if httpx.get(self.base + "/__parity/ping", timeout=1).status_code == 200:
                    return self
            except httpx.HTTPError:
                pass
            time.sleep(0.2)
        raise RuntimeError(f"{self.kind} app did not start; see {self.log_path}")

    def tail(self, n=40) -> str:
        try:
            with open(self.log_path, encoding="utf-8", errors="replace") as f:
                return "".join(f.readlines()[-n:])
        except OSError:
            return ""

    def stop(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(10)
        self.proc = None
        if getattr(self, "_log", None):
            self._log.close()
            self._log = None


def free_port(start: int = 5601) -> int:
    import socket

    port = start
    while True:
        if port == 5001:
            port += 1
            continue
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                port += 1


def py_ok() -> list[str]:
    missing = [p for p in (OLD_PY, NEW_PY) if not os.path.exists(p)]
    return missing


if __name__ == "__main__":  # smoke test
    import tempfile

    d = tempfile.mkdtemp(prefix="parity-smoke-")
    servers = [AppServer(k, os.path.join(d, f"{k}.db"), free_port(5601 + i * 10), os.path.join(d, k)) for i, k in enumerate(("old", "new"))]
    try:
        for s in servers:
            s.start()
            print(s.kind, "up on", s.port)
    finally:
        for s in servers:
            s.stop()
    sys.exit(0)
