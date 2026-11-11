import { describe, expect, it } from 'vitest'
import { formatAge, formatAxisMoney, formatPercent, formatQuantity, monthNominative } from './format'

describe('formatQuantity', () => {
  it('keeps up to N significant digits like "%.6g" / "%.4g", in the user language', () => {
    expect(formatQuantity(0.025, 6, 'el')).toBe('0,025')
    expect(formatQuantity(0.6000000000000001, 6, 'el')).toBe('0,6')
    expect(formatQuantity(1.23456789, 6, 'en')).toBe('1.23457')
    expect(formatQuantity(12.34567, 4, 'el')).toBe('12,35')
    expect(formatQuantity(30, 4, 'el')).toBe('30')
    expect(formatQuantity(null, 6, 'el')).toBe('—')
  })
})

describe('formatPercent', () => {
  it('signs and rounds to one decimal like "%+.1f"', () => {
    expect(formatPercent(45.7736, 'el', { signed: true })).toBe('+45,8%')
    expect(formatPercent(-8.4704, 'en', { signed: true })).toBe('-8.5%')
    expect(formatPercent(29.1066, 'el')).toBe('29,1%')
    expect(formatPercent(82.3, 'el', { digits: 0 })).toBe('82%')
    expect(formatPercent(null, 'el')).toBe('—')
  })
})

describe('formatAge', () => {
  it('formats the price cache age', () => {
    expect(formatAge(4, 'en')).toBe('4s')
    expect(formatAge(65, 'en')).toBe('1m 5s')
    expect(formatAge(120, 'el')).toBe('2λ')
    expect(formatAge(3720, 'el')).toBe('1ω 2λ')
  })
})

describe('formatAxisMoney', () => {
  it('shortens axis labels with the right currency', () => {
    expect(formatAxisMoney(1500, '€', 'el')).toBe('1,5k €')
    expect(formatAxisMoney(-800, '€', 'el')).toBe('-800 €')
    expect(formatAxisMoney(12000, '$', 'en')).toBe('$12k')
    expect(formatAxisMoney(2_500_000, '€', 'en')).toBe('2.5M €')
  })
})

describe('monthNominative', () => {
  it('gives the nominative month name', () => {
    expect(monthNominative(2026, 1, 'el')).toBe('Ιανουάριος')
    expect(monthNominative(2026, 11, 'en')).toBe('November')
  })
})
