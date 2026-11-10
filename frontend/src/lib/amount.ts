/**
 * Amount entry. The value model shared by the keypad (mobile) and the text
 * input (desktop) is a canonical string: digits, optionally "." and at most two
 * decimals ("", "12", "12.", "12.5", "12.50"). parseAmountInput turns it, or
 * anything else the user typed, into a number.
 */

/** Most integer digits the keypad accepts (999.999.999,99). */
export const MAX_INTEGER_DIGITS = 9

/**
 * "12,50" / "12.50" / " 12 " -> 12.5 ; "" -> null ; junk -> null.
 * Same rule as the old app's form parsing: strip, replace "," with ".", float().
 * Thousands separators are therefore not accepted ("1.234,50" fails there too).
 */
export function parseAmountInput(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const text = String(raw ?? '')
    .trim()
    .replace(/,/g, '.')
  if (!text) return null
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'decimal' | 'backspace'

/** Applies one keypad press to the canonical amount string. */
export function keypadPress(value: string, key: KeypadKey): string {
  if (key === 'backspace') return value.slice(0, -1)
  if (key === 'decimal') {
    if (value.includes('.')) return value
    return (value || '0') + '.'
  }
  const [intPart, decPart] = value.split('.')
  if (decPart !== undefined) {
    if (decPart.length >= 2) return value
    return value + key
  }
  if (intPart === '0') return key // no leading zeros
  if (intPart.length >= MAX_INTEGER_DIGITS) return value
  return value + key
}

/**
 * Normalises free typing (desktop input) into the canonical string: "," or "."
 * as the decimal mark, everything else dropped, two decimals at most.
 */
export function sanitizeAmountTyping(text: string): string {
  let out = ''
  let seenDot = false
  let decimals = 0
  for (const ch of text.replace(/,/g, '.')) {
    if (ch >= '0' && ch <= '9') {
      if (seenDot) {
        if (decimals >= 2) continue
        decimals++
      } else if (out.replace(/^0+/, '').length >= MAX_INTEGER_DIGITS) continue
      out += ch
    } else if (ch === '.' && !seenDot) {
      seenDot = true
      out = (out || '0') + '.'
    }
  }
  return out.replace(/^0+(?=\d)/, '')
}

/** Canonical string -> what the user sees: "1234.5" -> "1.234,5", "" -> "0". */
export function displayAmountText(value: string): string {
  if (!value) return '0'
  const [intPart, decPart] = value.split('.')
  const grouped = (intPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return decPart === undefined ? grouped : `${grouped},${decPart}`
}

/** number -> canonical string (absolute value), for editing an existing amount. */
export function amountToText(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  return Math.abs(value)
    .toFixed(2)
    .replace(/\.?0+$/, '')
}
