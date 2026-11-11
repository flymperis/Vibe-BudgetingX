import type { Schema } from '@/api/types'
import type { MessageKey, TFunction } from '@/i18n'
import { amountToText, parseAmountInput } from '@/lib/amount'

export type RecurringRule = Schema<'RecurringOut'>
export type RecurringIn = Schema<'RecurringIn'>
export type EntryType = 'expense' | 'income'
export type IntervalUnit = 'week' | 'month' | 'year'
export const INTERVAL_UNITS: IntervalUnit[] = ['week', 'month', 'year']
export const MAX_INTERVAL = 99

export interface RecurringForm {
  type: EntryType
  categoryId: number | null
  /** Canonical amount string (lib/amount). */
  amount: string
  accountId: number | null
  intervalCount: string
  intervalUnit: IntervalUnit
  /** First date; '' only for old rules that never had one (then dayOfMonth is used). */
  startDate: string
  dayOfMonth: string
  indefinitely: boolean
  times: string
  notes: string
  enabled: boolean
}

/** New rule: every 1 month from today, indefinitely (old "New recurring rule" modal). */
export function emptyRecurringForm(
  today: string,
  firstCategoryId: number | null,
  firstAccountId: number | null,
): RecurringForm {
  return {
    type: 'expense',
    categoryId: firstCategoryId,
    amount: '',
    accountId: firstAccountId,
    intervalCount: '1',
    intervalUnit: 'month',
    startDate: today,
    dayOfMonth: String(Number(today.slice(8, 10)) || 1),
    indefinitely: true,
    times: '',
    notes: '',
    enabled: true,
  }
}

export function recurringFormFromRule(rule: RecurringRule): RecurringForm {
  return {
    type: rule.entry_type === 'income' ? 'income' : 'expense',
    categoryId: rule.category_id,
    amount: amountToText(rule.amount),
    accountId: rule.account_id,
    intervalCount: String(rule.interval_count || 1),
    intervalUnit: (INTERVAL_UNITS as string[]).includes(rule.interval_unit)
      ? (rule.interval_unit as IntervalUnit)
      : 'month',
    startDate: rule.start_date ?? '',
    dayOfMonth: String(rule.day_of_month || 1),
    indefinitely: !rule.months_to_run,
    times: rule.months_to_run ? String(rule.months_to_run) : '',
    notes: rule.notes ?? '',
    enabled: rule.enabled,
  }
}

function wholeNumber(text: string): number | null {
  const s = text.trim()
  return /^\d+$/.test(s) ? Number(s) : null
}

/**
 * First problem to fix, or null. Same rules as the server (helpers.py); the
 * server checks again and its message is shown when it disagrees.
 * `requireStartDate`: new rules always have a first date (old modal: required).
 */
export function validateRecurring(form: RecurringForm, requireStartDate: boolean): MessageKey | null {
  if (form.categoryId === null || form.accountId === null) return 'recurring.errChoose'
  const amount = parseAmountInput(form.amount)
  if (amount === null || amount <= 0) return 'recurring.errAmount'
  const count = wholeNumber(form.intervalCount)
  if (count === null || count < 1 || count > MAX_INTERVAL) return 'recurring.errInterval'
  if (!form.indefinitely) {
    const times = wholeNumber(form.times)
    if (times === null || times < 1) return 'recurring.errTimes'
  }
  if ((requireStartDate || form.startDate) && !/^\d{4}-\d{2}-\d{2}$/.test(form.startDate)) {
    return 'recurring.errStartDate'
  }
  if (!form.startDate) {
    const day = wholeNumber(form.dayOfMonth)
    if (day === null || day < 1 || day > 31) return 'recurring.errDay'
  }
  return null
}

/**
 * Body for POST/PUT /api/recurring. `enabled` is ALWAYS sent: the server
 * pauses a rule when it is missing (old unticked checkbox). Without a first
 * date the key is left out, which keeps the old day-of-month behaviour.
 */
export function buildRecurringBody(form: RecurringForm): RecurringIn {
  const body: RecurringIn = {
    category_choice: `${form.type === 'expense' ? 'e' : 'i'}-${form.categoryId}`,
    amount: parseAmountInput(form.amount),
    account_id: form.accountId,
    interval_unit: form.intervalUnit,
    interval_count: Number(form.intervalCount.trim()),
    indefinitely: form.indefinitely,
    notes: form.notes.trim(),
    enabled: form.enabled,
  }
  if (!form.indefinitely) body.months_to_run = Number(form.times.trim())
  if (form.startDate) body.start_date = form.startDate
  else body.day_of_month = Number(form.dayOfMonth.trim())
  return body
}

/** "Κάθε μήνα" / "Κάθε 3 εβδομάδες" (old "every N units"). */
export function scheduleLabel(t: TFunction, unit: string, count: number): string {
  const u = (INTERVAL_UNITS as string[]).includes(unit) ? (unit as IntervalUnit) : 'month'
  return count > 1 ? t(`recurring.everyMany.${u}`, { n: count }) : t(`recurring.everyOne.${u}`)
}

/** "Χωρίς λήξη" / "1 φορά" / "12 φορές" (old "indefinitely" / "N time(s)"). */
export function durationLabel(t: TFunction, monthsToRun: number | null | undefined): string {
  if (!monthsToRun) return t('recurring.indefinitely')
  return monthsToRun === 1 ? t('recurring.timesOne') : t('recurring.timesMany', { n: monthsToRun })
}
