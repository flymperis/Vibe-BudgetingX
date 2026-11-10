"""Live price lookups (CoinGecko/Finnhub) are synchronous outbound HTTP calls
(old tests/test_price_fetch_gating.py). They must only run for the Investments
screen (GET /api/investments, the old panel=investments) or when a refresh is
explicitly asked for; everything else either never prices or only peeks at
the in-process cache.

The stubs replace prices.fetch_coingecko_prices / prices.fetch_finnhub_quotes,
the attributes every caller (router services and vbx.core.finance/prices) goes
through, so they count strictly more than the old test (which patched only the
names imported by routes/dashboard.py)."""

from datetime import date

from .conftest import get_connection, register_and_login
from .helpers_investments import add_crypto, add_holdings, add_stock, fresh_price_caches, patch_fetchers


def _setup(client, monkeypatch, name):
    api = register_and_login(client, name)
    add_holdings(api)
    fresh_price_caches(monkeypatch)  # cold cache, as on a fresh process
    coingecko, finnhub = patch_fetchers(monkeypatch)
    return api, coingecko, finnhub


def test_non_investments_panel_does_not_fetch_live_prices(client, monkeypatch):
    api, coingecko, finnhub = _setup(client, monkeypatch, "gatinghome")
    urls = [
        "/api/bootstrap",
        "/api/expenses",
        "/api/investments?live=false",
        "/api/reports/spending",
        "/api/reports/tags",
        "/api/reports/section?section=investments",
    ]
    for url in urls:
        resp = api.get(url)
        assert resp.status_code == 200, url
    # The Home screen's own endpoint.
    resp = api.get("/api/home")
    assert resp.status_code == 200
    assert coingecko.calls == []
    assert finnhub.calls == []


def test_investments_panel_fetches_live_prices(client, monkeypatch):
    api, coingecko, finnhub = _setup(client, monkeypatch, "gatinginvest")
    resp = api.get("/api/investments")
    assert resp.status_code == 200
    assert coingecko.calls == [(["bitcoin"], False)]  # one call, cache allowed
    assert finnhub.calls == [(["AAPL"], False)]


def test_refresh_param_fetches_live_prices_on_other_panels(client, monkeypatch):
    api, coingecko, finnhub = _setup(client, monkeypatch, "gatingrefresh")
    resp = api.get("/api/investments?live=false&refresh_crypto=true&refresh_stocks=true")
    assert resp.status_code == 200
    assert coingecko.calls == [(["bitcoin"], True)]  # forced past the cache
    assert finnhub.calls == [(["AAPL"], True)]


def test_each_refresh_button_forces_only_its_own_asset_class(client, monkeypatch):
    """Old links: crypto "Refresh Prices" = panel=investments&refresh_prices=1
    (crypto forced, stocks fetched normally) and the stocks one likewise."""
    api, coingecko, finnhub = _setup(client, monkeypatch, "gatingbuttons")
    api.get("/api/investments?refresh_crypto=true")
    assert coingecko.calls == [(["bitcoin"], True)] and finnhub.calls == [(["AAPL"], False)]
    api.get("/api/investments?refresh_stocks=true")
    assert coingecko.calls[-1] == (["bitcoin"], False) and finnhub.calls[-1] == (["AAPL"], True)
    # refreshing one class on another screen leaves the other class to the cache
    api.get("/api/investments?live=false&refresh_stocks=true")
    assert len(coingecko.calls) == 2 and finnhub.calls[-1] == (["AAPL"], True)


def test_no_holdings_no_lookup(client, monkeypatch):
    api = register_and_login(client, "gatingempty")
    fresh_price_caches(monkeypatch)
    coingecko, finnhub = patch_fetchers(monkeypatch)
    body = api.get("/api/investments?refresh_crypto=true&refresh_stocks=true").json()
    assert coingecko.calls == [] and finnhub.calls == []
    assert body["crypto"]["holdings"] == [] and body["crypto"]["total_value"] == 0.0


def test_investments_data_shows_dash_not_zero_when_unloaded(client, monkeypatch):
    """When prices weren't fetched (cold cache, not the Investments screen) the
    data must not present misleading zero/-100% totals: prices_loaded is false
    and the value/P&L figures are null (the old "—"). Total invested is still
    meaningful and is returned."""
    api, _coingecko, _finnhub = _setup(client, monkeypatch, "gatingdash")
    body = api.get("/api/investments?live=false").json()

    crypto = body["crypto"]
    assert crypto["prices_loaded"] is False
    assert (crypto["total_value"], crypto["total_pnl"], crypto["total_pnl_pct"]) == (None, None, None)
    assert crypto["prices_age_seconds"] is None
    assert crypto["total_invested"] == 20010.0
    assert all(h["pnl"] is None and h["current_value"] is None for h in crypto["holdings"])

    stocks = body["stocks"]
    assert stocks["prices_loaded"] is False
    assert (stocks["total_value"], stocks["total_pnl"], stocks["total_pnl_pct"]) == (None, None, None)
    assert stocks["total_invested"] == 1501.5
    assert "-100" not in str(body)


def test_reports_use_stored_month_end_prices_without_live_calls(client, monkeypatch):
    """A past report year whose month-end prices are already stored needs no
    lookup at all; the current year asks only for the current month's quote,
    and never forces past the cache."""
    api = register_and_login(client, "gatingreports")
    prev = date.today().year - 1
    add_crypto(api, transacted_at=f"{prev}-11-10")
    add_stock(api, transacted_at=f"{prev}-11-10")
    conn = get_connection()
    for month in (11, 12):
        conn.execute(
            "INSERT OR REPLACE INTO crypto_month_prices (coin_id, year, month, price_eur, price_date, source) "
            "VALUES ('bitcoin', ?, ?, 50000, '2000-01-01', 'cache')",
            (prev, month),
        )
        conn.execute(
            "INSERT OR REPLACE INTO stock_month_prices (symbol, year, month, price_usd, price_date, source) "
            "VALUES ('AAPL', ?, ?, 200, '2000-01-01', 'cache')",
            (prev, month),
        )
    conn.commit()
    conn.close()
    fresh_price_caches(monkeypatch)
    coingecko, finnhub = patch_fetchers(monkeypatch)

    body = api.get(f"/api/reports/investments?year={prev}").json()
    assert (body["crypto_value"], body["stock_value"]) == (25000.0, 2000.0)
    assert api.get(f"/api/reports/overview?year={prev}").json()["crypto_value"] == 25000.0
    assert coingecko.calls == [] and finnhub.calls == []

    # Current year: the stored December price is the baseline; past months of
    # this year are looked up (history first, the live quote as fallback) and
    # the running month uses the live quote, never forced.
    api.get(f"/api/reports/investments?year={prev + 1}")
    assert coingecko.calls and all(force is False for _ids, force in coingecko.calls)
    assert finnhub.calls and all(force is False for _ids, force in finnhub.calls)
