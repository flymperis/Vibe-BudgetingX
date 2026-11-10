/**
 * Money formatting. Mirrors the old app's `money` Jinja filter (app.py) exactly:
 *
 *   1527.08            -> "1.527,08 €"
 *   -12                -> "-12,00 €"
 *   5, {signed: true}  -> "+5,00 €"
 *   1234.5, '$'        -> "$1.234,50"     (stock quotes)
 *   -3, '$'            -> "-$3,00"
 *   null / '' / junk   -> "—"
 *
 * Python formats with `f"{abs(x):,.2f}"`, which rounds the exact binary value
 * half-to-even. `Number#toFixed` rounds exact ties up instead, so ties (only
 * possible when x * 8 is an odd integer, e.g. 0.125) are handled by hand.
 * Unlike Python, NaN/Infinity give the em dash too (Python would print "nan €").
 */

export type Currency = '€' | '$' | ''

export interface FormatMoneyOptions {
  currency?: Currency
  /** Show "+" in front of positive amounts. Negative amounts always show "-". */
  signed?: boolean
}

export const EM_DASH = '—'

/** Python's float(value), or null where that would raise or not be finite. */
export function toAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  let n: number
  if (typeof value === 'number') n = value
  else if (typeof value === 'boolean') n = value ? 1 : 0
  else if (typeof value === 'string') {
    const s = value.trim()
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null
    n = Number(s)
  } else return null
  return Number.isFinite(n) ? n : null
}

/** abs(x) with two decimals, rounded like Python's format(). */
function fixed2(abs: number): string {
  const eighths = abs * 8
  if (Number.isInteger(eighths) && eighths % 2 === 1 && abs < 2 ** 50) {
    // Exact tie at the third decimal: round half to even.
    const floor = Math.floor(abs * 100)
    const cents = floor % 2 === 0 ? floor : floor + 1
    return (cents / 100).toFixed(2)
  }
  return abs.toFixed(2)
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function formatMoney(value: unknown, options: FormatMoneyOptions = {}): string {
  const { currency = '€', signed = false } = options
  const amount = toAmount(value)
  if (amount === null) return EM_DASH

  const sign = amount < 0 ? '-' : signed && amount > 0 ? '+' : ''
  const [intPart, decPart] = fixed2(Math.abs(amount)).split('.')
  const digits = `${groupThousands(intPart)},${decPart}`
  if (currency === '$') return `${sign}$${digits}`
  return currency ? `${sign}${digits} ${currency}` : `${sign}${digits}`
}

export type AmountClass = 'amount-pos' | 'amount-neg' | 'amount-zero'

/**
 * CSS class for colouring an amount (old `amount_class` filter). The sign is
 * always in the text as well, so colour never carries the meaning on its own.
 */
export function amountClass(value: unknown): AmountClass {
  const amount = toAmount(value)
  if (amount === null) return 'amount-zero'
  if (amount > 0) return 'amount-pos'
  if (amount < 0) return 'amount-neg'
  return 'amount-zero'
}
