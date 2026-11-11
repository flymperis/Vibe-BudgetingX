import { describe, expect, it } from 'vitest'
import { translate, type MessageKey, type TParams } from '@/i18n'
import {
  buildRecurringBody,
  durationLabel,
  emptyRecurringForm,
  recurringFormFromRule,
  scheduleLabel,
  validateRecurring,
  type RecurringRule,
} from './recurringForm'

const t = (k: MessageKey, p?: TParams) => translate(k, p, 'en')

const rule: RecurringRule = {
  id: 7,
  entry_type: 'income',
  category_choice: 'i-3',
  amount: 1800,
  category_id: 3,
  account_id: 2,
  day_of_month: 31,
  months_to_run: 12,
  interval_unit: 'week',
  interval_count: 2,
  start_date: '2026-01-31',
  notes: 'Salary',
  enabled: false,
  account_name: 'Bank',
  category_name: 'Salary',
}

describe('recurringForm', () => {
  it('new rule defaults: monthly, every 1, from today, indefinitely', () => {
    const f = emptyRecurringForm('2026-11-11', 5, 9)
    expect(f).toMatchObject({
      type: 'expense',
      categoryId: 5,
      accountId: 9,
      intervalUnit: 'month',
      intervalCount: '1',
      startDate: '2026-11-11',
      indefinitely: true,
      enabled: true,
    })
  })

  it('round-trips a rule and ALWAYS sends enabled (a missing flag pauses the rule)', () => {
    const f = recurringFormFromRule(rule)
    expect(buildRecurringBody(f)).toEqual({
      category_choice: 'i-3',
      amount: 1800,
      account_id: 2,
      interval_unit: 'week',
      interval_count: 2,
      indefinitely: false,
      months_to_run: 12,
      start_date: '2026-01-31',
      notes: 'Salary',
      enabled: false,
    })
    const on = buildRecurringBody({ ...f, enabled: true, indefinitely: true })
    expect(on.enabled).toBe(true)
    expect(on).not.toHaveProperty('months_to_run')
    expect(on.indefinitely).toBe(true)
  })

  it('a rule without a first date sends day_of_month and no start_date', () => {
    const f = recurringFormFromRule({ ...rule, start_date: null, day_of_month: 15 })
    expect(f.startDate).toBe('')
    const body = buildRecurringBody(f)
    expect(body).not.toHaveProperty('start_date')
    expect(body.day_of_month).toBe(15)
    expect(validateRecurring(f, false)).toBeNull()
    expect(validateRecurring(f, true)).toBe('recurring.errStartDate')
  })

  it('validates like the server', () => {
    const f = emptyRecurringForm('2026-11-11', 5, 9)
    expect(validateRecurring(f, true)).toBe('recurring.errAmount')
    const ok = { ...f, amount: '10' }
    expect(validateRecurring(ok, true)).toBeNull()
    expect(validateRecurring({ ...ok, categoryId: null }, true)).toBe('recurring.errChoose')
    expect(validateRecurring({ ...ok, intervalCount: '100' }, true)).toBe('recurring.errInterval')
    expect(validateRecurring({ ...ok, intervalCount: '0' }, true)).toBe('recurring.errInterval')
    expect(validateRecurring({ ...ok, indefinitely: false, times: '' }, true)).toBe('recurring.errTimes')
    expect(validateRecurring({ ...ok, indefinitely: false, times: '3' }, true)).toBeNull()
  })

  it('labels the schedule and duration like the old panel', () => {
    expect(scheduleLabel(t, 'month', 1)).toBe('Every month')
    expect(scheduleLabel(t, 'week', 2)).toBe('Every 2 weeks')
    expect(durationLabel(t, null)).toBe('indefinitely')
    expect(durationLabel(t, 1)).toBe('1 time')
    expect(durationLabel(t, 12)).toBe('12 times')
    expect(translate('recurring.everyMany.year', { n: 3 }, 'el')).toBe('Κάθε 3 χρόνια')
  })
})
