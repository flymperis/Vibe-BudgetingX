import { budgetPercent, budgetStatus } from './budget'

describe('budgetStatus (old budget._status)', () => {
  it.each([
    [0, 100, 'ok'],
    [79.99, 100, 'ok'],
    [80, 100, 'warn'],
    [100, 100, 'warn'],
    [100.01, 100, 'over'],
    [0, 0, 'ok'],
    [5, 0, 'over'],
    [0.30000000000000004, 0.3, 'warn'],
  ] as const)('spent %s of %s -> %s', (spent, budget, expected) => {
    expect(budgetStatus(spent, budget)).toBe(expected)
  })

  it('clamps the bar', () => {
    expect(budgetPercent(50, 200)).toBe(25)
    expect(budgetPercent(300, 200)).toBe(100)
    expect(budgetPercent(-5, 200)).toBe(0)
    expect(budgetPercent(3, 0)).toBe(100)
  })
})
