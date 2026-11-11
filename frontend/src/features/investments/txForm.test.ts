import { describe, expect, it } from 'vitest'
import {
  applyCryptoPick,
  applyStockPick,
  cryptoBody,
  emptyTxForm,
  numberField,
  numberToInput,
  pickResolvedStock,
  shouldResolveSymbol,
  stockBody,
  txToForm,
} from './txForm'

describe('emptyTxForm', () => {
  it('defaults like the old forms', () => {
    expect(emptyTxForm('stocks', '2026-11-10')).toMatchObject({
      txType: 'buy',
      fee: '0',
      venue: 'Freedom24',
      date: '2026-11-10',
    })
    expect(emptyTxForm('crypto', '2026-11-10').venue).toBe('')
  })
})

describe('numberField', () => {
  it('accepts comma or dot and passes junk through for the server message', () => {
    expect(numberField('0,5')).toBe(0.5)
    expect(numberField(' 38000.25 ')).toBe(38000.25)
    expect(numberField('')).toBe('')
    expect(numberField('abc')).toBe('abc')
  })
})

describe('numberToInput', () => {
  it('never uses exponent notation', () => {
    expect(numberToInput(0.015)).toBe('0.015')
    expect(numberToInput(1e-7)).toBe('0.0000001')
    expect(numberToInput(38000)).toBe('38000')
  })
})

describe('bodies', () => {
  const f = {
    ...emptyTxForm('crypto', '2026-11-10'),
    code: ' bitcoin ',
    symbol: 'btc',
    name: 'Bitcoin',
    quantity: '0,015',
    price: '38000',
    fee: '2,5',
    venue: 'Binance ',
    notes: ' first ',
    txType: 'sell' as const,
  }
  it('maps the crypto form', () => {
    expect(cryptoBody(f)).toEqual({
      coin_id: 'bitcoin',
      coin_symbol: 'btc',
      coin_name: 'Bitcoin',
      tx_type: 'sell',
      quantity: 0.015,
      price_per_unit: 38000,
      fee: 2.5,
      exchange: 'Binance',
      transacted_at: '2026-11-10',
      notes: 'first',
    })
  })
  it('maps the stock form', () => {
    expect(stockBody({ ...f, code: 'VUAA.EU', symbol: 'VUAA', name: 'Vanguard', venue: 'Freedom24' })).toEqual({
      symbol: 'VUAA.EU',
      ticker: 'VUAA',
      instrument_name: 'Vanguard',
      tx_type: 'sell',
      quantity: 0.015,
      price_per_unit: 38000,
      fee: 2.5,
      broker: 'Freedom24',
      transacted_at: '2026-11-10',
      notes: 'first',
    })
  })
})

describe('txToForm', () => {
  it('fills the edit form from a stock transaction', () => {
    const form = txToForm('stocks', {
      id: 1,
      symbol: 'AAPL',
      ticker: 'AAPL',
      instrument_name: 'Apple Inc',
      tx_type: 'buy',
      quantity: 5,
      price_per_unit: 182.3,
      fee: 1,
      broker: 'Freedom24',
      transacted_at: '2026-01-22',
      notes: 'x',
      total: 912.5,
    })
    expect(form).toMatchObject({
      code: 'AAPL',
      symbol: 'AAPL',
      name: 'Apple Inc',
      quantity: '5',
      price: '182.3',
      fee: '1',
      venue: 'Freedom24',
    })
  })
})

describe('search picks', () => {
  it('crypto pick upper-cases the symbol', () => {
    const f = applyCryptoPick(emptyTxForm('crypto', 'd'), {
      id: 'bitcoin',
      symbol: 'btc',
      name: 'Bitcoin',
      thumb: '',
    })
    expect([f.code, f.symbol, f.name]).toEqual(['bitcoin', 'BTC', 'Bitcoin'])
  })
  it('stock pick fills symbol, ticker and name', () => {
    const f = applyStockPick(emptyTxForm('stocks', 'd'), {
      symbol: 'VUAA.DE',
      ticker: 'VUAA',
      name: 'Vanguard',
      type: 'ETP',
    })
    expect([f.code, f.symbol, f.name]).toEqual(['VUAA.DE', 'VUAA', 'Vanguard'])
  })
  it('symbol blur resolves only with 3+ characters and missing ticker/name', () => {
    const base = emptyTxForm('stocks', 'd')
    expect(shouldResolveSymbol({ ...base, code: 'AA' })).toBe(false)
    expect(shouldResolveSymbol({ ...base, code: 'AAPL' })).toBe(true)
    expect(shouldResolveSymbol({ ...base, code: 'AAPL', symbol: 'AAPL', name: 'Apple' })).toBe(false)
  })
  it('takes the exact symbol, else the only result', () => {
    const a = { symbol: 'AAPL', ticker: 'AAPL', name: 'Apple', type: 'Common Stock' }
    const b = { symbol: 'AAPL.MX', ticker: 'AAPL', name: 'Apple MX', type: 'Common Stock' }
    expect(pickResolvedStock('aapl', [b, a])).toBe(a)
    expect(pickResolvedStock('AAPL.DE', [b])).toBe(b)
    expect(pickResolvedStock('AAPL.DE', [a, b])).toBeNull()
  })
})
