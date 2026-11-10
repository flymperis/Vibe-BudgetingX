"""Investments logic lifted from the old app.

- Transaction form rules: routes/investments.py add/edit for stocks and crypto.
- Symbol / coin search: routes/investments.py search_stocks / search_crypto.
- The Investments panel numbers: routes/dashboard.py::index (holdings, live
  prices or cache peeks, totals, P&L, price-cache age).

Every live price lookup goes through the `prices` module attribute
(prices.fetch_coingecko_prices / prices.fetch_finnhub_quotes) so one
monkeypatch covers every caller.
"""

from __future__ import annotations

import json
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from vbx.core import config, prices
from vbx.core.finance import compute_crypto_holdings, compute_stock_holdings
from vbx.core.helpers import coerce_txn_day, normalize_txn_day_from_form

from ..errors import ApiError

# --- transactions -----------------------------------------------------------------


def _field(body: dict, name: str, default: str = "") -> str:
    """request.form.get(name, default).strip() for a JSON body: a missing key or
    null is the default, numbers become their text."""
    value = body.get(name)
    if value is None:
        value = default
    return str(value).strip()


def _amounts(body: dict) -> tuple[float, float, float]:
    """quantity, price, fee exactly as the old routes parsed and checked them."""
    quantity_raw = _field(body, "quantity")
    price_raw = _field(body, "price_per_unit")
    fee_raw = _field(body, "fee", "0")
    try:
        quantity = float(quantity_raw)
        price = float(price_raw)
        fee = abs(float(fee_raw)) if fee_raw else 0.0
    except (TypeError, ValueError):
        raise ApiError(400, "Invalid quantity, price, or fee.") from None
    if quantity <= 0 or price < 0:
        raise ApiError(400, "Quantity must be positive and price non-negative.")
    return quantity, price, fee


def parse_stock_form(body: dict) -> tuple:
    """(symbol, ticker, instrument_name, tx_type, quantity, price, fee, broker,
    transacted_at, notes) or ApiError(400) with the old flash text."""
    symbol = _field(body, "symbol").upper()
    ticker = _field(body, "ticker").upper()
    instrument_name = _field(body, "instrument_name")
    tx_type = _field(body, "tx_type").lower()
    broker = _field(body, "broker")
    transacted_at = normalize_txn_day_from_form(_field(body, "transacted_at"))
    notes = _field(body, "notes")
    if not symbol or not ticker or not instrument_name:
        raise ApiError(400, "Fill in symbol, ticker, and name.")
    if tx_type not in ("buy", "sell"):
        raise ApiError(400, "Invalid transaction type.")
    quantity, price, fee = _amounts(body)
    return symbol, ticker, instrument_name, tx_type, quantity, price, fee, broker, transacted_at, notes


def parse_crypto_form(body: dict) -> tuple:
    """(coin_id, coin_symbol, coin_name, tx_type, quantity, price, fee, exchange,
    transacted_at, notes) or ApiError(400) with the old flash text."""
    coin_id = _field(body, "coin_id").lower()
    coin_symbol = _field(body, "coin_symbol").upper()
    coin_name = _field(body, "coin_name")
    tx_type = _field(body, "tx_type").lower()
    exchange = _field(body, "exchange")
    transacted_at = normalize_txn_day_from_form(_field(body, "transacted_at"))
    notes = _field(body, "notes")
    if not coin_id or not coin_symbol or not coin_name:
        raise ApiError(400, "Fill in Coin ID, Symbol, and Name.")
    if tx_type not in ("buy", "sell"):
        raise ApiError(400, "Invalid transaction type.")
    quantity, price, fee = _amounts(body)
    return coin_id, coin_symbol, coin_name, tx_type, quantity, price, fee, exchange, transacted_at, notes


STOCK_TX_SELECT = """
    SELECT id, symbol, ticker, instrument_name, tx_type, quantity,
           price_per_unit, fee, broker, transacted_at, notes
    FROM stock_transactions
"""

