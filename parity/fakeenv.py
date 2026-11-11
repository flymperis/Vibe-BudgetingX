"""Test-only environment shared by both app launchers (stdlib only).

Imported by launch_old.py (old Flask app, parity/.venv-old) and launch_new.py
(new FastAPI app, backend/.venv). Everything here is applied IDENTICALLY to
both processes so that the two apps see the same world:

* network guard: every outbound socket connection to a non-loopback address
  raises, a fake ``yfinance`` module is installed, proxies point at a dead
  local port. Nothing in either process can reach the internet.
* deterministic prices: the low-level price lookups of ``prices`` (CoinGecko
  simple/price + history through ``urlopen``, Finnhub, yfinance) are replaced
  by pure functions of (symbol, date). The caching code above them
  (fetch_coingecko_prices, fetch_finnhub_quotes, ensure_*_month_price) runs
  unchanged in both apps.
* Telegram / Ollama: the HTTP helpers are replaced by offline fakes.
* frozen clock: ``datetime``/``date`` names imported by the app modules are
  swapped for subclasses whose now()/today() return PARITY_NOW. Both apps use
  ``from datetime import ...`` everywhere (checked by grep), so swapping the
  module attributes is enough. isinstance() checks against the swapped names
  still accept plain datetimes (excel_io relies on that).
"""

from __future__ import annotations

import datetime as _dt
import io
import json
import os
import socket
import sys
import types
from urllib.error import URLError
from urllib.parse import parse_qs, urlparse

# --------------------------------------------------------------------------
# network guard

_LOOPBACK = {"127.0.0.1", "::1", "localhost", "0.0.0.0", "::"}


def _is_local(addr) -> bool:
    host = addr[0] if isinstance(addr, tuple) else addr
    return str(host) in _LOOPBACK or str(host).startswith("127.")


def install_network_guard() -> None:
    os.environ["HTTP_PROXY"] = os.environ["HTTPS_PROXY"] = "http://127.0.0.1:9"
    os.environ["http_proxy"] = os.environ["https_proxy"] = "http://127.0.0.1:9"
    os.environ["NO_PROXY"] = os.environ["no_proxy"] = "localhost,127.0.0.1"

    real_connect = socket.socket.connect
    real_connect_ex = socket.socket.connect_ex
    real_getaddrinfo = socket.getaddrinfo

    def connect(self, address):
        if self.family in (socket.AF_INET, socket.AF_INET6) and not _is_local(address):
            raise OSError(f"parity network guard: blocked connection to {address!r}")
        return real_connect(self, address)

    def connect_ex(self, address):
        if self.family in (socket.AF_INET, socket.AF_INET6) and not _is_local(address):
            raise OSError(f"parity network guard: blocked connection to {address!r}")
        return real_connect_ex(self, address)

    def getaddrinfo(host, *args, **kwargs):
        if host is not None and not _is_local(host):
            raise socket.gaierror(f"parity network guard: blocked lookup of {host!r}")
        return real_getaddrinfo(host, *args, **kwargs)

    socket.socket.connect = connect
    socket.socket.connect_ex = connect_ex
    socket.getaddrinfo = getaddrinfo

    fake_yf = types.ModuleType("yfinance")

    class _Ticker:  # pragma: no cover - must never be reached
        def __init__(self, *a, **k):
            raise RuntimeError("parity: yfinance is disabled")

    fake_yf.Ticker = _Ticker
    sys.modules["yfinance"] = fake_yf


# --------------------------------------------------------------------------
# deterministic prices (pure functions, identical in both processes)


def _h(text: str) -> int:
    return sum((i + 1) * ord(c) for i, c in enumerate(str(text)))


def coin_price_eur(coin_id: str) -> float:
    return round(20 + _h(coin_id) % 4000 + (_h(coin_id) % 89) / 100, 2)


def coin_change_24h(coin_id: str) -> float:
    return round(((_h(coin_id) % 200) - 100) / 10, 2)


def coin_history_eur(coin_id: str, iso_date: str) -> float:
    y, m, d = (int(x) for x in iso_date.split("-"))
    factor = 0.55 + ((y * 12 + m + d) % 30) / 40
    return round(coin_price_eur(coin_id) * factor, 4)


def stock_last_price(lookup: str) -> float:
    if lookup.endswith("=X"):  # FX pairs used by prices._finnhub_fx_to_usd
        return {"EURUSD=X": 1.0825, "GBPUSD=X": 1.2675}.get(lookup, 1.0)
    return round(10 + _h(lookup) % 700 + (_h(lookup) % 71) / 100, 2)


def stock_month_close(lookup: str, iso_date: str) -> float:
    y, m, _d = (int(x) for x in iso_date.split("-"))
    factor = 0.6 + ((y * 12 + m) % 25) / 30
    return round(stock_last_price(lookup) * factor, 4)


class _FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False


