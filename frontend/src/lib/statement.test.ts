import { describe, expect, it } from 'vitest'
import { dayMonthShort } from './dates'
import { statementLine } from './statement'

const st = {
  closed_on: '2026-11-05',
  amount: 300,
  paid: 0,
  remaining: 300,
  due_on: '2026-11-25',
  state: 'open',
}

describe('card statement line', () => {
  it('formats a short day + month', () => {
    expect(dayMonthShort('2026-11-05', 'en')).toBe('5 Nov')
    expect(dayMonthShort('2026-11-05', 'el')).toMatch(/^5 Νοε/)
  })

  it('open statement with due date', () => {
    expect(statementLine(st, 'en')).toEqual({ text: 'Statement 300,00 € · due 25 Nov', tone: 'default' })
  })

  it('partly paid, overdue', () => {
    expect(statementLine({ ...st, paid: 100, remaining: 200, state: 'overdue' }, 'en')).toEqual({
      text: 'Statement 200,00 € left of 300,00 € · was due 25 Nov',
      tone: 'negative',
    })
  })

  it('reads naturally in Greek', () => {
    expect(statementLine(st, 'el').text).toMatch(/^Κατάσταση: 300,00 € · λήγει 25 Νοε/)
    expect(statementLine({ ...st, paid: 100, remaining: 200 }, 'el').text).toMatch(
      /^Κατάσταση: απομένουν 200,00 € από 300,00 €/,
    )
  })

  it('soon is a warning, none and paid are quiet', () => {
    expect(statementLine({ ...st, state: 'soon' }, 'en').tone).toBe('warning')
    expect(statementLine({ ...st, state: 'none' }, 'en')).toEqual({
      text: 'Nothing due from the 5 Nov statement',
      tone: 'muted',
    })
    expect(statementLine({ ...st, state: 'paid' }, 'en').text).toBe('5 Nov statement paid')
  })

  it('no due date', () => {
    expect(statementLine({ ...st, due_on: null }, 'en').text).toBe('Statement 300,00 €')
  })
})
