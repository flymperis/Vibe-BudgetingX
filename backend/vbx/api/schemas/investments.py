"""Investments: stock and crypto transactions, holdings, live prices.

Currencies exactly as the old app: crypto prices, costs and values are EUR
(CoinGecko vs_currency=eur); stock prices, costs and values are USD (quotes on
non-USD listings are converted to USD by vbx.core.prices). The two are never
added together.
"""

from __future__ import annotations

from pydantic import BaseModel


class StockTxIn(BaseModel):
    """Lenient like the old form: numbers may be numbers or strings. Missing
    fee = "0", blank fee = 0, fee is stored as its absolute value; blank date =
    today; symbol/ticker upper-cased, tx_type lower-cased, text stripped."""

    symbol: str | None = ""
    ticker: str | None = ""
    instrument_name: str | None = ""
    tx_type: str | None = ""  # buy | sell
    quantity: float | str | None = ""
    price_per_unit: float | str | None = ""
    fee: float | str | None = "0"
    broker: str | None = ""
    transacted_at: str | None = ""
    notes: str | None = ""


class CryptoTxIn(BaseModel):
    """As StockTxIn; coin_id lower-cased, coin_symbol upper-cased."""

    coin_id: str | None = ""
    coin_symbol: str | None = ""
    coin_name: str | None = ""
    tx_type: str | None = ""  # buy | sell
    quantity: float | str | None = ""
    price_per_unit: float | str | None = ""
    fee: float | str | None = "0"
    exchange: str | None = ""
    transacted_at: str | None = ""
    notes: str | None = ""


class StockTxOut(BaseModel):
    id: int
    symbol: str
    ticker: str
    instrument_name: str
    tx_type: str
    quantity: float
    price_per_unit: float  # USD
    fee: float
    broker: str
    transacted_at: str  # YYYY-MM-DD
    notes: str
    total: float  # quantity * price_per_unit + fee


class CryptoTxOut(BaseModel):
    id: int
    coin_id: str
    coin_symbol: str
    coin_name: str
    tx_type: str
    quantity: float
    price_per_unit: float  # EUR
    fee: float
    exchange: str
    transacted_at: str  # YYYY-MM-DD
    notes: str
    total: float  # quantity * price_per_unit + fee


class StockTxSaved(BaseModel):
    message: str  # old flash: "Stock buy recorded." / "Transaction updated."
    transaction: StockTxOut


class CryptoTxSaved(BaseModel):
    message: str  # old flash: "Crypto sell recorded." / "Transaction updated."
    transaction: CryptoTxOut


class _HoldingPrices(BaseModel):
    """Average-cost holding (finance.compute_*_holdings) priced like the old
    panel. When there is no price for it: current_price/current_value/pnl are
    None and pnl_pct is 0 (the old table showed N/A)."""

    quantity: float
    total_cost: float  # cost basis of what is still held, fees included
    avg_buy_price: float
    current_price: float | None = None
    change_24h: float | None = None  # % over 24h from the price source, if any
    current_value: float | None = None
    pnl: float | None = None
    pnl_pct: float = 0


class CryptoHolding(_HoldingPrices):
    coin_id: str
    coin_symbol: str
    coin_name: str


class StockHolding(_HoldingPrices):
    symbol: str
    ticker: str
    instrument_name: str


class _PortfolioTotals(BaseModel):
    total_value: float | None  # None while prices are not loaded (old: "—")
    total_invested: float
    total_pnl: float | None  # None while prices are not loaded
    total_pnl_pct: float | None  # None while prices are not loaded; 0 when nothing invested
    prices_loaded: bool  # old data-prices-loaded
    # Seconds since the shared in-process price cache was filled (old "Updated
    # 1m 5s ago"); None when the old panel showed nothing.
    prices_age_seconds: int | None


class CryptoPortfolio(_PortfolioTotals):
    holdings: list[CryptoHolding]  # by coin name, case-insensitive
    transactions: list[CryptoTxOut]  # newest first


class StockPortfolio(_PortfolioTotals):
    holdings: list[StockHolding]  # by instrument name, case-insensitive
    transactions: list[StockTxOut]  # newest first


class InvestmentsOut(BaseModel):
    # Without FINNHUB_API_KEY the old panel showed: "Optional: set FINNHUB_API_KEY
    # for symbol search. Live prices use Yahoo (yfinance) as fallback."
    finnhub_configured: bool
    price_cache_ttl_seconds: int
    crypto: CryptoPortfolio  # EUR
    stocks: StockPortfolio  # USD


class StockSearchItem(BaseModel):
    symbol: str
    ticker: str
    name: str
    type: str


class CryptoSearchItem(BaseModel):
    id: str
    symbol: str
    name: str
    thumb: str
