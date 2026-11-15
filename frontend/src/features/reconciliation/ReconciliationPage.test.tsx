import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setCsrfToken } from '@/api/client'
import { json, renderManage, sentBody } from '@/test/helpers'
import type { ReconcilePlan, ReconcileStart } from './api'
import ReconciliationPage from './ReconciliationPage'

const fetchMock = vi.fn<typeof fetch>()

const start: ReconcileStart = {
  date: '2026-11-11',
  accounts: [
    { account_id: 1, name: 'Main', is_credit_card: false, bank: null, system_balance: 1000 },
    { account_id: 2, name: 'Savings', is_credit_card: false, bank: null, system_balance: 500 },
    { account_id: 3, name: 'Visa', is_credit_card: true, bank: null, system_balance: -200 },
  ],
}

const plan: ReconcilePlan = {
  date: '2026-11-11',
  accounts: [
    {
      account_id: 1,
      name: 'Main',
      is_credit_card: false,
      system_balance: 1000,
      actual_balance: 700,
      difference: -300,
    },
    {
      account_id: 2,
      name: 'Savings',
      is_credit_card: false,
      system_balance: 500,
      actual_balance: 750,
      difference: 250,
    },
    {
      account_id: 3,
      name: 'Visa',
      is_credit_card: true,
      system_balance: -200,
      actual_balance: -250,
      difference: -50,
    },
  ],
  transfers: [
    {
      from_account_id: 1,
      from_account_name: 'Main',
      to_account_id: 2,
      to_account_name: 'Savings',
      amount: 250,
    },
  ],
  adjustments: [
    { account_id: 1, account_name: 'Main', kind: 'expense', amount: 50, category_name: 'Other' },
    { account_id: 3, account_name: 'Visa', kind: 'expense', amount: 50, category_name: 'Other' },
  ],
  notes: 'balancing input',
  transfer_notes: 'Month end reconciliation',
}

beforeEach(() => {
  setCsrfToken('t')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.includes('/api/reconciliation/preview')) return json(200, plan)
    if (url.includes('/api/reconciliation/apply'))
      return json(200, { ...plan, message: 'Balances reconciled.' })
    if (url.includes('/api/reconciliation')) return json(200, start)
    throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`)
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('ReconciliationPage', () => {
  it('lists accounts and cards, previews the plan and applies it', async () => {
    const user = userEvent.setup()
    renderManage(<ReconciliationPage />)

    const main = await screen.findByLabelText('Πραγματικό υπόλοιπο Main')
    expect(screen.getByText('Οφειλή στην εφαρμογή: 200,00 €')).toBeInTheDocument() // screen readers
    const preview = screen.getByRole('button', { name: 'Προεπισκόπηση' })
    expect(preview).toBeDisabled()

    fireEvent.change(main, { target: { value: '700' } })
    fireEvent.change(screen.getByLabelText('Πραγματικό υπόλοιπο Savings'), { target: { value: '750' } })
    fireEvent.change(screen.getByLabelText('Πραγματική οφειλή Visa'), { target: { value: '250' } })
    await user.click(preview)

    expect(sentBody(fetchMock, 'POST', '/api/reconciliation/preview')).toEqual({
      date: '2026-11-11',
      balances: [
        { account_id: 1, actual_balance: 700 },
        { account_id: 2, actual_balance: 750 },
        { account_id: 3, actual_balance: -250 },
      ],
    })
    const transfers = await screen.findByRole('list', { name: 'Μεταφορές' })
    expect(within(transfers).getByText('Month end reconciliation')).toBeInTheDocument()
    const adjustments = screen.getByRole('list', { name: 'Balancing input (Other)' })
    expect(within(adjustments).getByText('Έξοδο από Visa')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Εφαρμογή' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Εφαρμογή' }))
    await waitFor(() => expect(sentBody(fetchMock, 'POST', '/api/reconciliation/apply')).toBeTruthy())
    await waitFor(() => expect(screen.getByLabelText('Πραγματικό υπόλοιπο Main')).toHaveValue(''))
  })

  it('hides the preview once a balance changes', async () => {
    const user = userEvent.setup()
    renderManage(<ReconciliationPage />)
    const main = await screen.findByLabelText('Πραγματικό υπόλοιπο Main')
    fireEvent.change(main, { target: { value: '700' } })
    await user.click(screen.getByRole('button', { name: 'Προεπισκόπηση' }))
    await screen.findByRole('list', { name: 'Μεταφορές' })
    fireEvent.change(main, { target: { value: '701' } })
    expect(screen.queryByRole('list', { name: 'Μεταφορές' })).not.toBeInTheDocument()
  })

  it('copies the recorded balance with the = button', async () => {
    const user = userEvent.setup()
    renderManage(<ReconciliationPage />)
    await screen.findByLabelText('Πραγματική οφειλή Visa')
    await user.click(screen.getAllByRole('button', { name: 'Ίδιο με την εφαρμογή' })[2])
    expect(screen.getByLabelText('Πραγματική οφειλή Visa')).toHaveValue('200')
  })
})
