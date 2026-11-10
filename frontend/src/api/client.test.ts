import { afterEach, beforeEach, vi } from 'vitest'
import {
  api,
  ApiError,
  buildUrl,
  detailFrom,
  setCsrfLoader,
  setCsrfToken,
  setUnauthorizedHandler,
} from './client'

const fetchMock = vi.fn<typeof fetch>()

function respond(status: number, body: unknown) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  setCsrfToken(null)
  setCsrfLoader(null)
  setUnauthorizedHandler(null)
})
afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('prefixes /api, sends cookies and skips empty params', async () => {
    fetchMock.mockResolvedValue(respond(200, [1]))
    await expect(
      api.get('/expenses', { params: { month: '2026-11', q: '', x: undefined } }),
    ).resolves.toEqual([1])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/expenses?month=2026-11')
    expect(init?.credentials).toBe('include')
    expect((init?.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined()
  })

  it('adds the CSRF header to non-GET requests, loading the token on demand', async () => {
    setCsrfLoader(async () => 'tok')
    fetchMock.mockResolvedValue(respond(200, { ok: true }))
    await api.post('/expenses', { amount: 3 })
    const init = fetchMock.mock.calls[0][1]!
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"amount":3}')
  })

  it('throws ApiError with status and detail', async () => {
    fetchMock.mockResolvedValue(respond(400, { detail: 'Amount must be positive.' }))
    const err = await api.post('/x', {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 400, detail: 'Amount must be positive.' })
  })

  it('maps network failures to status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api.get('/x')).rejects.toMatchObject({ status: 0 })
  })

  it('calls the unauthorized handler on 401 unless the request opts out', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    fetchMock.mockResolvedValue(respond(401, { detail: 'Not logged in.' }))
    await expect(api.get('/bootstrap')).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    fetchMock.mockResolvedValue(respond(401, { detail: 'Invalid username or password.' }))
    await expect(api.post('/auth/login', {}, { skipAuthRedirect: true })).rejects.toMatchObject({
      detail: 'Invalid username or password.',
    })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('reads FastAPI validation lists and falls back to a generic message', () => {
    expect(detailFrom({ detail: [{ msg: 'Field required' }, { msg: 'Too short' }] }, 422)).toBe(
      'Field required Too short',
    )
    expect(detailFrom(null, 500)).toBe('Κάτι πήγε στραβά.')
    expect(buildUrl('/api/x')).toBe('/api/x')
  })
})
