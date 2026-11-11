import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setCsrfToken } from '@/api/client'
import { ConfirmProvider } from '@/components/ConfirmProvider'
import type { Investments } from './api'
import CryptoPage from './CryptoPage'
import InvestmentsLayout from './InvestmentsLayout'
import StocksPage from './StocksPage'
import { json, mockDesktop } from '@/test/helpers'

const fetchMock = vi.fn<typeof fetch>()

let restoreMatchMedia = () => {}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  setCsrfToken('tok')
  // Desktop: the form opens as a dialog.
  restoreMatchMedia = mockDesktop()
})
afterEach(() => {
  vi.unstubAllGlobals()
  restoreMatchMedia()
})

function payload(loaded = true): Investments {
  return {
    finnhub_configured: false,
    price_cache_ttl_seconds: 300,
    crypto: {
      total_value: loaded ? 1639.23 : null,
      total_invested: 1124.5,
      total_pnl: loaded ? 514.73 : null,
      total_pnl_pct: loaded ? 45.77 : null,
      prices_loaded: loaded,
      prices_age_seconds: loaded ? 4 : null,
      holdings: [
        {
          coin_id: 'bitcoin',
          coin_symbol: 'BTC',
          coin_name: 'Bitcoin',
          quantity: 0.025,
          total_cost: 1124.5,
          avg_buy_price: 44980,
          current_price: loaded ? 65569 : null,
          change_24h: loaded ? -1.69 : null,
          current_value: loaded ? 1639.23 : null,
          pnl: loaded ? 514.73 : null,
          pnl_pct: loaded ? 45.77 : 0,
        },
      ],
      transactions: [
        {
          id: 7,
          coin_id: 'bitcoin',
          coin_symbol: 'BTC',
          coin_name: 'Bitcoin',
          tx_type: 'buy',
          quantity: 0.025,
          price_per_unit: 44900,
          fee: 2,
          exchange: 'Binance',
          transacted_at: '2026-02-14',
          notes: '',
          total: 1124.5,
        },
      ],
    },
    stocks: {
      total_value: null,
      total_invested: 0,
      total_pnl: null,
      total_pnl_pct: null,
      prices_loaded: true,
      prices_age_seconds: null,
      holdings: [],
      transactions: [],
    },
  }
}

interface Call {
  method: string
  path: string
  search: string
  body: unknown
}

function serve(data: Investments, write?: (c: Call) => Response | undefined) {
  const calls: Call[] = []
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://x')
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }
    calls.push(call)
    if (call.method !== 'GET') return write?.(call) ?? json(200, { message: 'ok', transaction: {} })
    if (url.pathname === '/api/investments') return json(200, data)
    if (url.pathname.endsWith('/search')) return json(200, [])
    return json(404, { detail: 'nope' })
  })
  return calls
}

