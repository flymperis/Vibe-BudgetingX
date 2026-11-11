import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setCsrfToken } from '@/api/client'
import { json, mockDesktop, renderManage, sentBody } from '@/components/manage/test-utils'
import { RecurringSheet } from './RecurringSheet'
import type { RecurringRule } from './recurringForm'

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

const rule: RecurringRule = {
  id: 5,
  entry_type: 'expense',
  category_choice: 'e-11',
  amount: 10.99,
  category_id: 11,
  account_id: 2,
  day_of_month: 15,
  months_to_run: null,
  interval_unit: 'month',
  interval_count: 1,
  start_date: '2026-12-15',
  notes: 'Spotify',
  enabled: true,
  account_name: 'Μετρητά',
  category_name: 'Καφές',
}

describe('RecurringSheet', () => {
  it('adds a rule with the old form fields', async () => {
    fetchMock.mockResolvedValue(json(200, { rule, message: 'Recurring rule added.' }))
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderManage(<RecurringSheet open onOpenChange={onOpenChange} rule={null} />)

    await user.click(screen.getByRole('button', { name: 'Προσθήκη κανόνα' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Το ποσό πρέπει να είναι θετικό.')
    expect(fetchMock).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Ποσό κάθε φορά'), '650')
    await user.click(screen.getByRole('radio', { name: 'Έσοδο' }))
    await user.click(screen.getByRole('switch', { name: 'Χωρίς λήξη' }))
    await user.type(screen.getByLabelText('Πόσες φορές'), '12')
    await user.click(screen.getByRole('button', { name: 'Προσθήκη κανόνα' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(sentBody(fetchMock, 'POST', '/api/recurring')).toEqual({
      category_choice: 'i-20',
      amount: 650,
      account_id: 1,
      interval_unit: 'month',
      interval_count: 1,
      indefinitely: false,
      months_to_run: 12,
      start_date: '2026-11-11',
      notes: '',
      enabled: true,
    })
  })

  it('pausing an existing rule sends enabled=false explicitly; server detail inline', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { detail: 'Invalid account.' }))
    const user = userEvent.setup()
    renderManage(<RecurringSheet open onOpenChange={() => {}} rule={rule} />)

    await user.click(screen.getByRole('switch', { name: /Ενεργός/ }))
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid account.')
    expect(sentBody(fetchMock, 'PUT', '/api/recurring/5')).toMatchObject({
      category_choice: 'e-11',
      amount: 10.99,
      indefinitely: true,
      start_date: '2026-12-15',
      enabled: false,
    })
  })

  it('deletes after confirmation', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true, message: 'Recurring rule removed.' }))
    const user = userEvent.setup()
    renderManage(<RecurringSheet open onOpenChange={() => {}} rule={rule} />)
    await user.click(screen.getByRole('button', { name: 'Διαγραφή κανόνα' }))
    await user.click(await screen.findByRole('button', { name: 'Διαγραφή' }))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) => String(u).endsWith('/api/recurring/5') && i?.method === 'DELETE',
        ),
      ).toBe(true),
    )
  })
})
