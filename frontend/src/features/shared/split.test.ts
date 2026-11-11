import { allocate, centsToInput, evaluateSplit, evenValues, toCents, type SplitRow } from './split'

const rows = (vals: [number, boolean, string][]): SplitRow[] =>
  vals.map(([id, included, value]) => ({ id, included, value }))

describe('allocate (same as shared.allocate)', () => {
  it('adds up and spreads leftover cents to the first entries', () => {
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333])
    expect(allocate(1, [1, 1])).toEqual([1, 0])
    expect(allocate(100, [0, 0])).toEqual([0, 0])
    expect(allocate(1000, [50, 25, 25])).toEqual([500, 250, 250])
  })
})

describe('toCents', () => {
  it('accepts comma and dot, junk is zero', () => {
    expect(toCents('12,5')).toBe(1250)
    expect(toCents('12.50')).toBe(1250)
    expect(toCents('')).toBe(0)
    expect(toCents('abc')).toBe(0)
    expect(toCents('-3')).toBe(0)
  })
})

describe('evaluateSplit', () => {
  it('equal: splits between included people, needs one', () => {
    const r = evaluateSplit(
      'equal',
      1000,
      rows([
        [1, true, ''],
        [2, true, ''],
        [3, true, ''],
        [4, false, ''],
      ]),
    )
    expect(r.ok).toBe(true)
    expect(r.shares).toEqual({ 1: 334, 2: 333, 3: 333, 4: 0 })
    expect(r.status).toEqual({ kind: 'each', cents: 333 })
    const none = evaluateSplit('equal', 1000, rows([[1, false, '']]))
    expect(none.ok).toBe(false)
    expect(none.status.kind).toBe('pickOne')
  })

  it('exact: must add up to the total', () => {
    const two = (a: string, b: string) =>
      rows([
        [1, true, a],
        [2, true, b],
      ])
    expect(evaluateSplit('exact', 1000, two('6', '4')).status).toEqual({ kind: 'addsUp' })
    expect(evaluateSplit('exact', 1000, two('6', '')).status).toEqual({ kind: 'left', cents: 400 })
    const over = evaluateSplit('exact', 1000, two('6', '5'))
    expect(over.ok).toBe(false)
    expect(over.status).toEqual({ kind: 'tooMuch', cents: 100 })
  })

  it('percent: 100% within 0.01, like the server', () => {
    const thirds = rows([
      [1, true, '33.33'],
      [2, true, '33.33'],
      [3, true, '33.33'],
    ])
    expect(evaluateSplit('percent', 1000, thirds).ok).toBe(true)
    const bad = evaluateSplit(
      'percent',
      1000,
      rows([
        [1, true, '50'],
        [2, true, '40'],
      ]),
    )
    expect(bad.ok).toBe(false)
    expect(bad.status).toEqual({ kind: 'percentTotal', total: 90 })
    expect(bad.shares).toEqual({ 1: 556, 2: 444 })
  })

  it('shares: needs someone with a share', () => {
    const r = evaluateSplit(
      'shares',
      900,
      rows([
        [1, true, '2'],
        [2, true, '1'],
      ]),
    )
    expect(r.shares).toEqual({ 1: 600, 2: 300 })
    expect(r.status).toEqual({ kind: 'sharesTotal', total: 3 })
    const empty = rows([
      [1, true, ''],
      [2, true, '0'],
    ])
    expect(evaluateSplit('shares', 900, empty).status.kind).toBe('giveShare')
  })
})

describe('helpers', () => {
  it('evenValues makes percentages that total exactly 100', () => {
    expect(evenValues('percent', 3)).toEqual(['33.34', '33.33', '33.33'])
    expect(evenValues('shares', 2)).toEqual(['1', '1'])
  })
  it('centsToInput', () => {
    expect(centsToInput(1250)).toBe('12.5')
    expect(centsToInput(400)).toBe('4')
    expect(centsToInput(0)).toBe('')
  })
})
