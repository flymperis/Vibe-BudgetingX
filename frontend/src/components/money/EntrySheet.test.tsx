import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import { setCsrfToken } from '@/api/client'
import { BootstrapProvider } from '@/bootstrap/BootstrapGate'
import type { Bootstrap } from '@/bootstrap/bootstrap'
import { renderWithProviders } from '@/test/render'
import type { Entry } from './entries'
import { EntrySheet } from './EntrySheet'

const fetchMock = vi.fn<typeof fetch>()
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const boot: Bootstrap = {
  user: { id: 1, username: 'u' },
  today: '2026-11-10',
  month: '2026-11',
  accounts: [
    {
      id: 3,
      name: 'Alpha Bank',
      account_type: 'bank',
      is_credit_card: false,
      opening_balance: 0,
      current_balance: 10,
      credit_limit: null,
      statement_day: null,
      due_day: null,
    },
    {
      id: 4,
      name: 'Μετρητά',
      account_type: 'bank',
      is_credit_card: false,
      opening_balance: 0,
      current_balance: 5,
      credit_limit: null,
      statement_day: null,
      due_day: null,
    },
  ],
  balance_totals: { cash_total: 15, cards_total: 0, net_total: 15 },
  categories: [
    { id: 7, name: 'Καφές' },
    { id: 8, name: 'Σούπερ μάρκετ' },
  ],
  income_categories: [{ id: 20, name: 'Μισθός' }],
  tag_names: ['Λονδίνο2026', 'φίλοι'],
  recent_tags: ['φίλοι'],
  budget_enabled: false,
  posted_recurring: 0,
}

const saved = {
  id: 99,
  category_id: 7,
  account_id: 3,
  notes: '',
  amount: -12.5,
  spent_at: '2026-11-10',
  category_name: 'Καφές',
  account_name: 'Alpha Bank',
}

function setup(ui: React.ReactElement) {
  const user = userEvent.setup()
  const utils = renderWithProviders(<BootstrapProvider value={boot}>{ui}</BootstrapProvider>)
  return { user, ...utils }
}

const bodyOf = (call: Parameters<typeof fetch>) => JSON.parse(String(call[1]!.body))

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  // Desktop: dialog + text amount input.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  fetchMock.mockReset()
  setCsrfToken('tok')
})
afterEach(() => vi.unstubAllGlobals())

describe('EntrySheet', () => {
  it('adds an expense: amount, category tap, save -> negative amount', async () => {
    fetchMock.mockResolvedValue(json(200, saved))
    const onOpenChange = vi.fn()
    const { user } = setup(<EntrySheet open onOpenChange={onOpenChange} allowKindSwitch />)

    await user.type(screen.getByLabelText('Ποσό'), '12,5')
    await user.click(screen.getByRole('radio', { name: 'Καφές' }))
    await user.click(screen.getByRole('radio', { name: 'Χθες' }))
    await user.click(screen.getByRole('button', { name: '#φίλοι' }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('/api/expenses')
    expect(init!.method).toBe('POST')
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
      notes: '#φίλοι',
      amount: -12.5,
      category_id: 7,
      account_id: 3,
      spent_at: '2026-11-09',
    })
  })

  it('refund toggle sends a positive expense', async () => {
    fetchMock.mockResolvedValue(json(200, saved))
    const { user } = setup(<EntrySheet open onOpenChange={() => {}} />)
    await user.type(screen.getByLabelText('Ποσό'), '5')
    await user.click(screen.getByRole('button', { name: /Πρόσημο: έξοδο/ }))
    await user.click(screen.getByRole('radio', { name: 'Καφές' }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(bodyOf(fetchMock.mock.calls[0]).amount).toBe(5)
  })

  it('switches to income, keeping the amount, and posts to /income', async () => {
    fetchMock.mockResolvedValue(json(200, { ...saved, received_at: '2026-11-10', category_id: 20 }))
    const { user } = setup(<EntrySheet open onOpenChange={() => {}} allowKindSwitch />)
    await user.type(screen.getByLabelText('Ποσό'), '1850')
    await user.click(screen.getByRole('radio', { name: 'Νέο έσοδο' }))
    expect(screen.getByLabelText('Ποσό')).toHaveValue('1850')
    expect(screen.queryByRole('radio', { name: 'Καφές' })).toBeNull()
    await user.click(screen.getByRole('radio', { name: 'Μισθός' }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/income')
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
      notes: '',
      amount: 1850,
      category_id: 20,
      account_id: 3,
      received_at: '2026-11-10',
    })
  })

  it('validates locally before sending, then shows the server detail inline', async () => {
    fetchMock.mockResolvedValue(json(400, { detail: 'Invalid category or account.' }))
    const { user } = setup(<EntrySheet open onOpenChange={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Γράψε ποσό')
    await user.type(screen.getByLabelText('Ποσό'), '3')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Διάλεξε κατηγορία')
    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(screen.getByRole('radio', { name: 'Καφές' }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid category or account.')
  })

  it('edits an existing entry with PUT and its values prefilled', async () => {
    fetchMock.mockResolvedValue(json(200, saved))
    const entry: Entry = {
      kind: 'expense',
      id: 42,
      amount: -30,
      date: '2026-10-02',
      notes: 'ψώνια #φίλοι',
      category_id: 8,
      category_name: 'Σούπερ μάρκετ',
      account_id: 4,
      account_name: 'Μετρητά',
    }
    const { user } = setup(<EntrySheet open onOpenChange={() => {}} entry={entry} />)
    expect(screen.getByRole('dialog', { name: 'Επεξεργασία εξόδου' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ποσό')).toHaveValue('30')
    expect(screen.getByRole('radio', { name: 'Σούπερ μάρκετ' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/expenses/42')
    expect(fetchMock.mock.calls[0][1]!.method).toBe('PUT')
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
      notes: 'ψώνια #φίλοι',
      amount: -30,
      category_id: 8,
      account_id: 4,
      spent_at: '2026-10-02',
    })
  })

  it('typing # offers matching tags that complete the word', async () => {
    const { user } = setup(<EntrySheet open onOpenChange={() => {}} />)
    const notes = screen.getByLabelText('Σημειώσεις')
    await user.type(notes, 'ταξί #λον')
    await user.click(screen.getByRole('button', { name: '#Λονδίνο2026' }))
    expect(notes).toHaveValue('ταξί #Λονδίνο2026 ')
  })
})
