"""Investments API (old tests/test_investments_and_rules.py, stock/crypto part)
plus the old routes/investments.py validation, ownership and search rules.

The three recurring / transfer tests of the old file are at the end of this
file (they use the recurring and transfers routers)."""

import itertools
import time
from datetime import date
from urllib.error import URLError

import pytest
from fastapi.testclient import TestClient

from vbx.api.services import investments as inv_svc
from vbx.core import config, prices

from .conftest import get_connection, register_and_login, user_id
from .helpers_investments import (
    CRYPTO,
    STOCK,
    add_crypto,
    add_stock,
    fresh_price_caches,
    patch_fetchers,
)

_names = itertools.count()


def _row(table, tx_id):
    conn = get_connection()
    row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (tx_id,)).fetchone()
    conn.close()
    return row


def test_stock_add_edit_delete(client):
    api = register_and_login(client, "stocktester")
    resp = api.post("/api/investments/stocks", json=STOCK)
    assert resp.status_code == 200
    assert resp.json()["message"] == "Stock buy recorded."
    tx_id = resp.json()["transaction"]["id"]

    conn = get_connection()
    row = conn.execute(
        "SELECT id, quantity, price_per_unit FROM stock_transactions WHERE notes = 'first buy'"
    ).fetchone()
    conn.close()
    assert row is not None and row["id"] == tx_id
    assert row["quantity"] == 10.0

    resp = api.put(f"/api/investments/stocks/{tx_id}", json={**STOCK, "quantity": "12", "price_per_unit": "155.00"})
    assert resp.status_code == 200
    assert resp.json()["message"] == "Transaction updated."
    assert _row("stock_transactions", tx_id)["quantity"] == 12.0
    assert resp.json()["transaction"]["price_per_unit"] == 155.0

    resp = api.delete(f"/api/investments/stocks/{tx_id}")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "message": "Transaction removed."}
    assert _row("stock_transactions", tx_id) is None


def test_crypto_add_edit_delete(client):
    api = register_and_login(client, "cryptotester")
    resp = api.post("/api/investments/crypto", json=CRYPTO)
    assert resp.status_code == 200
    assert resp.json()["message"] == "Crypto buy recorded."

    conn = get_connection()
    row = conn.execute("SELECT id, quantity FROM crypto_transactions WHERE notes = 'btc buy'").fetchone()
    conn.close()
    assert row is not None
    assert row["quantity"] == 0.5
    tx_id = row["id"]

    resp = api.put(f"/api/investments/crypto/{tx_id}", json={**CRYPTO, "quantity": "0.75", "price_per_unit": "41000"})
    assert resp.status_code == 200
    assert _row("crypto_transactions", tx_id)["quantity"] == 0.75

    resp = api.delete(f"/api/investments/crypto/{tx_id}")
    assert resp.status_code == 200
    assert _row("crypto_transactions", tx_id) is None


def test_dashboard_loads_with_holdings(client):
    """Investments and reports do the most work; make sure every endpoint
    answers once the user actually holds something (summary and yearly
    included, as in the old test)."""
    api = register_and_login(client, "holder")
    add_stock(
        api,
        symbol="MSFT",
        ticker="MSFT",
        instrument_name="Microsoft",
        quantity="5",
        price_per_unit="300",
        transacted_at="2026-03-01",
        fee=None,
        broker=None,
        notes=None,
    )
    add_crypto(
        api,
        coin_id="ethereum",
        coin_symbol="ETH",
        coin_name="Ethereum",
        quantity="2",
        price_per_unit="2000",
        transacted_at="2026-03-01",
        fee=None,
        exchange=None,
        notes=None,
    )

    for url in (
        "/api/investments",
        "/api/investments?live=false",
        "/api/reports/overview",
        "/api/reports/spending",
        "/api/reports/tags",
        "/api/reports/investments",
        "/api/reports/investments?year=2025",
        "/api/reports/section?section=bank",
        "/api/reports/section?section=stocks",
        "/api/reports/section?section=crypto",
        "/api/summary",
        "/api/yearly",
        "/api/home",
    ):
        assert api.get(url).status_code == 200, f"{url} failed to load"
    body = api.get("/api/investments").json()
    assert [h["symbol"] for h in body["stocks"]["holdings"]] == ["MSFT"]
    assert [h["coin_id"] for h in body["crypto"]["holdings"]] == ["ethereum"]


