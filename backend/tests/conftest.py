"""Shared fixtures. Mirrors the old tests/conftest.py: a temporary database and
fixed secret set before the app is imported, registration allowed, and every
external price lookup stubbed so tests never touch the network.

Typical test:

    def test_something(client):
        api = register_and_login(client, "alice")
        boot = api.get("/api/bootstrap").json()
        resp = api.post("/api/expenses", json={...})   # CSRF header added for you
"""

import os
import sys
import tempfile

import pytest

_db_fd, _db_path = tempfile.mkstemp(prefix="vbx-test-", suffix=".db")
os.close(_db_fd)
os.remove(_db_path)
os.environ["DATABASE_PATH"] = _db_path
os.environ["FLASK_SECRET_KEY"] = "test-secret-key"
os.environ["ALLOW_REGISTRATION"] = "true"
os.environ.pop("VBX_ENABLE_JOBS", None)
# Never serve a real frontend build from tests; SPA tests pass their own dir.
os.environ["VBX_STATIC_DIR"] = os.path.join(tempfile.gettempdir(), "vbx-test-no-static-dir")

from fastapi.testclient import TestClient  # noqa: E402

from vbx.api import main as vb_main  # noqa: E402  (must import after env vars are set)
from vbx.core import db as vb_db  # noqa: E402
from vbx.core import prices  # noqa: E402

DEFAULT_PASSWORD = "correct-horse-battery-staple"

_NETWORK_PRICE_FUNCS = (
    "fetch_finnhub_quotes",
    "fetch_coingecko_prices",
    "fetch_stock_month_close_usd",
    "fetch_coingecko_history_eur",
)


@pytest.fixture(scope="session")
def app():
    yield vb_main.app


@pytest.fixture(autouse=True)
def no_external_price_calls(monkeypatch):
    """Stub the live price lookups in vbx.core.prices and in every vbx module
    that imported them by name (routers written later included)."""
    no_quotes = lambda symbols, force=False: {}  # noqa: E731
    stubs = {
        "fetch_finnhub_quotes": no_quotes,
        "fetch_coingecko_prices": no_quotes,
        "fetch_stock_month_close_usd": lambda symbol, price_date_iso: None,
        "fetch_coingecko_history_eur": lambda coin_id, price_date: None,
    }
    originals = {name: getattr(prices, name) for name in _NETWORK_PRICE_FUNCS}
    for mod_name, module in list(sys.modules.items()):
        if module is None or not (mod_name == "vbx" or mod_name.startswith("vbx.")):
            continue
        for name, original in originals.items():
            if getattr(module, name, None) is original:
                monkeypatch.setattr(module, name, stubs[name])


@pytest.fixture
def client(app):
    return TestClient(app)


def get_connection():
    """A direct connection to the test database (closed by the caller)."""
    return vb_db.get_connection()


class ApiClient:
    """A TestClient wrapper that sends the session's CSRF token on every request."""

    def __init__(self, client: TestClient, csrf_token: str):
        self.client = client
        self.csrf_token = csrf_token

    def _headers(self, kwargs):
        headers = dict(kwargs.pop("headers", None) or {})
        headers.setdefault("X-CSRF-Token", self.csrf_token)
        return headers

    def request(self, method, url, **kwargs):
        return self.client.request(method, url, headers=self._headers(kwargs), **kwargs)

    def get(self, url, **kwargs):
        return self.request("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self.request("POST", url, **kwargs)

    def put(self, url, **kwargs):
        return self.request("PUT", url, **kwargs)

    def patch(self, url, **kwargs):
        return self.request("PATCH", url, **kwargs)

    def delete(self, url, **kwargs):
        return self.request("DELETE", url, **kwargs)


def csrf_token(client) -> str:
    resp = client.get("/api/auth/session")
    assert resp.status_code == 200
    return resp.json()["csrf_token"]


def register_and_login(client, username, password=DEFAULT_PASSWORD) -> ApiClient:
    """Registers a fresh user and returns their logged-in client (CSRF handled)."""
    token = csrf_token(client)
    resp = client.post(
        "/api/auth/register",
        json={"username": username, "password": password, "password2": password},
        headers={"X-CSRF-Token": token},
    )
    assert resp.status_code == 200, resp.text
    return ApiClient(client, resp.json()["csrf_token"])


def user_id(username) -> int:
    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    finally:
        conn.close()
    assert row is not None
    return int(row["id"])


def first_ids(username):
    """(category_id, income_category_id, account_id) seeded for a fresh user."""
    uid = user_id(username)
    conn = get_connection()
    try:
        cat = conn.execute("SELECT id FROM categories WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()["id"]
        inc = conn.execute("SELECT id FROM income_categories WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()[
            "id"
        ]
        acc = conn.execute("SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()["id"]
    finally:
        conn.close()
    return int(cat), int(inc), int(acc)
