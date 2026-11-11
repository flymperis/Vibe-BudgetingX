import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setCsrfToken } from '@/api/client'
import { json, mockDesktop, renderManage, sentBody } from '@/components/manage/test-utils'
import { AccountSheet } from './AccountSheet'
import { CategorySheet } from './CategorySheet'
import ExportImportPage from './ExportImportPage'

const fetchMock = vi.fn<typeof fetch>()
let restore = () => {}
beforeEach(() => {
  restore = mockDesktop()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  setCsrfToken('tok')
})
afterEach(() => {
  vi.unstubAllGlobals()
  restore()
})

describe('AccountSheet', () => {
  it('adds a credit card (owed positive, card fields) and shows the server detail inline', async () => {
    fetchMock.mockResolvedValue(json(400, { detail: 'An account with that name already exists.' }))
    const user = userEvent.setup()
    renderManage(<AccountSheet open onOpenChange={() => {}} account={null} />)

    await user.type(screen.getByLabelText('Όνομα'), 'Alpha Visa')
    await user.click(screen.getByRole('radio', { name: 'Πιστωτική κάρτα' }))
    await user.type(screen.getByLabelText('Οφειλή στην κάρτα'), '300')
    await user.type(screen.getByLabelText('Πιστωτικό όριο'), '1000')
    await user.type(screen.getByLabelText('Ημέρα λήξης'), '25')
    await user.click(screen.getAllByRole('button', { name: 'Νέος λογαριασμός' })[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('Όρισε και ημέρα κατάστασης')
    expect(fetchMock).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Ημέρα κατάστασης'), '5')
    await user.click(screen.getAllByRole('button', { name: 'Νέος λογαριασμός' })[0])
    expect(await screen.findByText('An account with that name already exists.')).toBeInTheDocument()
    expect(sentBody(fetchMock, 'POST', '/api/accounts')).toEqual({
      name: 'Alpha Visa',
      account_type: 'credit',
      opening_balance: 300,
      credit_limit: 1000,
      statement_day: 5,
      due_day: 25,
    })
  })
})

describe('CategorySheet', () => {
  it('refuses delete while used, and renames', async () => {
    fetchMock.mockResolvedValue(
      json(200, { id: 3, name: 'Φαγητό', entry_count: 4, rule_count: 1, can_delete: false }),
    )
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderManage(
      <CategorySheet
        kind="expense"
        open
        onOpenChange={onOpenChange}
        category={{ id: 3, name: 'Φαγ', entry_count: 4, rule_count: 1, can_delete: false }}
      />,
    )
    expect(screen.getByText('4 έξοδα · 1 επαναλαμβανόμενος κανόνας')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Διαγραφή κατηγορίας' })).toBeDisabled()

    await user.type(screen.getByLabelText('Όνομα κατηγορίας'), 'ητό')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(sentBody(fetchMock, 'PUT', '/api/categories/3')).toEqual({ name: 'Φαγητό' })
  })
})

describe('ExportImportPage', () => {
  it('links the downloads, confirms a destructive import and lists the errors', async () => {
    fetchMock.mockResolvedValue(
      json(400, { detail: 'Import failed. Row 2: bad date; Row 5: no amount (+3 more)' }),
    )
    const user = userEvent.setup()
    renderManage(<ExportImportPage />)

    expect(screen.getByRole('link', { name: /πλήρους εξαγωγής/ })).toHaveAttribute(
      'href',
      '/api/export/excel',
    )
    expect(screen.getByRole('link', { name: /προτύπου/ })).toHaveAttribute(
      'href',
      '/api/export/migration-template',
    )

    await user.click(screen.getByRole('button', { name: 'Εισαγωγή' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Διάλεξε ένα αρχείο Excel')

    await user.upload(screen.getByLabelText(/Διάλεξε αρχείο/), new File(['x'], 'budget.xlsx'))
    await user.click(screen.getByRole('switch', { name: /Αντικατάσταση όλων των κινήσεων/ }))
    await user.click(screen.getByRole('button', { name: 'Εισαγωγή' }))
    expect(await screen.findByText('Όλα τα υπάρχοντα έξοδα και έσοδα θα διαγραφούν.')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Εισαγωγή' }).at(-1)!)

    expect(await screen.findByText('Row 5: no amount')).toBeInTheDocument()
    expect(screen.getByText('Row 2: bad date')).toBeInTheDocument()
    expect(screen.getByText('και 3 ακόμα')).toBeInTheDocument()
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/api/import/excel'))!
    const fd = call[1]!.body as FormData
    expect(fd.get('replace_movements')).toBe('1')
    expect(fd.has('sync_opening_balances')).toBe(false)
  })
})