function renderScreen(path = '/investments/crypto') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter(
    [
      {
        path: '/investments',
        element: <InvestmentsLayout />,
        children: [
          { path: 'crypto', element: <CryptoPage /> },
          { path: 'stocks', element: <StocksPage /> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={qc}>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </QueryClientProvider>,
  )
  return { qc, router }
}

const priceCalls = (calls: Call[]) => calls.filter((c) => c.method === 'GET' && c.path === '/api/investments')

describe('Investments screen', () => {
  it('asks for live prices once on open; switching tabs does not refetch', async () => {
    const calls = serve(payload())
    const user = userEvent.setup()
    renderScreen()
    expect(await screen.findAllByText('1.639,23 €')).not.toHaveLength(0)
    expect(priceCalls(calls)).toHaveLength(1)
    expect(priceCalls(calls)[0].search).toBe('?live=true')

    await user.click(screen.getByRole('link', { name: 'Μετοχές' }))
    expect(await screen.findByText(/FINNHUB_API_KEY/)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Crypto' }))
    await screen.findAllByText('1.639,23 €')
    expect(priceCalls(calls)).toHaveLength(1)
  })

  it('shows holdings, totals and P&L', async () => {
    serve(payload())
    renderScreen()
    expect((await screen.findAllByText('1.124,50 €')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('+45,8%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('-1,7%').length).toBeGreaterThan(0)
    expect(screen.getByText(/Ενημέρωση πριν από 4δ/)).toBeInTheDocument()
  })

  it('shows a dash, not zero, while prices are not loaded', async () => {
    serve(payload(false))
    renderScreen()
    expect(await screen.findByText(/Οι τιμές δεν έχουν φορτωθεί/)).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Σύνοψη χαρτοφυλακίου' })
    expect(within(summary).getAllByText('—')).toHaveLength(2)
    expect(screen.queryByText(/-100/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ενημέρωση πριν/)).not.toBeInTheDocument()
  })

  it('refresh button forces a lookup for its asset class only', async () => {
    const calls = serve(payload())
    const user = userEvent.setup()
    renderScreen()
    await user.click(await screen.findByRole('button', { name: 'Ανανέωση τιμών' }))
    await waitFor(() => expect(priceCalls(calls)).toHaveLength(2))
    expect(priceCalls(calls)[1].search).toBe('?live=true&refresh_crypto=true')
  })

  it('adds a crypto buy with the old field mapping', async () => {
    const calls = serve(payload())
    const user = userEvent.setup()
    renderScreen()
    await user.click((await screen.findAllByRole('button', { name: 'Νέα συναλλαγή' }))[0])
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Coin ID'), 'solana')
    await user.type(within(dialog).getByLabelText('Σύμβολο'), 'SOL')
    await user.type(within(dialog).getByLabelText('Όνομα'), 'Solana')
    await user.type(within(dialog).getByLabelText('Ποσότητα'), '12,5')
    await user.type(within(dialog).getByLabelText('Τιμή μονάδας (€)'), '95')
    await user.click(within(dialog).getByRole('button', { name: 'Νέα συναλλαγή' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.path).toBe('/api/investments/crypto')
    expect(post.body).toMatchObject({
      coin_id: 'solana',
      coin_symbol: 'SOL',
      coin_name: 'Solana',
      tx_type: 'buy',
      quantity: 12.5,
      price_per_unit: 95,
      fee: 0,
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // The list is refreshed from the database at once (cache-only prices), then the
    // live lookup runs in the background: the new row never waits for the network.
    await waitFor(() =>
      expect(priceCalls(calls).map((c) => c.search)).toEqual(['?live=true', '?live=false', '?live=true']),
    )
  })

  it('shows the server message inline when the transaction is rejected', async () => {
    serve(payload(), () => json(400, { detail: 'Fill in Coin ID, Symbol, and Name.' }))
    const user = userEvent.setup()
    renderScreen()
    await user.click((await screen.findAllByRole('button', { name: 'Νέα συναλλαγή' }))[0])
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Νέα συναλλαγή' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Fill in Coin ID, Symbol, and Name.')
  })

  it('edits and deletes a transaction (with confirmation)', async () => {
    const calls = serve(payload())
    const user = userEvent.setup()
    renderScreen()
    await user.click(await screen.findByRole('button', { name: /Επεξεργασία: Αγορά BTC/ }))
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Ανταλλακτήριο')).toHaveValue('Binance')
    await user.clear(within(dialog).getByLabelText('Προμήθεια (€)'))
    await user.type(within(dialog).getByLabelText('Προμήθεια (€)'), '3')
    await user.click(within(dialog).getByRole('button', { name: 'Αποθήκευση' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.path).toBe('/api/investments/crypto/7')
    expect(put.body).toMatchObject({ fee: 3, quantity: 0.025, coin_id: 'bitcoin' })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /Επεξεργασία: Αγορά BTC/ }))
    dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Διαγραφή συναλλαγής' }))
    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: 'Διαγραφή' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true))
    expect(calls.find((c) => c.method === 'DELETE')!.path).toBe('/api/investments/crypto/7')
  })
})
