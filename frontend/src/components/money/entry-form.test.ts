import { describe, expect, it } from 'vitest'
import { flattenPages, groupByDay, toEntry, type Entry, type EntryPage } from './entries'
import {
  defaultAccountId,
  draftFromEntry,
  draftSignedAmount,
  draftToBody,
  emptyDraft,
  recentDays,
  rememberAccount,
  validateDraft,
} from './entry-form'

const base = { ...emptyDraft('2026-11-10', 3), amount: '12.5', categoryId: 7 }

describe('entry form mapping', () => {
  it('sends an expense as a negative amount with spent_at', () => {
    expect(draftToBody('expense', { ...base, notes: '  καφές #x ' })).toEqual({
      notes: 'καφές #x',
      amount: -12.5,
      category_id: 7,
      account_id: 3,
      spent_at: '2026-11-10',
    })
  })

  it('sends a refund as a positive expense', () => {
    expect(draftToBody('expense', { ...base, refund: true })).toMatchObject({ amount: 12.5 })
    expect(draftSignedAmount('expense', { ...base, refund: true })).toBe(12.5)
    expect(draftSignedAmount('expense', base)).toBe(-12.5)
  })

  it('sends income positive with received_at, ignoring the refund flag', () => {
    expect(draftToBody('income', { ...base, refund: true, day: '2026-11-01' })).toEqual({
      notes: '',
      amount: 12.5,
      category_id: 7,
      account_id: 3,
      received_at: '2026-11-01',
    })
  })

  it('validates amount, then category, then account', () => {
    expect(validateDraft({ ...base, amount: '' })).toBe('amount')
    expect(validateDraft({ ...base, amount: '0.' })).toBe('amount')
    expect(validateDraft({ ...base, categoryId: null })).toBe('category')
    expect(validateDraft({ ...base, accountId: null })).toBe('account')
    expect(validateDraft(base)).toBeNull()
  })

  it('prefills an edit from an entry', () => {
    const refund: Entry = {
      kind: 'expense',
      id: 1,
      amount: 4.2,
      date: '2026-10-02',
      notes: 'n',
      category_id: 2,
      category_name: 'c',
      account_id: 5,
      account_name: 'a',
    }
    expect(draftFromEntry(refund)).toEqual({
      amount: '4.2',
      refund: true,
      categoryId: 2,
      accountId: 5,
      day: '2026-10-02',
      notes: 'n',
    })
    expect(draftFromEntry({ ...refund, amount: -30 })).toMatchObject({ amount: '30', refund: false })
    expect(draftFromEntry({ ...refund, kind: 'income', amount: 30 }).refund).toBe(false)
  })

  it('offers today and the three days before', () => {
    expect(recentDays('2026-11-01')).toEqual(['2026-11-01', '2026-10-31', '2026-10-30', '2026-10-29'])
  })

  it('remembers the last account when it still exists', () => {
    const accounts = [{ id: 4 }, { id: 9 }]
    expect(defaultAccountId('expense', accounts)).toBe(4)
    rememberAccount('expense', 9)
    expect(defaultAccountId('expense', accounts)).toBe(9)
    expect(defaultAccountId('income', accounts)).toBe(4)
    expect(defaultAccountId('expense', [{ id: 1 }])).toBe(1)
    expect(defaultAccountId('expense', [])).toBeNull()
  })
})

describe('list helpers', () => {
  const row = (id: number, spent_at: string) =>
    toEntry('expense', {
      id,
      category_id: 1,
      account_id: 1,
      notes: '',
      amount: -1,
      spent_at,
      category_name: 'c',
      account_name: 'a',
    })
  const page = (items: Entry[]): EntryPage => ({
    items,
    page: 1,
    pages: 2,
    total: 3,
    page_size: 75,
    month: null,
    category_id: null,
  })

  it('maps income received_at to date', () => {
    const e = toEntry('income', {
      id: 1,
      category_id: 1,
      account_id: 1,
      notes: 'x',
      amount: 5,
      received_at: '2026-11-02 00:00:00',
      category_name: 'c',
      account_name: 'a',
    })
    expect(e.date).toBe('2026-11-02')
  })

  it('flattens pages without duplicates and groups by day', () => {
    const rows = flattenPages({
      pages: [
        page([row(1, '2026-11-10'), row(2, '2026-11-10')]),
        page([row(2, '2026-11-10'), row(3, '2026-11-09')]),
      ],
      pageParams: [1, 2],
    })
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3])
    expect(groupByDay(rows).map((g) => [g.day, g.entries.length])).toEqual([
      ['2026-11-10', 2],
      ['2026-11-09', 1],
    ])
  })
})
