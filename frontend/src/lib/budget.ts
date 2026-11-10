/**
 * Budget status, ported from the old budget.py `_status`:
 *   over  when spent > budget
 *   warn  when budget > 0 and spent >= 80% of budget
 *   ok    otherwise
 * Values are rounded to the cent first, as the old code does with _money().
 */
export const WARN_RATIO = 0.8

export type BudgetStatus = 'ok' | 'warn' | 'over'

const cents = (v: number) => Math.round(v * 100) / 100

export function budgetStatus(spent: number, budget: number): BudgetStatus {
  const s = cents(spent)
  const b = cents(budget)
  if (s > b) return 'over'
  if (b > 0 && s >= b * WARN_RATIO) return 'warn'
  return 'ok'
}

/** Bar fill in percent, clamped to 0..100. */
export function budgetPercent(spent: number, budget: number): number {
  if (budget <= 0) return spent > 0 ? 100 : 0
  return Math.max(0, Math.min(100, (spent / budget) * 100))
}