# --- validation (old flash texts) ---------------------------------------------------


@pytest.mark.parametrize(
    "kind,base,changes,message",
    [
        ("stocks", STOCK, {"symbol": " "}, "Fill in symbol, ticker, and name."),
        ("stocks", STOCK, {"ticker": None}, "Fill in symbol, ticker, and name."),
        ("stocks", STOCK, {"instrument_name": ""}, "Fill in symbol, ticker, and name."),
        ("stocks", STOCK, {"tx_type": "hold"}, "Invalid transaction type."),
        ("stocks", STOCK, {"tx_type": ""}, "Invalid transaction type."),
        ("stocks", STOCK, {"quantity": "abc"}, "Invalid quantity, price, or fee."),
        ("stocks", STOCK, {"quantity": ""}, "Invalid quantity, price, or fee."),
        ("stocks", STOCK, {"price_per_unit": ""}, "Invalid quantity, price, or fee."),
        ("stocks", STOCK, {"fee": "x"}, "Invalid quantity, price, or fee."),
        ("stocks", STOCK, {"quantity": "0"}, "Quantity must be positive and price non-negative."),
        ("stocks", STOCK, {"quantity": -1}, "Quantity must be positive and price non-negative."),
        ("stocks", STOCK, {"price_per_unit": "-0.01"}, "Quantity must be positive and price non-negative."),
        ("crypto", CRYPTO, {"coin_id": ""}, "Fill in Coin ID, Symbol, and Name."),
        ("crypto", CRYPTO, {"coin_symbol": " "}, "Fill in Coin ID, Symbol, and Name."),
        ("crypto", CRYPTO, {"coin_name": None}, "Fill in Coin ID, Symbol, and Name."),
        ("crypto", CRYPTO, {"tx_type": "swap"}, "Invalid transaction type."),
        ("crypto", CRYPTO, {"price_per_unit": "1,5"}, "Invalid quantity, price, or fee."),
        ("crypto", CRYPTO, {"quantity": "0"}, "Quantity must be positive and price non-negative."),
        ("crypto", CRYPTO, {"price_per_unit": -5}, "Quantity must be positive and price non-negative."),
    ],
)
def test_validation_messages_and_nothing_saved(client, kind, base, changes, message):
    name = f"inv-valid-{next(_names)}"
    api = register_and_login(client, name)
    resp = api.post(f"/api/investments/{kind}", json={**base, **changes})
    assert resp.status_code == 400
    assert resp.json() == {"detail": message}
    table = "stock_transactions" if kind == "stocks" else "crypto_transactions"
    conn = get_connection()
    n = conn.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id = ?", (user_id(name),)).fetchone()[0]
    conn.close()
    assert n == 0


def test_edit_validates_before_looking_up_and_leaves_row_alone(client):
    api = register_and_login(client, "inv-edit-invalid")
    tx = add_stock(api)
    resp = api.put(f"/api/investments/stocks/{tx['id']}", json={**STOCK, "tx_type": "nope", "quantity": "99"})
    assert resp.json() == {"detail": "Invalid transaction type."}
    assert _row("stock_transactions", tx["id"])["quantity"] == 10.0
    # an unknown id with an invalid body is still a validation error (old order)
    resp = api.put("/api/investments/stocks/987654", json={**STOCK, "symbol": ""})
    assert resp.status_code == 400


