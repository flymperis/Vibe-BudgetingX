import { describe, expect, it } from 'vitest'
import { normalizeYear, parseAccountParam } from './year'

describe('normalizeYear', () => {
  it('falls back to the current year like the old report_year', () => {
    expect(normalizeYear('2024', 2026)).toBe(2024)
    expect(normalizeYear('', 2026)).toBe(2026)
    expect(normalizeYear(null, 2026)).toBe(2026)
    expect(normalizeYear('abcd', 2026)).toBe(2026)
    expect(normalizeYear('1999', 2026)).toBe(2026)
    expect(normalizeYear('2101', 2026)).toBe(2026)
    expect(normalizeYear('2100', 2026)).toBe(2100)
  })
})

describe('parseAccountParam', () => {
  it('accepts only an id of the user', () => {
    expect(parseAccountParam('3', [1, 3])).toBe(3)
    expect(parseAccountParam('all', [1, 3])).toBeNull()
    expect(parseAccountParam('9', [1, 3])).toBeNull()
    expect(parseAccountParam(null, [1])).toBeNull()
  })
})
