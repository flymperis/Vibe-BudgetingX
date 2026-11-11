import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/render'
import type { Summary } from './api'
import SummaryPage from './SummaryPage'
import { json } from '@/test/helpers'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

const base: Summary = {
  balance_scope: 'month_end',
  balance_cutoff: '2026-11-01',
  balance_as_of: '2026-10-31',
  accounts: [
    {
      id: 1,
      name: 'Main',
      account_type: 'bank',
      is_credit_card: false,
      current_balance: 2115,
      bank: null,
      card: null,
    },
    {
      id: 2,
      name: 'Visa',
      account_type: 'credit',
      is_credit_card: true,
      current_balance: -80,
      bank: null,
      card: {
        owed: 80,
        credit: 0,
        limit: 2000,
        available: 1920,
        used_pct: 4,
        used_level: 'ok',
        statement: null,
      },
    },
  ],
  cash_total: 2115,
  cards_total: -80,
  net_total: 2035,
  has_cards: true,
  total_income: 2070.5,
  total_expenses: 1719.5,
  net: 351,
  month: '2026-10',
  income_breakdown: [{ category_name: 'Salary', total_amount: 1850 }],
  expense_breakdown: [{ category_name: 'Ενοίκιο', total_amount: 845 }],
  budget_enabled: false,
  budget: null,
}

function serve(data: Summary) {
  fetchMock.mockImplementation(async (input) =>
    new URL(String(input), 'http://x').pathname === '/api/summary' ? json(200, data) : json(200, {}),
  )
}

describe('SummaryPage', () => {
  it('shows totals, breakdowns and balances with subtotals', async () => {
    serve(base)
    renderWithProviders(<SummaryPage />, { path: '/summary?month=2026-10' })
    expect(await screen.findByText('Υπόλοιπο λογαριασμών')).toBeInTheDocument()
    expect(screen.getAllByText('2.035,00 €').length).toBeGreaterThan(0)
    expect(screen.getByText('Salary')).toBeInTheDocument()
    expect(screen.getByText('845,00 €')).toBeInTheDocument()
    expect(screen.getByText('Διαθέσιμα 1.920,00 € από 2.000,00 €')).toBeInTheDocument()
    expect(screen.getByText('Πιστωτικές κάρτες')).toBeInTheDocument()
    expect(screen.getByText(/στις 31 Οκτωβρίου/)).toBeInTheDocument()
  })

  it('with budgeting on: budget rows, unbudgeted with no budget, Everything else', async () => {
    serve({
      ...base,
      budget_enabled: true,
      budget: {
        ym: '2026-10',
        cleared: false,
        rows: [
          {
            category_id: 1,
            name: 'Ενοίκιο',
            default: 650,
            override: null,
            budget: 650,
            spent: 845,
            remaining: -195,
            pct: 130,
            status: 'over',
          },
        ],
        unbudgeted: [{ category_id: 2, name: 'General', spent: 39 }],
        unbudgeted_spent: 39,
        other: {
          category_id: null,
          name: 'Everything else',
          budget: 100,
          spent: 39,
          remaining: 61,
          pct: 39,
          status: 'ok',
        },
        total_budget: 750,
        total_spent: 884,
        total_remaining: -134,
        total_pct: 117,
        total_status: 'over',
        over: [],
      },
    })
    renderWithProviders(<SummaryPage />, { path: '/summary?month=2026-10' })
    expect(await screen.findByText('μένουν -195,00 €')).toBeInTheDocument()
    expect(screen.getByText('Χωρίς budget')).toBeInTheDocument()
    expect(screen.getByText('Όλα τα υπόλοιπα')).toBeInTheDocument()
  })

  it('empty month', async () => {
    serve({ ...base, accounts: [], income_breakdown: [], expense_breakdown: [], has_cards: false })
    renderWithProviders(<SummaryPage />, { path: '/summary?month=2026-10' })
    expect(await screen.findByText('Κανένα έσοδο αυτόν τον μήνα.')).toBeInTheDocument()
    expect(screen.getByText('Κανένα έξοδο αυτόν τον μήνα.')).toBeInTheDocument()
    expect(screen.getByText('Δεν έχεις λογαριασμούς ακόμα.')).toBeInTheDocument()
  })
})
