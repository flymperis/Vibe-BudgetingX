import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import { setCsrfToken } from '@/api/client'
import { renderWithProviders } from '@/test/render'
import LoginPage from './LoginPage'
import { safeNext } from './next'

const fetchMock = vi.fn<typeof fetch>()
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  setCsrfToken(null)
})
afterEach(() => vi.unstubAllGlobals())

describe('LoginPage', () => {
  it('shows the server detail inline and hides register when closed', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/api/auth/session'))
        return json(200, { user: null, csrf_token: 'tok', allow_registration: false })
      if (url.endsWith('/api/auth/login')) return json(401, { detail: 'Invalid username or password.' })
      return json(404, { detail: 'nope' })
    })
    const user = userEvent.setup()
    renderWithProviders(<LoginPage />, { path: '/login' })

    await user.type(screen.getByLabelText('Όνομα χρήστη'), 'demo_user')
    await user.type(screen.getByLabelText('Κωδικός'), 'bad')
    await user.click(screen.getByRole('button', { name: 'Σύνδεση' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password.')
    expect(screen.queryByRole('link', { name: 'Δημιουργία λογαριασμού' })).toBeNull()

    const loginCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/login'))!
    expect((loginCall[1]!.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok')
  })

  it('offers registration when the server allows it', async () => {
    fetchMock.mockResolvedValue(json(200, { user: null, csrf_token: 'tok', allow_registration: true }))
    renderWithProviders(<LoginPage />, { path: '/login' })
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Δημιουργία λογαριασμού' })).toBeInTheDocument(),
    )
  })
})

describe('safeNext', () => {
  it('only allows same-origin paths', () => {
    expect(safeNext('/expenses?month=2026-10')).toBe('/expenses?month=2026-10')
    expect(safeNext('//evil.com')).toBe('/')
    expect(safeNext('https://evil.com')).toBe('/')
    expect(safeNext('/login')).toBe('/')
    expect(safeNext(null)).toBe('/')
  })
})