def test_normalisation_of_fields(client):
    api = register_and_login(client, "inv-normalise")
    tx = add_stock(
        api,
        symbol=" vuaa.eu ",
        ticker="vuaa",
        instrument_name="  Vanguard S&P 500  ",
        tx_type=" BUY ",
        quantity=3,
        price_per_unit=0,
        fee="-2.5",  # the old route stored abs(fee)
        broker=" Freedom24 ",
        transacted_at="2026-03-14T18:42:00",
        notes="  hi  ",
    )
    assert (tx["symbol"], tx["ticker"], tx["instrument_name"], tx["tx_type"]) == (
        "VUAA.EU",
        "VUAA",
        "Vanguard S&P 500",
        "buy",
    )
    assert (tx["quantity"], tx["price_per_unit"], tx["fee"], tx["broker"], tx["notes"]) == (
        3.0,
        0.0,
        2.5,
        "Freedom24",
        "hi",
    )
    assert tx["transacted_at"] == "2026-03-14"
    assert tx["total"] == 2.5

    # fee omitted -> "0"; fee blank -> 0; date blank -> today
    c1 = add_crypto(api, coin_id=" Ripple ", coin_symbol="xrp", fee=None, transacted_at="")
    assert (c1["coin_id"], c1["coin_symbol"], c1["fee"]) == ("ripple", "XRP", 0.0)
    assert c1["transacted_at"] == date.today().isoformat()
    body = {k: v for k, v in CRYPTO.items() if k != "fee"}
    resp = api.post("/api/investments/crypto", json=body)
    assert resp.json()["transaction"]["fee"] == 0.0
    c3 = add_crypto(api, fee="", tx_type="SELL")
    assert c3["fee"] == 0.0 and c3["tx_type"] == "sell"
    assert api.post("/api/investments/crypto", json={**CRYPTO, "tx_type": "sell"}).json()["message"] == (
        "Crypto sell recorded."
    )


def test_other_users_transactions_are_invisible_and_untouchable(client, app):
    owner = register_and_login(client, "inv-owner")
    stock = add_stock(owner, notes="private")
    coin = add_crypto(owner, notes="private")

    intruder = register_and_login(TestClient(app), "inv-intruder")
    body = intruder.get("/api/investments?live=false").json()
    assert body["stocks"]["transactions"] == [] and body["crypto"]["transactions"] == []
    assert body["stocks"]["holdings"] == [] and body["crypto"]["holdings"] == []
    for kind, tx, payload in (("stocks", stock, STOCK), ("crypto", coin, CRYPTO)):
        resp = intruder.put(f"/api/investments/{kind}/{tx['id']}", json={**payload, "quantity": "1"})
        assert resp.status_code == 404 and resp.json() == {"detail": "Transaction not found."}
        resp = intruder.delete(f"/api/investments/{kind}/{tx['id']}")
        assert resp.status_code == 404 and resp.json() == {"detail": "Transaction not found."}
    assert _row("stock_transactions", stock["id"])["quantity"] == 10.0
    assert _row("crypto_transactions", coin["id"])["quantity"] == 0.5


def test_unknown_transaction_is_404(client):
    api = register_and_login(client, "inv-404")
    assert api.put("/api/investments/stocks/987654", json=STOCK).json() == {"detail": "Transaction not found."}
    assert api.put("/api/investments/crypto/987654", json=CRYPTO).status_code == 404
    assert api.delete("/api/investments/stocks/987654").status_code == 404
    assert api.delete("/api/investments/crypto/987654").status_code == 404


def test_login_required(client):
    for method, url in (
        ("GET", "/api/investments"),
        ("GET", "/api/investments/stocks/search?q=a"),
        ("GET", "/api/investments/crypto/search?q=bit"),
    ):
        assert client.request(method, url).status_code == 401


# --- holdings, prices, totals -------------------------------------------------------


