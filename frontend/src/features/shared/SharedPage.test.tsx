import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import { setCsrfToken } from '@/api/client'
import { renderWithProviders } from '@/test/render'
import SharedGroupPage from './SharedGroupPage'
import SharedPage from './SharedPage'
import { json } from '@/test/helpers'

const fetchMock = vi.fn<typeof fetch>()

const overview = {
  contacts: [{ id: 3, name: 'Άννα', login: 'anna', group_count: 1 }],
  invitations: [{ id: 11, name: 'Σπίτι', owner: 'nikos' }],
  groups: [{ id: 7, name: 'Κρήτη', member_names: ['You', 'Άννα'], my_net: -12.5, shared_with_users: 1 }],
  friend_balances: [{ name: 'Άννα', amount: -12.5 }],
  owed_to_me: 0,
  i_owe: 12.5,
  net: -12.5,
  ledger_account_id: 4,
  own_accounts: [{ id: 2, name: 'Main' }],
  split_methods: [],
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  setCsrfToken('tok')
})
afterEach(() => vi.unstubAllGlobals())

describe('SharedPage overview', () => {
  it('shows totals, groups with localised names, and accepts an invitation', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/shared') && (!init?.method || init.method === 'GET')) return json(200, overview)
      if (url.endsWith('/api/shared/groups/11/accept'))
        return json(200, { ok: true, message: 'Joined', group_id: 11 })
      return json(404, { detail: 'Group not found.' })
    })
    const user = userEvent.setup()
    const { router } = renderWithProviders(<SharedPage />, { path: '/shared' })

    expect(await screen.findByText('Συνολικά χρωστάς')).toBeInTheDocument()
    expect(screen.getByText('Εσύ, Άννα')).toBeInTheDocument()
    expect(screen.getByText(/χρωστάς 12,50/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Κρήτη/ })).toHaveAttribute('href', '/shared/groups/7')
    expect(screen.getByText('Ο/Η nikos σε προσκάλεσε στην ομάδα «Σπίτι»')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Συμμετοχή' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/shared/groups/11'))
  })

  it('shows "not found" for a group I cannot open', async () => {
    fetchMock.mockResolvedValue(json(404, { detail: 'Group not found.' }))
    const { router } = renderWithProviders(<SharedPage />, {
      path: '/shared?group=99&month=2026-01',
      routes: [{ path: '/shared/groups/:groupId', element: <SharedGroupPage /> }],
    })
    // The old ?group= link lands on the real route, keeping the other params.
    expect(await screen.findByText('Η ομάδα δεν βρέθηκε')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/shared/groups/99')
    expect(router.state.location.search).toBe('?month=2026-01')
  })
})
