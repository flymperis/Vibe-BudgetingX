/**
 * One shape for crypto and stock rows, so both tabs share the same components.
 * Only field mapping here: every number is the API's.
 */
import type { Currency } from '@/lib/money'
import type { AssetKind, CryptoPortfolio, CryptoTx, StockPortfolio, StockTx } from './api'

export interface HoldingView {
  key: string
  /** BTC / VUAA */
  title: string
  /** Bitcoin / Vanguard S&P 500 ... */
  name: string
  /** Stocks: the broker symbol (VUAA.EU). */
  code?: string
  quantity: number
  avgBuyPrice: number
  totalCost: number
  currentPrice: number | null | undefined
  change24h: number | null | undefined
  currentValue: number | null | undefined
  pnl: number | null | undefined
  pnlPct: number | undefined
}

export interface TxView {
  id: number
  holdingKey: string
  date: string
  type: 'buy' | 'sell'
  title: string
  code?: string
  quantity: number
  price: number
  fee: number
  total: number
  venue: string
  notes: string
  raw: CryptoTx | StockTx
}

export interface PortfolioView {
  kind: AssetKind
  currency: Currency
  /** Significant digits of quantities (old "%.6g" / "%.4g"). */
  quantityDigits: number
  totalValue: number | null
  totalInvested: number
  totalPnl: number | null
  totalPnlPct: number | null
  pricesLoaded: boolean
  pricesAgeSeconds: number | null
  holdings: HoldingView[]
  transactions: TxView[]
}

const txType = (t: string): 'buy' | 'sell' => (t === 'sell' ? 'sell' : 'buy')

export function cryptoView(p: CryptoPortfolio): PortfolioView {
  return {
    kind: 'crypto',
    currency: '€',
    quantityDigits: 6,
    totalValue: p.total_value ?? null,
    totalInvested: p.total_invested,
    totalPnl: p.total_pnl ?? null,
    totalPnlPct: p.total_pnl_pct ?? null,
    pricesLoaded: p.prices_loaded,
    pricesAgeSeconds: p.prices_age_seconds ?? null,
    holdings: p.holdings.map((h) => ({
      key: h.coin_id,
      title: h.coin_symbol,
      name: h.coin_name,
      quantity: h.quantity,
      avgBuyPrice: h.avg_buy_price,
      totalCost: h.total_cost,
      currentPrice: h.current_price,
      change24h: h.change_24h,
      currentValue: h.current_value,
      pnl: h.pnl,
      pnlPct: h.pnl_pct,
    })),
    transactions: p.transactions.map((tx) => ({
      id: tx.id,
      holdingKey: tx.coin_id,
      date: tx.transacted_at,
      type: txType(tx.tx_type),
      title: tx.coin_symbol.toUpperCase(),
      quantity: tx.quantity,
      price: tx.price_per_unit,
      fee: tx.fee,
      total: tx.total,
      venue: tx.exchange,
      notes: tx.notes,
      raw: tx,
    })),
  }
}

export function stockView(p: StockPortfolio): PortfolioView {
  return {
    kind: 'stocks',
    currency: '$',
    quantityDigits: 4,
    totalValue: p.total_value ?? null,
    totalInvested: p.total_invested,
    totalPnl: p.total_pnl ?? null,
    totalPnlPct: p.total_pnl_pct ?? null,
    pricesLoaded: p.prices_loaded,
    pricesAgeSeconds: p.prices_age_seconds ?? null,
    holdings: p.holdings.map((h) => ({
      key: h.symbol,
      title: h.ticker,
      name: h.instrument_name,
      code: h.symbol,
      quantity: h.quantity,
      avgBuyPrice: h.avg_buy_price,
      totalCost: h.total_cost,
      currentPrice: h.current_price,
      change24h: h.change_24h,
      currentValue: h.current_value,
      pnl: h.pnl,
      pnlPct: h.pnl_pct,
    })),
    transactions: p.transactions.map((tx) => ({
      id: tx.id,
      holdingKey: tx.symbol,
      date: tx.transacted_at,
      type: txType(tx.tx_type),
      title: tx.ticker,
      code: tx.symbol,
      quantity: tx.quantity,
      price: tx.price_per_unit,
      fee: tx.fee,
      total: tx.total,
      venue: tx.broker,
      notes: tx.notes,
      raw: tx,
    })),
  }
}
