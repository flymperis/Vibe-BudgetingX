import { describe, expect, it } from 'vitest'
import { actualBalance, buildBalances, invalidRows, recordedValue, sanitizeBalanceTyping } from './reconcile'

const main = { account_id: 1, is_credit_card: false, system_balance: 1000 }
const visa = { account_id: 2, is_credit_card: true, system_balance: -200 }
const savings = { account_id: 3, is_credit_card: false, system_balance: 0 }

describe('reconcile form', () => {
  it('shows a card as what is owed', () => {
    expect(recordedValue(main)).toBe(1000)
    expect(recordedValue(visa)).toBe(200)
    expect(recordedValue({ ...visa, system_balance: 0 })).toBe(0)
  })

  it('turns typed text into a signed balance', () => {
    expect(actualBalance('900,50', false)).toBe(900.5)
    expect(actualBalance('-12', false)).toBe(-12)
    expect(actualBalance('250', true)).toBe(-250)
    expect(actualBalance('', false)).toBeNull()
    expect(actualBalance('abc', false)).toBeNull()
  })

  it('sends only the rows with a number, in list order', () => {
    expect(buildBalances([main, visa, savings], { 3: '10', 1: '900', 2: ' ' })).toEqual([
      { account_id: 1, actual_balance: 900 },
      { account_id: 3, actual_balance: 10 },
    ])
  })

  it('flags rows with text that is not a number', () => {
    expect(invalidRows([main, visa], { 1: '9,99', 2: '' })).toEqual([])
    expect(invalidRows([main, visa], { 1: '-', 2: '5' })).toEqual([1])
  })

  it('filters typing', () => {
    expect(sanitizeBalanceTyping('12.345')).toBe('12,34')
    expect(sanitizeBalanceTyping('-1-2a,5')).toBe('-12,5')
    expect(sanitizeBalanceTyping('1,2,3')).toBe('1,23')
  })
})