def test_holdings_cost_basis_value_and_pnl(client, monkeypatch):
    api = register_and_login(client, "inv-holdings")
    add_crypto(api)  # 0.5 BTC @ 40000 + 10 fee  (EUR)
    add_crypto(
        api,
        coin_id="ethereum",
        coin_symbol="ETH",
        coin_name="Ethereum",
        quantity="2",
        price_per_unit="1000",
        fee="0",
        transacted_at="2026-02-02",
    )
    add_stock(api)  # 10 AAPL @ 150 + 1.50 fee  (USD)
    fresh_price_caches(monkeypatch)
    coingecko, finnhub = patch_fetchers(
        monkeypatch,
        crypto_result={"bitcoin": {"price": 50000.0, "change_24h": -1.25}},
        stock_result={"AAPL": {"price": 200.0, "change_24h": 0.5, "source": "finnhub"}},
    )
    body = api.get("/api/investments").json()

    crypto = body["crypto"]
    # sorted by coin name, case-insensitive
    assert [h["coin_id"] for h in crypto["holdings"]] == ["bitcoin", "ethereum"]
    btc, eth = crypto["holdings"]
    assert (btc["quantity"], btc["total_cost"], btc["avg_buy_price"]) == (0.5, 20010.0, 40020.0)
    assert (btc["current_price"], btc["change_24h"], btc["current_value"], btc["pnl"]) == (
        50000.0,
        -1.25,
        25000.0,
        4990.0,
    )
    assert btc["pnl_pct"] == pytest.approx(4990.0 / 20010.0 * 100)
    # no price for ETH: N/A in the old table, pnl_pct 0
    assert (eth["current_price"], eth["current_value"], eth["pnl"], eth["pnl_pct"]) == (None, None, None, 0)
    assert crypto["total_invested"] == 22010.0
    assert crypto["total_value"] == 25000.0  # only priced holdings count, as before
    assert crypto["total_pnl"] == 25000.0 - 22010.0
    assert crypto["total_pnl_pct"] == pytest.approx((25000.0 - 22010.0) / 22010.0 * 100)
    assert crypto["prices_loaded"] is True

    stocks = body["stocks"]
    (aapl,) = stocks["holdings"]
    assert (aapl["ticker"], aapl["instrument_name"], aapl["total_cost"]) == ("AAPL", "Apple Inc", 1501.5)
    assert (aapl["current_value"], aapl["pnl"]) == (2000.0, 498.5)
    assert (stocks["total_value"], stocks["total_invested"], stocks["total_pnl"]) == (2000.0, 1501.5, 498.5)

    # transaction history newest first with the template's total
    assert [t["coin_symbol"] for t in crypto["transactions"]] == ["ETH", "BTC"]
    assert crypto["transactions"][1]["total"] == 20010.0
    assert stocks["transactions"][0]["total"] == 1501.5
    assert coingecko.calls == [(["bitcoin", "ethereum"], False)]
    assert finnhub.calls == [(["AAPL"], False)]


def test_sell_reduces_cost_basis_at_average_cost_and_closed_positions_disappear(client, monkeypatch):
    api = register_and_login(client, "inv-sell")
    fresh_price_caches(monkeypatch)
    patch_fetchers(monkeypatch)
    # Everything sold: no holding left (the ordering caveat is the next test).
    add_stock(api, quantity="10", price_per_unit="100", fee="0", transacted_at="2026-01-01")
    add_stock(api, tx_type="sell", quantity="10", price_per_unit="120", fee="0", transacted_at="2026-01-01")
    body = api.get("/api/investments").json()
    assert body["stocks"]["holdings"] == []  # quantity 0 is not a holding


def test_old_newest_first_order_feeds_the_holdings_maths(client, monkeypatch):
    """Ported unchanged (see docs/parity/D.md, suspected old bug): holdings are
    computed from the transactions in the order the panel lists them, newest
    first, so a later sell is applied before the earlier buy and does not
    reduce the cost basis."""
    api = register_and_login(client, "inv-order")
    fresh_price_caches(monkeypatch)
    patch_fetchers(monkeypatch)
    add_stock(api, quantity="10", price_per_unit="100", fee="0", transacted_at="2026-01-01")
    add_stock(api, tx_type="sell", quantity="5", price_per_unit="120", fee="0", transacted_at="2026-02-01")
    (h,) = api.get("/api/investments").json()["stocks"]["holdings"]
    assert h["quantity"] == 5.0
    assert h["total_cost"] == 1000.0  # not 500: the old app shows the same
    assert h["avg_buy_price"] == 200.0


def test_live_fetch_with_no_result_shows_zero_not_dash(client, monkeypatch):
    """Old behaviour: on the Investments panel the prices count as loaded even
    when the lookup returned nothing, so totals are numbers (0 / -100%)."""
    api = register_and_login(client, "inv-noprice")
    add_crypto(api)
    fresh_price_caches(monkeypatch)
    patch_fetchers(monkeypatch)
    crypto = api.get("/api/investments").json()["crypto"]
    assert crypto["prices_loaded"] is True
    assert (crypto["total_value"], crypto["total_pnl"], crypto["total_pnl_pct"]) == (0.0, -20010.0, -100.0)


