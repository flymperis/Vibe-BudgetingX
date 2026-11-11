/**
 * Buy/sell form model and its mapping to the API bodies. Pure functions, unit-tested.
 *
 * Field meaning by asset class:
 *   crypto: code = coin_id ("bitcoin"), symbol = coin_symbol ("BTC"), name = coin_name, venue = exchange
 *   stocks: code = symbol ("VUAA.EU"), symbol = ticker ("VUAA"), name = instrument_name, venue = broker
 */
import { parseAmountInput } from '@/lib/amount'
import type {
  AssetKind,
  CryptoSearchItem,
  CryptoTx,
  CryptoTxIn,
  StockSearchItem,
  StockTx,
  StockTxIn,
} from './api'

export type TxType = 'buy' | 'sell'

export interface TxFormState {
  txType: TxType
  code: string
  symbol: string
  name: string
  quantity: string
  price: string
  fee: string
  venue: string
  date: string
  notes: string
}

/** Old form defaults: buy, fee 0, today; stocks pre-fill broker "Freedom24". */
export function emptyTxForm(kind: AssetKind, today: string): TxFormState {
  return {
    txType: 'buy',
    code: '',
    symbol: '',
    name: '',
    quantity: '',
    price: '',
    fee: '0',
    venue: kind === 'stocks' ? 'Freedom24' : '',
    date: today,
    notes: '',
  }
}

/** Number as typed for an edit field: plain digits with "." (no exponent, no grouping). */
export function numberToInput(value: number): string {
  if (!Number.isFinite(value)) return ''
  const text = String(value)
  if (!/e/i.test(text)) return text
  return value.toFixed(12).replace(/0+$/, '').replace(/\.$/, '')
}

export function txToForm(kind: 'crypto', tx: CryptoTx): TxFormState
export function txToForm(kind: 'stocks', tx: StockTx): TxFormState
export function txToForm(kind: AssetKind, tx: CryptoTx | StockTx): TxFormState
export function txToForm(kind: AssetKind, tx: CryptoTx | StockTx): TxFormState {
  const common = {
    txType: (tx.tx_type === 'sell' ? 'sell' : 'buy') as TxType,
    quantity: numberToInput(tx.quantity),
    price: numberToInput(tx.price_per_unit),
    fee: numberToInput(tx.fee),
    date: tx.transacted_at,
    notes: tx.notes ?? '',
  }
  if (kind === 'crypto') {
    const c = tx as CryptoTx
    return { ...common, code: c.coin_id, symbol: c.coin_symbol, name: c.coin_name, venue: c.exchange ?? '' }
  }
  const s = tx as StockTx
  return { ...common, code: s.symbol, symbol: s.ticker, name: s.instrument_name, venue: s.broker ?? '' }
}

/**
 * "0,5" and "0.5" become 0.5. Anything else is sent as typed so the server
 * answers with the old message ("Invalid quantity, price, or fee."); a blank
 * fee stays blank (the server stores 0).
 */
export function numberField(text: string): number | string {
  const value = parseAmountInput(text)
  return value === null ? text.trim() : value
}

export function cryptoBody(f: TxFormState): CryptoTxIn {
  return {
    coin_id: f.code.trim(),
    coin_symbol: f.symbol.trim(),
    coin_name: f.name.trim(),
    tx_type: f.txType,
    quantity: numberField(f.quantity),
    price_per_unit: numberField(f.price),
    fee: numberField(f.fee),
    exchange: f.venue.trim(),
    transacted_at: f.date,
    notes: f.notes.trim(),
  }
}

export function stockBody(f: TxFormState): StockTxIn {
  return {
    symbol: f.code.trim(),
    ticker: f.symbol.trim(),
    instrument_name: f.name.trim(),
    tx_type: f.txType,
    quantity: numberField(f.quantity),
    price_per_unit: numberField(f.price),
    fee: numberField(f.fee),
    broker: f.venue.trim(),
    transacted_at: f.date,
    notes: f.notes.trim(),
  }
}

/** Old crypto pick: coin id, upper-cased symbol and name fill the form. */
export function applyCryptoPick(f: TxFormState, c: CryptoSearchItem): TxFormState {
  return { ...f, code: c.id, symbol: c.symbol.toUpperCase(), name: c.name }
}

/** Old stock pick: symbol, ticker and name fill the form. */
export function applyStockPick(f: TxFormState, c: StockSearchItem): TxFormState {
  return { ...f, code: c.symbol, symbol: c.ticker, name: c.name }
}

/**
 * Old symbol blur rule: with 3+ characters and ticker/name not yet filled,
 * search the symbol and take the exact match, or the only result.
 */
export function shouldResolveSymbol(f: TxFormState): boolean {
  const sym = f.code.trim()
  if (sym.length < 3) return false
  return !(f.symbol && f.name)
}

export function pickResolvedStock(symbol: string, items: StockSearchItem[]): StockSearchItem | null {
  const sym = symbol.trim().toUpperCase()
  const exact = items.find((i) => i.symbol.toUpperCase() === sym)
  return exact ?? (items.length === 1 ? items[0] : null)
}