CRYPTO_TX_SELECT = """
    SELECT id, coin_id, coin_symbol, coin_name, tx_type, quantity,
           price_per_unit, fee, exchange, transacted_at, notes
    FROM crypto_transactions
"""


def stock_transactions(conn, user_id: int):
    return conn.execute(
        f"{STOCK_TX_SELECT} WHERE user_id = ? ORDER BY transacted_at DESC, id DESC",
        (user_id,),
    ).fetchall()


def crypto_transactions(conn, user_id: int):
    return conn.execute(
        f"{CRYPTO_TX_SELECT} WHERE user_id = ? ORDER BY transacted_at DESC, id DESC",
        (user_id,),
    ).fetchall()


def transaction_out(row) -> dict:
    """A transaction row as the history table shows it; total is the template's
    quantity * price_per_unit + fee."""
    data = dict(row)
    data["transacted_at"] = coerce_txn_day(data["transacted_at"])
    data["total"] = float(data["quantity"]) * float(data["price_per_unit"]) + float(data["fee"])
    return data


# --- search -----------------------------------------------------------------------


def search_stocks(query: str) -> list[dict]:
    """Old /stocks/search: [] for an empty query or without FINNHUB_API_KEY,
    else up to 12 Finnhub matches, exact symbol first, then prefix matches."""
    query = (query or "").strip()
    if len(query) < 1:
        return []
    if not config.FINNHUB_API_KEY:
        return []
    data = prices._finnhub_request(f"/search?q={quote(query)}")
    items = []
    for row in (data.get("result") if data else []) or []:
        sym = (row.get("symbol") or "").strip()
        if not sym:
            continue
        desc = (row.get("description") or "").strip()
        typ = (row.get("type") or "").strip()
        items.append(
            {
                "symbol": sym,
                "ticker": sym.split(".")[0].upper(),
                "name": desc or sym,
                "type": typ,
            }
        )
        if len(items) >= 12:
            break
    q_upper = query.upper()
    items.sort(
        key=lambda x: (
            0 if x["symbol"].upper() == q_upper else 1,
            0 if x["symbol"].upper().startswith(q_upper) else 2,
            x["symbol"],
        )
    )
    return items


def coingecko_search(query: str) -> dict:
    """The CoinGecko /search call of the old /crypto/search route, unchanged
    (the query is put in the URL as typed, not URL-encoded, as before).
    Network errors propagate to search_crypto, which turns them into []."""
    url = f"https://api.coingecko.com/api/v3/search?query={query}"
    req = Request(url, headers={"Accept": "application/json", "User-Agent": "VibeBudgeting/1.0"})
    with urlopen(req, timeout=8) as resp:
        return json.loads(resp.read().decode())


def search_crypto(query: str) -> list[dict]:
    """Old /crypto/search: [] under 2 characters, else the first 10 coins."""
    query = (query or "").strip()
    if len(query) < 2:
        return []
    try:
        data = coingecko_search(query)
        coins = [
            {"id": c["id"], "symbol": c["symbol"], "name": c["name"], "thumb": c.get("thumb", "")}
            for c in (data.get("coins") or [])[:10]
        ]
    except (URLError, HTTPError, json.JSONDecodeError, OSError):
        coins = []
    return coins


# --- the Investments panel ------------------------------------------------------------


def _cache_age_seconds(cache: dict) -> int | None:
    """Seconds since the in-process price cache was filled, or None when the old
    panel showed no "Updated ... ago" (never fetched, or older than the TTL).
    The old text was f"{mins}m {secs}s ago" / f"{secs}s ago" from these seconds."""
    fetched_at = cache["fetched_at"]
    age = time.time() - fetched_at
    if fetched_at > 0 and age < prices.PRICE_CACHE_TTL:
        return int(age)
    return None