def test_cached_prices_and_their_age(client, monkeypatch):
    api = register_and_login(client, "inv-cache")
    add_crypto(api)
    add_stock(api)
    coingecko, finnhub = patch_fetchers(monkeypatch)
    fresh_price_caches(
        monkeypatch,
        crypto={"bitcoin": {"price": 30000.0, "change_24h": None}},
        stocks={"AAPL": {"price": 100.0, "change_24h": None, "source": "yfinance"}},
        crypto_at=time.time() - 65,
        stocks_at=time.time() - 5,
    )
    body = api.get("/api/investments?live=false").json()
    assert body["crypto"]["prices_loaded"] is True and body["stocks"]["prices_loaded"] is True
    assert body["crypto"]["total_value"] == 15000.0
    assert body["stocks"]["total_value"] == 1000.0
    assert 65 <= body["crypto"]["prices_age_seconds"] <= 70  # old: "1m 5s ago"
    assert 5 <= body["stocks"]["prices_age_seconds"] <= 10  # old: "5s ago"
    assert body["price_cache_ttl_seconds"] == prices.PRICE_CACHE_TTL == 300
    assert coingecko.calls == [] and finnhub.calls == []

    # older than the TTL: the peek finds nothing and no age is shown
    fresh_price_caches(
        monkeypatch,
        crypto={"bitcoin": {"price": 30000.0}},
        crypto_at=time.time() - prices.PRICE_CACHE_TTL - 1,
    )
    crypto = api.get("/api/investments?live=false").json()["crypto"]
    assert crypto["prices_loaded"] is False
    assert crypto["prices_age_seconds"] is None


def test_finnhub_key_presence_is_reported(client, monkeypatch):
    api = register_and_login(client, "inv-finnhub")
    monkeypatch.setattr(config, "FINNHUB_API_KEY", "")
    assert api.get("/api/investments").json()["finnhub_configured"] is False
    monkeypatch.setattr(config, "FINNHUB_API_KEY", "test-key")
    assert api.get("/api/investments").json()["finnhub_configured"] is True


# --- search ---------------------------------------------------------------------------


def test_stock_search(client, monkeypatch):
    api = register_and_login(client, "inv-stock-search")
    seen = []

    def fake_request(path):
        seen.append(path)
        return {
            "result": [
                {"symbol": "VUAA.L", "description": "Vanguard L", "type": "ETP"},
                {"symbol": "", "description": "skipped"},
                {"symbol": "XVUAA", "description": "", "type": "Common Stock"},
                {"symbol": "VUAA", "description": "Vanguard", "type": "ETP"},
                {"symbol": "VUAA.DE", "description": "Vanguard DE"},
            ]
            + [{"symbol": f"Z{i}", "description": "filler"} for i in range(20)]
        }

    monkeypatch.setattr(prices, "_finnhub_request", fake_request)
    monkeypatch.setattr(config, "FINNHUB_API_KEY", "")
    assert api.get("/api/investments/stocks/search?q=vuaa").json() == []  # no key: []
    assert seen == []

    monkeypatch.setattr(config, "FINNHUB_API_KEY", "test-key")
    assert api.get("/api/investments/stocks/search?q=%20").json() == []  # blank query
    items = api.get("/api/investments/stocks/search?q=vuaa ").json()
    assert seen == ["/search?q=vuaa"]
    assert len(items) == 12
    assert items[:4] == [
        {"symbol": "VUAA", "ticker": "VUAA", "name": "Vanguard", "type": "ETP"},
        {"symbol": "VUAA.DE", "ticker": "VUAA", "name": "Vanguard DE", "type": ""},
        {"symbol": "VUAA.L", "ticker": "VUAA", "name": "Vanguard L", "type": "ETP"},
        {"symbol": "XVUAA", "ticker": "XVUAA", "name": "XVUAA", "type": "Common Stock"},
    ]
    monkeypatch.setattr(prices, "_finnhub_request", lambda path: None)  # Finnhub failure
    assert api.get("/api/investments/stocks/search?q=x").json() == []


def test_crypto_search(client, monkeypatch):
    api = register_and_login(client, "inv-crypto-search")
    queries = []

    def fake_search(query):
        queries.append(query)
        return {
            "coins": [{"id": f"c{i}", "symbol": "s", "name": "n", "thumb": "t"} for i in range(12)]
            + [{"id": "x", "symbol": "x", "name": "x"}]
        }

    monkeypatch.setattr(inv_svc, "coingecko_search", fake_search)
    assert api.get("/api/investments/crypto/search?q=b").json() == []  # under 2 characters
    assert queries == []
    coins = api.get("/api/investments/crypto/search?q= bit ").json()
    assert queries == ["bit"]
    assert len(coins) == 10
    assert coins[0] == {"id": "c0", "symbol": "s", "name": "n", "thumb": "t"}

    def failing(query):
        raise URLError("offline")

    monkeypatch.setattr(inv_svc, "coingecko_search", failing)
    assert api.get("/api/investments/crypto/search?q=bitcoin").json() == []


