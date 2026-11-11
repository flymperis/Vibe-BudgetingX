import { describe, expect, it } from 'vitest'
import {
  applySnapshot,
  copyPreview,
  defaultsPayload,
  distribute,
  draftFromFormRows,
  liveTotal,
  remainingOf,
  singleDefaultPayload,
  type DraftRow,
} from './defaults'

const row = (id: number, value: string, avg = 0, fixed = false): DraftRow => ({
  id,
  name: `c${id}`,
  avg,
  active: avg > 0,
  fixed,
  value,
})

describe('draftFromFormRows', () => {
  it('turns saved defaults into editable text, blank for none', () => {
    const rows = draftFromFormRows([
      { id: 1, name: 'A', default: 650, avg: 10, active: true, fixed: true },
      { id: 2, name: 'B', default: 12.5, avg: 0, active: false, fixed: false },
      { id: 3, name: 'C', default: null, avg: 0, active: false, fixed: false },
    ])
    expect(rows.map((r) => r.value)).toEqual(['650', '12.5', ''])
    expect(rows[0].fixed).toBe(true)
  })
})

describe('liveTotal', () => {
  it('adds every field and Everything else; blanks and junk count as 0', () => {
    expect(liveTotal([row(1, '10.1'), row(2, ''), row(3, '0.2')], '5')).toBe(15.3)
    expect(liveTotal([], '')).toBe(0)
  })
})

describe('distribute', () => {
  it('needs a positive total', () => {
    expect(distribute([row(1, '', 10)], '')).toEqual({ ok: false, reason: 'noTotal' })
    expect(distribute([row(1, '', 10)], '0')).toEqual({ ok: false, reason: 'noTotal' })
  })

  it('refuses when fixed amounts exceed the total', () => {
    expect(distribute([row(1, '300', 0, true), row(2, '', 10)], '200')).toEqual({
      ok: false,
      reason: 'fixedExceed',
      fixedTotal: 300,
    })
  })

  it('reports when fixed amounts already cover the total, or nothing is left', () => {
    expect(distribute([row(1, '200', 0, true), row(2, '', 10)], '200')).toEqual({
      ok: false,
      reason: 'fixedCover',
    })
  })

  it('needs non-fixed categories with history', () => {
    expect(distribute([row(1, '', 0), row(2, '50', 30, true)], '100')).toEqual({
      ok: false,
      reason: 'noHistory',
    })
  })

  it('splits by average with the largest-remainder method, keeping fixed and no-history rows', () => {
    const rows = [row(1, '100', 50, true), row(2, '7', 1), row(3, '', 1), row(4, '', 1), row(5, '9', 0)]
    const r = distribute(rows, '200')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 100 left after the fixed row, split three ways: 33.34 + 33.33 + 33.33
    const values = r.rows.map((x) => x.value)
    expect(values[0]).toBe('100')
    expect(values[4]).toBe('9')
    const shares = values.slice(1, 4).map(Number)
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10)
    expect(shares.sort()).toEqual([33.33, 33.33, 33.34])
    expect(r).toMatchObject({ fixedCount: 1, fixedTotal: 100, remaining: 100, changed: 3, withoutHistory: 1 })
  })

  it('weights shares by the 3-month average', () => {
    const r = distribute([row(1, '', 300), row(2, '', 100)], '1000')
    expect(r.ok && r.rows.map((x) => x.value)).toEqual(['750', '250'])
  })
})

describe('copy from another month', () => {
  const snapshot = { ym: '2026-10', amounts: { '1': 50, '2': 70 } }
  const rows = [row(1, '40', 0, true), row(2, '10'), row(3, '15')]

  it('previews kept (fixed) / amount / unchanged and the total after the prefill', () => {
    const p = copyPreview(rows, snapshot, '5')
    expect(p.items.map((i) => [i.kind, i.amount])).toEqual([
      ['fixed', 40],
      ['amount', 70],
      ['unchanged', 15],
    ])
    expect(p.total).toBe(130)
  })

  it('prefills only non-fixed rows the snapshot has', () => {
    expect(applySnapshot(rows, snapshot).map((r) => r.value)).toEqual(['40', '70', '15'])
  })
})

describe('payloads', () => {
  it('sends every row in amounts, fixed only for checked rows, and other_amount', () => {
    expect(defaultsPayload([row(1, '10', 0, true), row(2, '')], '')).toEqual({
      amounts: { '1': '10', '2': '' },
      fixed: { '1': true },
      other_amount: '',
    })
  })

  it('one category from the sheet keeps its fixed flag and leaves other_amount alone', () => {
    expect(singleDefaultPayload(7, '25.5', true)).toEqual({ amounts: { '7': '25.5' }, fixed: { '7': true } })
    expect(singleDefaultPayload(7, '', false)).toEqual({ amounts: { '7': '' }, fixed: {} })
    expect('other_amount' in singleDefaultPayload(7, '1', false)).toBe(false)
  })
})

describe('remainingOf', () => {
  it('shows how much over (positive) when over, else what is left', () => {
    expect(remainingOf({ remaining: -79.5, status: 'over' })).toEqual({ word: 'over', amount: 79.5 })
    expect(remainingOf({ remaining: 24, status: 'warn' })).toEqual({ word: 'left', amount: 24 })
  })
})
