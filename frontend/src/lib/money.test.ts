import { amountClass, formatMoney } from './money'

describe('formatMoney (mirrors the old money filter)', () => {
  it.each([
    [1527.08, {}, '1.527,08 €'],
    [-12, {}, '-12,00 €'],
    [5, { signed: true }, '+5,00 €'],
    [-5, { signed: true }, '-5,00 €'],
    [0, { signed: true }, '0,00 €'],
    [1234.5, { currency: '$' as const }, '$1.234,50'],
    [-3, { currency: '$' as const }, '-$3,00'],
    [7, { currency: '$' as const, signed: true }, '+$7,00'],
    [1234567.891, {}, '1.234.567,89 €'],
    [999.999, {}, '1.000,00 €'],
    [12, { currency: '' as const }, '12,00'],
    ['12.5', {}, '12,50 €'],
    [' 3 ', {}, '3,00 €'],
    [0.5, {}, '0,50 €'],
  ])('%s %o -> %s', (value, opts, expected) => {
    expect(formatMoney(value, opts)).toBe(expected)
  })

  it('returns an em dash for missing or junk values', () => {
    for (const v of [null, undefined, '', 'abc', Number.NaN, Infinity, {}, '1,5']) {
      expect(formatMoney(v)).toBe('—')
    }
  })

  it('rounds exact ties half to even like Python', () => {
    // Python: f"{0.125:.2f}" == "0.12", f"{0.375:.2f}" == "0.38", 2.675 / 1.005 are below the tie in binary
    expect(formatMoney(0.125)).toBe('0,12 €')
    expect(formatMoney(0.375)).toBe('0,38 €')
    expect(formatMoney(2.675)).toBe('2,67 €')
    expect(formatMoney(1.005)).toBe('1,00 €')
    expect(formatMoney(10.625)).toBe('10,62 €')
  })

  it('keeps the minus on amounts that round to zero, like Python', () => {
    expect(formatMoney(-0.001)).toBe('-0,00 €')
    expect(formatMoney(-0)).toBe('0,00 €')
  })
})

describe('amountClass', () => {
  it('classifies by sign', () => {
    expect(amountClass(3)).toBe('amount-pos')
    expect(amountClass(-0.01)).toBe('amount-neg')
    expect(amountClass(0)).toBe('amount-zero')
    expect(amountClass(null)).toBe('amount-zero')
    expect(amountClass('x')).toBe('amount-zero')
  })
})
