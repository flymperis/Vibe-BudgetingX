"""Investments, ported from the old routes/investments.py (search, add, edit,
delete for stocks and crypto) and the Investments panel of
routes/dashboard.py::index (holdings, live prices, totals).

Live price lookups (CoinGecko, Finnhub/yfinance) are slow outbound calls. As in
the old app they run only for the Investments screen itself (GET
/api/investments, the old `panel=investments`) or when a refresh is asked for;
`live=false` only peeks at the in-process cache, like every other old panel.
No other endpoint of this router touches prices.
"""

from __future__ import annotations

from fastapi import APIRouter

from ..deps import DB, User
from ..errors import ApiError
from ..schemas.common import OkOut
from ..schemas.investments import (
    CryptoSearchItem,
    CryptoTxIn,
    CryptoTxOut,
    CryptoTxSaved,
    InvestmentsOut,
    StockSearchItem,
    StockTxIn,
    StockTxOut,
    StockTxSaved,
)
from ..services import investments as svc

router = APIRouter(prefix="/investments", tags=["investments"])

NOT_FOUND = "Transaction not found."


@router.get("", response_model=InvestmentsOut)
def investments(
    user: User,
    conn: DB,
    live: bool = True,
    refresh_crypto: bool = False,
    refresh_stocks: bool = False,
):
    """Holdings, totals and transaction history for crypto (EUR) and stocks (USD).

    - live=true (default): the Investments screen. Live prices for every
      holding, answered from the 5-minute in-process cache when it already has
      them all (old `?panel=investments`).
    - live=false: cache only, never the network (old: any other panel). An
      asset class whose prices are not all cached comes back with
      prices_loaded=false and null totals.
    - refresh_crypto=true / refresh_stocks=true: the old "Refresh Prices"
      buttons (refresh_prices=1 / refresh_stock_prices=1): bypass the cache for
      that asset class.
    """
    return svc.investments_panel(conn, user.id, live=live, refresh_crypto=refresh_crypto, refresh_stocks=refresh_stocks)


# --- search ---------------------------------------------------------------------------


@router.get("/stocks/search", response_model=list[StockSearchItem])
def search_stocks(user: User, q: str = ""):
    """Finnhub symbol search; [] without a query or without FINNHUB_API_KEY."""
    return svc.search_stocks(q)


@router.get("/crypto/search", response_model=list[CryptoSearchItem])
def search_crypto(user: User, q: str = ""):
    """CoinGecko coin search; [] under 2 characters or when CoinGecko fails."""
    return svc.search_crypto(q)


# --- stocks ---------------------------------------------------------------------------


def _stock(conn, tx_id: int, user_id: int) -> StockTxOut:
    row = conn.execute(f"{svc.STOCK_TX_SELECT} WHERE id = ? AND user_id = ?", (tx_id, user_id)).fetchone()
    if row is None:
        raise ApiError(404, NOT_FOUND)
    return StockTxOut(**svc.transaction_out(row))


@router.post("/stocks", response_model=StockTxSaved)
def add_stock(body: StockTxIn, user: User, conn: DB):
    fields = svc.parse_stock_form(body.model_dump())
    cur = conn.execute(
        """
        INSERT INTO stock_transactions
            (user_id, symbol, ticker, instrument_name, tx_type, quantity, price_per_unit, fee, broker,
             transacted_at, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (user.id, *fields),
    )
    conn.commit()
    tx_type = fields[3]
    return StockTxSaved(message=f"Stock {tx_type} recorded.", transaction=_stock(conn, int(cur.lastrowid), user.id))


@router.put("/stocks/{tx_id}", response_model=StockTxSaved)
def edit_stock(tx_id: int, body: StockTxIn, user: User, conn: DB):
    fields = svc.parse_stock_form(body.model_dump())
    cur = conn.execute(
        """
        UPDATE stock_transactions
        SET symbol = ?, ticker = ?, instrument_name = ?, tx_type = ?,
            quantity = ?, price_per_unit = ?, fee = ?, broker = ?,
            transacted_at = ?, notes = ?
        WHERE id = ? AND user_id = ?
        """,
        (*fields, tx_id, user.id),
    )
    if cur.rowcount == 0:
        raise ApiError(404, NOT_FOUND)
    conn.commit()
    return StockTxSaved(message="Transaction updated.", transaction=_stock(conn, tx_id, user.id))


@router.delete("/stocks/{tx_id}", response_model=OkOut)
def delete_stock(tx_id: int, user: User, conn: DB):
    cur = conn.execute("DELETE FROM stock_transactions WHERE id = ? AND user_id = ?", (tx_id, user.id))
    if cur.rowcount == 0:
        raise ApiError(404, NOT_FOUND)
    conn.commit()
    return OkOut(message="Transaction removed.")


# --- crypto ---------------------------------------------------------------------------


def _crypto(conn, tx_id: int, user_id: int) -> CryptoTxOut:
    row = conn.execute(f"{svc.CRYPTO_TX_SELECT} WHERE id = ? AND user_id = ?", (tx_id, user_id)).fetchone()
    if row is None:
        raise ApiError(404, NOT_FOUND)
    return CryptoTxOut(**svc.transaction_out(row))


@router.post("/crypto", response_model=CryptoTxSaved)
def add_crypto(body: CryptoTxIn, user: User, conn: DB):
    fields = svc.parse_crypto_form(body.model_dump())
    cur = conn.execute(
        """
        INSERT INTO crypto_transactions
            (user_id, coin_id, coin_symbol, coin_name, tx_type, quantity, price_per_unit, fee, exchange,
             transacted_at, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (user.id, *fields),
    )
    conn.commit()
    tx_type = fields[3]
    return CryptoTxSaved(message=f"Crypto {tx_type} recorded.", transaction=_crypto(conn, int(cur.lastrowid), user.id))


@router.put("/crypto/{tx_id}", response_model=CryptoTxSaved)
def edit_crypto(tx_id: int, body: CryptoTxIn, user: User, conn: DB):
    fields = svc.parse_crypto_form(body.model_dump())
    cur = conn.execute(
        """
        UPDATE crypto_transactions
        SET coin_id = ?, coin_symbol = ?, coin_name = ?, tx_type = ?,
            quantity = ?, price_per_unit = ?, fee = ?, exchange = ?,
            transacted_at = ?, notes = ?
        WHERE id = ? AND user_id = ?
        """,
        (*fields, tx_id, user.id),
    )
    if cur.rowcount == 0:
        raise ApiError(404, NOT_FOUND)
    conn.commit()
    return CryptoTxSaved(message="Transaction updated.", transaction=_crypto(conn, tx_id, user.id))


@router.delete("/crypto/{tx_id}", response_model=OkOut)
def delete_crypto(tx_id: int, user: User, conn: DB):
    cur = conn.execute("DELETE FROM crypto_transactions WHERE id = ? AND user_id = ?", (tx_id, user.id))
    if cur.rowcount == 0:
        raise ApiError(404, NOT_FOUND)
    conn.commit()
    return OkOut(message="Transaction removed.")
