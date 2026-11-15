/**
 * Month end reconciliation form logic. Bank accounts take their signed
 * balance; cards take what is owed (positive), sent as a negative balance
 * like the card's balance is stored.
 */
import { parseAmountInput } from '@/lib/amount'

export interface ReconcileRowInfo {
  account_id: number
  is_credit_card: boolean
  system_balance: number
}

/** What the input shows for the recorded balance: owed for a card, the balance otherwise. */
export function recordedValue(row: ReconcileRowInfo): number {
  const v = row.is_credit_card ? -row.system_balance : row.system_balance
  return Object.is(v, -0) ? 0 : v
}

/** The typed text as an account balance, or null when blank or not a number. */
export function actualBalance(text: string | undefined, isCard: boolean): number | null {
  const value = parseAmountInput(text ?? '')
  if (value === null) return null
  const signed = isCard ? -value : value
  return Math.round(signed * 100) / 100 + 0
}

/** Typing filter: digits, one "-" at the start, one decimal separator, at most two decimals. */
export function sanitizeBalanceTyping(text: string): string {
  let out = text.replace(/[^\d.,-]/g, '').replace(/\./g, ',')
  const negative = out.startsWith('-')
  out = out.replace(/-/g, '')
  const [intPart, ...rest] = out.split(',')
  out = rest.length ? `${intPart},${rest.join('').slice(0, 2)}` : intPart
  return (negative ? '-' : '') + out
}

/** The request's balances: only rows with a valid number typed, in list order. */
export function buildBalances(rows: ReconcileRowInfo[], inputs: Record<number, string>) {
  const out: { account_id: number; actual_balance: number }[] = []
  for (const row of rows) {
    const value = actualBalance(inputs[row.account_id], row.is_credit_card)
    if (value !== null) out.push({ account_id: row.account_id, actual_balance: value })
  }
  return out
}

/** Rows whose text is not blank but is not a number either. */
export function invalidRows(rows: ReconcileRowInfo[], inputs: Record<number, string>): number[] {
  return rows
    .filter(
      (r) =>
        (inputs[r.account_id] ?? '').trim() !== '' &&
        actualBalance(inputs[r.account_id], r.is_credit_card) === null,
    )
    .map((r) => r.account_id)
}
