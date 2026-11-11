import { describe, expect, it } from 'vitest'
import { chartPoints, parseYear } from './api'

describe('parseYear', () => {
  it('accepts 2000..2100 and falls back otherwise', () => {
    expect(parseYear('2025', 2026)).toBe(2025)
    expect(parseYear('1999', 2026)).toBe(2026)
    expect(parseYear('2101', 2026)).toBe(2026)
    expect(parseYear('abc', 2026)).toBe(2026)
    expect(parseYear(null, 2026)).toBe(2026)
  })
})

describe('chartPoints', () => {
  it('keeps the API figures', () => {
    expect(
      chartPoints([{ month: 1, income: 10, expenses: 4, delta: 6, total_balance: 6 }], (m) => `m${m}`),
    ).toEqual([{ month: 1, label: 'm1', income: 10, expenses: 4 }])
  })
})
