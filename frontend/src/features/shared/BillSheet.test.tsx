import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import { setCsrfToken } from '@/api/client'
import { renderWithProviders } from '@/test/render'
import { BillForm } from './BillSheet'
import { sampleGroup } from './fixtures'
import { SettleForm } from './SettleSheet'

const fetchMock = vi.fn<typeof fetch>()
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  setCsrfToken('tok')
})
afterEach(() => vi.unstubAllGlobals())

const categories = [{ id: 5, name: 'Φαγητό' }]
const accounts = [{ id: 9, name: 'Τράπεζα' }]

function sentBody(path: string) {
  const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith(path))
  return call ? JSON.parse(String(call[1]!.body)) : undefined
}

describe('BillForm', () => {
  it('exact split: live remaining, then submits the mapped body', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true, message: 'Added', group_id: 7 }))
    const onDone = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <BillForm
        group={sampleGroup()}
        bill={null}
        categories={categories}
        accounts={accounts}
        onDone={onDone}
      />,
    )
    await user.type(screen.getByLabelText('Ποσό'), '30')
    await user.type(screen.getByLabelText('Περιγραφή'), 'Φαγητό #ταξίδι')
    expect(screen.getByText(/Περίπου 10,00\s€ ο καθένας/)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Ποσά' }))
    await user.type(screen.getByLabelText('Μερίδιο: Εσύ'), '20')
    expect(screen.getByText(/Μένουν 10,00\s€ να μοιραστούν/)).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Αποθήκευση' })
    expect(save).toBeDisabled()

    // "Rest here" puts the remaining 10 € on Anna
    await user.click(screen.getByRole('button', { name: 'Βάλε το υπόλοιπο σε: Anna' }))
    expect(screen.getByText('Ταιριάζει με το σύνολο.')).toBeInTheDocument()
    expect(screen.getByText(/τα 10,00\s€ που δάνεισες/)).toBeInTheDocument()
    await user.click(save)

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(sentBody('/api/shared/groups/7/expenses')).toEqual({
      description: 'Φαγητό #ταξίδι',
      amount: '30',
      paid_by: 1,
      split_method: 'exact',
      spent_on: '2026-11-10',
      included: [1, 2, 3],
      values: { '1': '20', '2': '10', '3': '' },
      record_personal: true,
      category_id: 5,
      account_id: 9,
    })
  })

  it('shows the server detail inline and stays open', async () => {
    fetchMock.mockResolvedValue(json(400, { detail: 'Choose the category for your share.' }))
    const onDone = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <BillForm
        group={sampleGroup()}
        bill={null}
        categories={categories}
        accounts={accounts}
        onDone={onDone}
      />,
    )
    await user.type(screen.getByLabelText('Ποσό'), '9')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose the category for your share.')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('edit: PUTs the bill with the editor recording state off when it was off', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true, message: 'Saved', group_id: 7 }))
    const user = userEvent.setup()
    const bill = {
      kind: 'expense' as const,
      id: 4,
      date: '2026-11-01',
      description: 'Fuel',
      amount: 40,
      paid_by_name: 'Anna',
      added_by: 'you',
      split_method: 'shares',
      method_label: 'Shares',
      splits: [],
      effect: -20,
      effect_text: 'you borrowed',
      involved: true,
      i_paid: false,
      my_share: 20,
      recorded: false,
      record_incomplete: false,
      payload: {
        id: 4,
        description: 'Fuel',
        amount: '40.00',
        spent_on: '2026-11-01',
        paid_by: 2,
        split_method: 'shares',
        included: [1, 2],
        values: { '1': '1', '2': '1' },
        record_personal: false,
        category_id: null,
        account_id: null,
      },
    }
    renderWithProviders(
      <BillForm
        group={sampleGroup()}
        bill={bill}
        categories={categories}
        accounts={accounts}
        onDone={() => {}}
      />,
    )
    expect(screen.getByRole('switch')).not.toBeChecked()
    expect(screen.getByText('2 μερίδια συνολικά')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))
    await waitFor(() => expect(sentBody('/api/shared/expenses/4')).toBeDefined())
    expect(sentBody('/api/shared/expenses/4')).toMatchObject({
      split_method: 'shares',
      values: { '1': '1', '2': '1', '3': '' },
      record_personal: false,
      category_id: null,
    })
  })
})

describe('SettleForm', () => {
  it('prefills from a suggestion and hides recording when I am not involved', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true, message: 'Payment recorded.', group_id: 7 }))
    const onDone = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <SettleForm
        group={sampleGroup()}
        prefill={{ from_id: 3, to_id: 2, amount: 12.5 }}
        accounts={accounts}
        onDone={onDone}
      />,
    )
    expect(screen.getByLabelText('Ποσό')).toHaveValue('12,5')
    expect(screen.queryByRole('switch')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Καταχώριση πληρωμής' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(sentBody('/api/shared/groups/7/settlements')).toEqual({
      from_person_id: 3,
      to_person_id: 2,
      amount: '12.5',
      paid_on: '2026-11-10',
      notes: '',
      record_personal: false,
      account_id: null,
    })
  })

  it('records into my account when I pay', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true, message: 'Payment recorded.', group_id: 7 }))
    const user = userEvent.setup()
    renderWithProviders(
      <SettleForm group={sampleGroup()} prefill={null} accounts={accounts} onDone={() => {}} />,
    )
    expect(screen.getByText('Πληρώθηκε από')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Ποσό'), '7')
    await user.click(screen.getByRole('button', { name: 'Καταχώριση πληρωμής' }))
    await waitFor(() => expect(sentBody('/api/shared/groups/7/settlements')).toBeDefined())
    expect(sentBody('/api/shared/groups/7/settlements')).toMatchObject({
      from_person_id: 1,
      to_person_id: 2,
      amount: '7',
      record_personal: true,
      account_id: 9,
    })
  })
})