def _first_ids(username):
    conn = get_connection()
    uid = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()["id"]
    account_id = conn.execute("SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()["id"]
    category_id = conn.execute("SELECT id FROM categories WHERE user_id = ? ORDER BY id LIMIT 1", (uid,)).fetchone()[
        "id"
    ]
    conn.close()
    return account_id, category_id


def test_recurring_add_edit_delete(client):
    api = register_and_login(client, "recurringtester")
    account_id, category_id = _first_ids("recurringtester")

    resp = api.post(
        "/api/recurring",
        json={
            "category_choice": f"e-{category_id}",
            "amount": "50",
            "account_id": str(account_id),
            "day_of_month": "5",
            "indefinitely": "1",
            "notes": "monthly rent",
        },
    )
    assert resp.status_code == 200

    conn = get_connection()
    row = conn.execute(
        "SELECT id, amount, day_of_month, months_to_run FROM recurring_entries WHERE notes = 'monthly rent'"
    ).fetchone()
    conn.close()
    assert row is not None
    assert row["amount"] == 50.0
    assert row["day_of_month"] == 5
    assert row["months_to_run"] is None  # "indefinitely"
    rule_id = row["id"]

    resp = api.put(
        f"/api/recurring/{rule_id}",
        json={
            "category_choice": f"e-{category_id}",
            "amount": "75",
            "account_id": str(account_id),
            "day_of_month": "10",
            "months_to_run": "6",
            "notes": "monthly rent",
        },
    )
    assert resp.status_code == 200

    conn = get_connection()
    row = conn.execute(
        "SELECT amount, day_of_month, months_to_run FROM recurring_entries WHERE id = ?",
        (rule_id,),
    ).fetchone()
    conn.close()
    assert row["amount"] == 75.0
    assert row["day_of_month"] == 10
    assert row["months_to_run"] == 6

    resp = api.delete(f"/api/recurring/{rule_id}")
    assert resp.status_code == 200

    conn = get_connection()
    assert conn.execute("SELECT id FROM recurring_entries WHERE id = ?", (rule_id,)).fetchone() is None
    conn.close()


def test_transfer_between_accounts(client):
    api = register_and_login(client, "transfertester")
    from_id, _ = _first_ids("transfertester")

    resp = api.post("/api/accounts", json={"name": "Savings", "opening_balance": "0"})
    assert resp.status_code == 200
    conn = get_connection()
    to_row = conn.execute(
        """
        SELECT a.id FROM accounts a
        JOIN users u ON u.id = a.user_id
        WHERE u.username = ? AND a.name = 'Savings'
        """,
        ("transfertester",),
    ).fetchone()
    conn.close()
    assert to_row is not None

    resp = api.post(
        "/api/transfers",
        json={
            "from_account_id": str(from_id),
            "to_account_id": str(to_row["id"]),
            "amount": "200",
            "transferred_at": "2026-04-01",
            "notes": "to savings",
        },
    )
    assert resp.status_code == 200

    conn = get_connection()
    row = conn.execute(
        """
        SELECT t.id, t.amount FROM account_transfers t
        JOIN users u ON u.id = t.user_id
        WHERE u.username = ? AND t.notes = 'to savings'
        """,
        ("transfertester",),
    ).fetchone()
    conn.close()
    assert row is not None
    assert row["amount"] == 200.0

    resp = api.delete(f"/api/transfers/{row['id']}")
    assert resp.status_code == 200

    conn = get_connection()
    assert conn.execute("SELECT id FROM account_transfers WHERE id = ?", (row["id"],)).fetchone() is None
    conn.close()


def test_transfer_rejects_same_account(client):
    api = register_and_login(client, "sameacct")
    account_id, _ = _first_ids("sameacct")

    resp = api.post(
        "/api/transfers",
        json={"from_account_id": str(account_id), "to_account_id": str(account_id), "amount": "50"},
    )
    assert resp.status_code == 400
    conn = get_connection()
    count = conn.execute(
        "SELECT COUNT(*) AS n FROM account_transfers WHERE from_account_id = ? AND to_account_id = ?",
        (account_id, account_id),
    ).fetchone()["n"]
    conn.close()
    assert count == 0