def _price_holdings(holdings: list[dict], price_by_key: dict, key: str) -> tuple[float, float]:
    """Adds current_price/change_24h/current_value/pnl/pnl_pct to each holding,
    returns (total_value, total_invested). Same arithmetic as the old index."""
    total_value = 0.0
    total_invested = 0.0
    for h in holdings:
        price_info = price_by_key.get(h[key])
        if price_info:
            h["current_price"] = price_info["price"]
            h["change_24h"] = price_info.get("change_24h")
            h["current_value"] = h["quantity"] * price_info["price"]
            h["pnl"] = h["current_value"] - h["total_cost"]
            h["pnl_pct"] = (h["pnl"] / h["total_cost"] * 100) if h["total_cost"] > 0 else 0
            total_value += h["current_value"]
        else:
            h["current_price"] = None
            h["change_24h"] = None
            h["current_value"] = None
            h["pnl"] = None
            h["pnl_pct"] = 0
        total_invested += h["total_cost"]
    return total_value, total_invested


def _portfolio(holdings, txs, price_map, key, prices_loaded, cache) -> dict:
    total_value, total_invested = _price_holdings(holdings, price_map, key)
    total_pnl = total_value - total_invested
    total_pnl_pct = (total_pnl / total_invested * 100) if total_invested > 0 else 0
    return {
        "holdings": holdings,
        "transactions": [transaction_out(t) for t in txs],
        # The old panel showed a dash, not these figures, while prices were not
        # loaded (a cold cache read as -100% otherwise): None here.
        "total_value": total_value if prices_loaded else None,
        "total_invested": total_invested,
        "total_pnl": total_pnl if prices_loaded else None,
        "total_pnl_pct": total_pnl_pct if prices_loaded else None,
        "prices_loaded": prices_loaded,
        "prices_age_seconds": _cache_age_seconds(cache) if prices_loaded else None,
    }


def investments_panel(conn, user_id: int, *, live: bool, refresh_crypto: bool, refresh_stocks: bool) -> dict:
    """The Investments panel. live=True is the old `panel=investments` request
    (live lookups, served from the 5-minute cache when it covers every holding);
    live=False is any other panel (cache peek only, never the network). The
    refresh flags are the old refresh_prices=1 / refresh_stock_prices=1 links:
    a forced live lookup for that asset class, whatever `live` says."""
    crypto_txs = crypto_transactions(conn, user_id)
    crypto_holdings = compute_crypto_holdings(crypto_txs)
    coin_ids = [h["coin_id"] for h in crypto_holdings]
    need_live_crypto = live or refresh_crypto
    if not coin_ids:
        crypto_prices = {}
    elif need_live_crypto:
        crypto_prices = prices.fetch_coingecko_prices(coin_ids, force=refresh_crypto)
    else:
        crypto_prices = prices.peek_coingecko_prices(coin_ids)
    crypto_prices_loaded = need_live_crypto or set(coin_ids) <= set(crypto_prices)

    stock_txs = stock_transactions(conn, user_id)
    stock_holdings = compute_stock_holdings(stock_txs)
    stock_symbols = [h["symbol"] for h in stock_holdings]
    need_live_stock = live or refresh_stocks
    if not stock_symbols:
        stock_prices = {}
    elif need_live_stock:
        stock_prices = prices.fetch_finnhub_quotes(stock_symbols, force=refresh_stocks)
    else:
        stock_prices = prices.peek_finnhub_quotes(stock_symbols)
    stock_prices_loaded = need_live_stock or set(stock_symbols) <= set(stock_prices)

    return {
        "finnhub_configured": bool(config.FINNHUB_API_KEY),
        "price_cache_ttl_seconds": prices.PRICE_CACHE_TTL,
        "crypto": _portfolio(
            crypto_holdings, crypto_txs, crypto_prices, "coin_id", crypto_prices_loaded, prices._price_cache
        ),
        "stocks": _portfolio(
            stock_holdings, stock_txs, stock_prices, "symbol", stock_prices_loaded, prices._stock_price_cache
        ),
    }
