import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/render'
import YearlyPage from './YearlyPage'

const fetchMock = vi.fn<typeof fetch>()
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (input) => {
    const year = Number(new URL(String(input), 'http://x').searchParams.get('year'))
    const rows = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      income: i === 5 ? 1850 : 0,
      expenses: i === 5 ? 1900 : 0,
      delta: i === 5 ? -50 : 0,
      total_balance: i >= 5 ? -50 : 0,
    }))
    return json({ year, rows, total_income: 1850, total_expenses: 1900, total_delta: -50 })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('YearlyPage', () => {
  it('shows 12 months with totals and switches year', async () => {
    const user = userEvent.setup()
    renderWithProviders(<YearlyPage />, { path: '/yearly?year=2025' })
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(14) // header + 12 + totals
    expect(within(table).getByRole('rowheader', { name: 'Ιούνιος' })).toBeInTheDocument()
    const totals = within(table).getByRole('rowheader', { name: 'Σύνολο' }).closest('tr')!
    expect(totals).toHaveTextContent('1.850,00 €')
    expect(totals).toHaveTextContent('-50,00 €')
    expect(totals).toHaveTextContent('—')

    await user.click(screen.getByRole('button', { name: 'Επόμενο έτος' }))
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('year=2026'))
  })
})