def fake_urlopen(req, timeout=None, **_kw):
    url = req.full_url if hasattr(req, "full_url") else str(req)
    parsed = urlparse(url)
    if parsed.netloc != "api.coingecko.com":
        raise URLError("parity: network disabled")
    path = parsed.path
    if path.endswith("/simple/price"):
        ids = parse_qs(parsed.query).get("ids", [""])[0].split(",")
        data = {
            cid: {"eur": coin_price_eur(cid), "eur_24h_change": coin_change_24h(cid)}
            for cid in ids
            if cid and not cid.startswith("unknown")
        }
        return _FakeResponse(json.dumps(data).encode())
    if "/coins/" in path and path.endswith("/history"):
        coin_id = path.split("/coins/", 1)[1].rsplit("/history", 1)[0]
        dd, mm, yyyy = parse_qs(parsed.query)["date"][0].split("-")
        if coin_id.startswith("unknown"):
            return _FakeResponse(b"{}")
        price = coin_history_eur(coin_id, f"{yyyy}-{mm}-{dd}")
        return _FakeResponse(json.dumps({"market_data": {"current_price": {"eur": price}}}).encode())
    if path.endswith("/search"):
        q = parse_qs(parsed.query).get("query", [""])[0]
        coins = [{"id": f"{q}-coin", "symbol": q[:4], "name": q.title(), "thumb": ""}]
        return _FakeResponse(json.dumps({"coins": coins}).encode())
    raise URLError("parity: unknown coingecko path")


def patch_prices(prices_mod) -> None:
    """Replace the network edges of a prices module (old `prices` or
    `vbx.core.prices`); the module's own caching logic stays in place."""
    prices_mod.urlopen = fake_urlopen
    prices_mod._finnhub_request = lambda path: None
    prices_mod._throttle_coingecko_history = lambda: None

    def _yf_last(symbol):
        if str(symbol).upper().startswith("UNKNOWN"):
            return None
        return stock_last_price(str(symbol))

    def _month_close(symbol, price_date_iso):
        lookup = prices_mod._quote_lookup_symbol(symbol)
        if str(lookup).upper().startswith("UNKNOWN"):
            return None
        return prices_mod._listing_price_to_usd(lookup, stock_month_close(lookup, price_date_iso))

    prices_mod._yfinance_last_price = _yf_last
    prices_mod.fetch_stock_month_close_usd = _month_close


def patch_telegram(telegram_bot_mod) -> None:
    def fake_api(method, payload=None, token=None, *a, **k):
        if method == "getMe":
            return {"ok": True, "result": {"username": "parity_bot"}}, None
        if method == "deleteWebhook":
            return {"ok": True, "result": True}, None
        return {"ok": True, "result": []}, None

    def fake_api_get(method, bot_token=None, params=None, *a, **k):
        return fake_api(method)

    telegram_bot_mod._telegram_api = fake_api
    telegram_bot_mod._telegram_api_get = fake_api_get


def patch_integrations(integrations_mod) -> None:
    integrations_mod.fetch_ollama_models = lambda base_url, *, timeout: ["parity-model:1b"]
    integrations_mod.test_ai_connection = lambda settings: (True, "parity: AI test skipped (offline)")


# --------------------------------------------------------------------------
# frozen clock

_FROZEN: _dt.datetime | None = None


class _InstanceOfBase(type):
    """isinstance(x, FrozenDatetime) is True for any real datetime, so code
    like `isinstance(value, datetime)` keeps working after the swap."""

    def __instancecheck__(cls, obj):
        return isinstance(obj, cls._parity_base)

    def __subclasscheck__(cls, sub):
        return issubclass(sub, cls._parity_base)


class FrozenDatetime(_dt.datetime, metaclass=_InstanceOfBase):
    _parity_base = _dt.datetime

    @classmethod
    def now(cls, tz=None):
        base = _FROZEN
        if tz is not None:
            return base.replace(tzinfo=_dt.timezone.utc).astimezone(tz)
        return base

    @classmethod
    def today(cls):
        return _FROZEN

    @classmethod
    def utcnow(cls):
        return _FROZEN


class FrozenDate(_dt.date, metaclass=_InstanceOfBase):
    _parity_base = _dt.date

    @classmethod
    def today(cls):
        return _FROZEN.date()


def set_frozen_now(iso: str) -> None:
    global _FROZEN
    _FROZEN = _dt.datetime.fromisoformat(iso)


def freeze_modules(path_prefixes) -> list[str]:
    """Swap `datetime`/`date` attributes in every loaded module whose file is
    under one of path_prefixes. Returns the patched module names."""
    if _FROZEN is None:
        return []
    prefixes = [os.path.join(os.path.normcase(os.path.abspath(p)), "") for p in path_prefixes]
    patched = []
    for name, mod in list(sys.modules.items()):
        f = getattr(mod, "__file__", None)
        if not f:
            continue
        nf = os.path.normcase(os.path.abspath(f))
        if not any(nf.startswith(p) for p in prefixes):
            continue
        hit = False
        if getattr(mod, "datetime", None) is _dt.datetime:
            mod.datetime = FrozenDatetime
            hit = True
        if getattr(mod, "date", None) is _dt.date:
            mod.date = FrozenDate
            hit = True
        if getattr(mod, "datetime", None) is _dt:  # `import datetime`
            raise RuntimeError(f"parity: {name} uses `import datetime`; freeze would miss it")
        if hit:
            patched.append(name)
    return patched


# --------------------------------------------------------------------------
# JSON for captured template contexts


def to_jsonable(value, depth=0):
    if depth > 12:
        return repr(value)
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            return {"__float__": repr(value)}
        return value
    if isinstance(value, (_dt.datetime, _dt.date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): to_jsonable(v, depth + 1) for k, v in value.items()}
    if hasattr(value, "keys") and hasattr(value, "__getitem__"):  # sqlite3.Row
        return {k: to_jsonable(value[k], depth + 1) for k in value.keys()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [to_jsonable(v, depth + 1) for v in value]
    if isinstance(value, types.ModuleType):
        return f"<module {value.__name__}>"
    return repr(value)
