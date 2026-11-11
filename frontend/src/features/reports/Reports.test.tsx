import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BootstrapContext, type Bootstrap } from '@/bootstrap/bootstrap'
import { renderWithProviders } from '@/test/render'
import type { Overview, Spending, TagsReport } from './api'
import ReportsOverviewPage from './ReportsOverviewPage'
import ReportsSpendingPage from './ReportsSpendingPage'
import ReportsTagsPage from './ReportsTagsPage'

const fetchMock = vi.fn<typeof fetch>()
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

const boot = {
  today: '2026-11-10',
  month: '2026-11',
  accounts: [
    { id: 1, name: 'Πειραιώς', account_type: 'bank', is_credit_card: false, opening_balance: 0 },
    { id: 2, name: 'Revolut', account_type: 'bank', is_credit_card: false, opening_balance: 0 },
  ],
} as unknown as Bootstrap

const month = (m: number, income: number, expenses: number) => ({
  month: m,
  label: 'x',
  short: 'x',
  income,
  expenses,
  net: income + expenses,
  active: income !== 0 || expenses !== 0,
})

function overview(): Overview {
  const months = Array.from({ length: 12 }, (_, i) => (i < 2 ? month(i + 1, 1000, -400 - i * 100) : month(i + 1, 0, 0)))
  return {
    year: 2026,
    current_year: 2026,
    account_id: null,
    account_label: 'All accounts',
    cash_flow: {
      months,
      total_income: 2000,
      total_expenses: -900,
      total_net: 1100,
      savings_rate: 55,
      active_month_count: 2,
      avg_income: 1000,
      avg_expenses: -450,
      avg_net: 550,
      best_month: months[0],
      worst_month: months[1],
    },
    cash_flow_chart: {
      has_data: true,
      months: months.map((m) => ({ ...m, has_net_point: m.active })),
      y_min: -600,
      y_max: 1100,
    },
    bank_baseline: 500,
    bank_chart: {
      points: months.map((m) => ({ month_num: m.month, month_label: 'x', short: 'x', value: 600, change: 100 })),
      y_min: 400,
      y_max: 800,
      y_mid: 600,
    },
    bank_balance: 1600,
    crypto_value: 3655.22,
    stock_value: 6103.69,
  }
}

function serve(routes: Record<string, unknown>) {
  const urls: string[] = []
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://x')
    urls.push(url.pathname + url.search)
    const body = routes[url.pathname]
    return body ? json(200, body) : json(404, { detail: 'nope' })
  })
  return urls
}

const renderPage = (ui: React.ReactElement, path: string) =>
  renderWithProviders(<BootstrapContext value={boot}>{ui}</BootstrapContext>, { path })

describe('Reports overview', () => {
  it('shows the KPIs, holdings in their currencies and only active months', async () => {
    const urls = serve({ '/api/reports/overview': overview() })
    renderPage(<ReportsOverviewPage />, '/reports/overview')
    expect(await screen.findByText('2.000,00 €')).toBeInTheDocument()
    expect(screen.getByText('1.000,00 € ανά ενεργό μήνα')).toBeInTheDocument()
    expect(screen.getByText('55,0%')).toBeInTheDocument()
    expect(screen.getByText('$6.103,69')).toBeInTheDocument()
    expect(screen.getByText(/Καλύτερος μήνας ο Ιανουάριος/)).toBeInTheDocument()
    const months = screen.getByRole('list', { name: 'Μήνα προς μήνα' })
    expect(within(months).getAllByRole('listitem')).toHaveLength(2)
    expect(urls[0]).toBe('/api/reports/overview?year=2026&account=all')
  })

  it('passes the year and the account to the API', async () => {
    const urls = serve({ '/api/reports/overview': overview() })
    const user = userEvent.setup()
    renderPage(<ReportsOverviewPage />, '/reports/overview?year=2025&account=2')
    await screen.findByText('2.000,00 €')
    expect(urls[0]).toBe('/api/reports/overview?year=2025&account=2')
    await user.click(screen.getByRole('button', { name: 'Επόμενο έτος' }))
    await waitFor(() => expect(urls).toContain('/api/reports/overview?year=2026&account=2'))
  })

  it('shows a dash for the savings rate without income', async () => {
    const data = overview()
    data.cash_flow.savings_rate = null
    serve({ '/api/reports/overview': data })
    renderPage(<ReportsOverviewPage />, '/reports/overview')
    expect(await screen.findByText('δεν υπάρχουν έσοδα')).toBeInTheDocument()
  })
})

