"""Helpers for the investments / price-gating / reports tests."""

from __future__ import annotations

from vbx.core import prices

STOCK = {
    "symbol": "AAPL",
    "ticker": "AAPL",
    "instrument_name": "Apple Inc",
    "tx_type": "buy",
    "quantity": "10",
    "price_per_unit": "150.00",
    "fee": "1.50",
    "broker": "TestBroker",
    "transacted_at": "2026-01-15",
    "notes": "first buy",
}

CRYPTO = {
    "coin_id": "bitcoin",
    "coin_symbol": "BTC",
    "coin_name": "Bitcoin",
    "tx_type": "buy",
    "quantity": "0.5",
    "price_per_unit": "40000",
    "fee": "10",
    "exchange": "TestExchange",
    "transacted_at": "2026-02-01",
    "notes": "btc buy",
}


def add_stock(api, **overrides):
    resp = api.post("/api/investments/stocks", json={**STOCK, **overrides})
    assert resp.status_code == 200, resp.text
    return resp.json()["transaction"]


def add_crypto(api, **overrides):
    resp = api.post("/api/investments/crypto", json={**CRYPTO, **overrides})
    assert resp.status_code == 200, resp.text
    return resp.json()["transaction"]


def add_holdings(api):
    """One crypto and one stock holding (the old _add_holdings)."""
    add_crypto(api)
    add_stock(api)


class CountingStub:
    """Stands in for a live price lookup: records every call, returns `result`."""

    def __init__(self, result=None):
        self.calls = []
        self.result = result or {}

    def __call__(self, items, force=False):
        self.calls.append((sorted(items), force))
        return {k: v for k, v in self.result.items() if k in items}


def patch_fetchers(monkeypatch, crypto_result=None, stock_result=None):
    """Counting stubs for prices.fetch_coingecko_prices / fetch_finnhub_quotes
    (every caller, core included, goes through the prices module attribute)."""
    coingecko = CountingStub(crypto_result)
    finnhub = CountingStub(stock_result)
    monkeypatch.setattr(prices, "fetch_coingecko_prices", coingecko)
    monkeypatch.setattr(prices, "fetch_finnhub_quotes", finnhub)
    return coingecko, finnhub


def fresh_price_caches(monkeypatch, crypto=None, stocks=None, crypto_at=0.0, stocks_at=0.0):
    """Replace the in-process price caches (they are per process and would leak
    between tests otherwise)."""
    monkeypatch.setattr(prices, "_price_cache", {"prices": dict(crypto or {}), "fetched_at": crypto_at})
    monkeypatch.setattr(prices, "_stock_price_cache", {"prices": dict(stocks or {}), "fetched_at": stocks_at})