describe('Reports spending', () => {
  it('ranks categories and renders the pivot with blanks for zero', async () => {
    const data: Spending = {
      year: 2026,
      categories: {
        rows: [
          { name: 'Σούπερ μάρκετ', total: -600, prev_total: -500, delta: -100, share: 75 },
          { name: 'Καφές', total: -200, prev_total: null, delta: null, share: 25 },
        ],
        outflow_total: 800,
        prev_year: 2025,
        has_previous: true,
      },
      expense_pivot: {
        rows: [{ name: 'Καφές', months: [-200, ...Array(11).fill(0)], total: -200, avg: -200 }],
        month_headers: Array.from({ length: 12 }, (_, i) => `0${i + 1}.x`),
        month_totals: [-200, ...Array(11).fill(0)],
        grand_total: -200,
        active_month_count: 1,
        avg_monthly_total: -200,
      },
    }
    serve({ '/api/reports/spending': data })
    renderPage(<ReportsSpendingPage />, '/reports/spending')
    expect(await screen.findByText('75,0% των εξόδων')).toBeInTheDocument()
    expect(screen.getByText('νέα φέτος')).toBeInTheDocument()
    expect(screen.getByText('-100,00 €')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByRole('rowheader', { name: 'Γενικό σύνολο' })).toBeInTheDocument()
    const row = within(table).getByRole('row', { name: /^Καφές/ })
    // 12 months + total + avg; 11 empty month cells
    const cells = within(row).getAllByRole('cell')
    expect(cells).toHaveLength(14)
    expect(cells.filter((c) => c.textContent === '')).toHaveLength(11)
  })
})

describe('Reports tags', () => {
  const tags: TagsReport = {
    tags: [
      { tag: 'κρήτη2026', key: 'κρητη2026', spent: 425.5, income: 20, net: -405.5, count: 3, first: '2026-07-01', last: '2026-07-10' },
    ],
    selected_tag: null,
    tag: null,
  }

  it('lists tags with totals and dates', async () => {
    serve({ '/api/reports/tags': tags })
    renderPage(<ReportsTagsPage />, '/reports/tags')
    const link = await screen.findByRole('link', { name: /#κρήτη2026/ })
    expect(link).toHaveAttribute('href', '/reports/tags?tag=%CE%BA%CF%81%CE%B7%CF%84%CE%B72026')
    expect(screen.getByText(/3 καταχωρίσεις · 01\/07\/2026 → 10\/07\/2026/)).toBeInTheDocument()
  })

  it('shows one tag with categories and entries', async () => {
    const urls = serve({
      '/api/reports/tags': {
        ...tags,
        selected_tag: 'κρήτη2026',
        tag: {
          ...tags.tags[0],
          categories: [
            { name: 'Hotel', total: 400, share: 94 },
            { name: 'Refunds', total: -10, share: -2 },
          ],
          rows: [
            { kind: 'expense', id: 1, day: '2026-07-10', amount: -400, notes: 'Ξενοδοχείο #κρήτη2026', category: 'Hotel', account: null, tags: ['κρήτη2026'] },
          ],
        },
      },
    })
    renderPage(<ReportsTagsPage />, '/reports/tags?tag=κρήτη2026')
    expect(await screen.findByRole('heading', { name: '#κρήτη2026' })).toBeInTheDocument()
    expect(urls[0]).toBe('/api/reports/tags?tag=%CE%BA%CF%81%CE%AE%CF%84%CE%B72026')
    expect(screen.getByText('94% του συνόλου')).toBeInTheDocument()
    expect(screen.getByText('Καθαρό')).toBeInTheDocument()
    expect(screen.getByText(/10\/07\/2026 · Hotel · —/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Όλα τα tags' })).toBeInTheDocument()
  })

  it('says when nothing carries the tag', async () => {
    serve({ '/api/reports/tags': { ...tags, selected_tag: 'άγνωστο' } })
    renderPage(<ReportsTagsPage />, '/reports/tags?tag=άγνωστο')
    expect(await screen.findByText('Τίποτα δεν έχει το tag #άγνωστο ακόμα.')).toBeInTheDocument()
  })
})
