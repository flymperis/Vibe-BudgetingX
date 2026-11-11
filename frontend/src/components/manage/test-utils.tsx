/** Test helpers for the manage group's component tests (bootstrap + confirm providers, fetch mock). */
import type { ReactElement } from 'react'
import { BootstrapContext, type Bootstrap } from '@/bootstrap/bootstrap'
import { ConfirmProvider } from '@/components/ConfirmProvider'
import { renderWithProviders } from '@/test/render'

export const testBootstrap = {
  user: { id: 1, username: 'tester' },
  today: '2026-11-11',
  month: '2026-11',
  accounts: [
    {
      id: 1,
      name: 'Eurobank',
      account_type: 'bank',
      is_credit_card: false,
      opening_balance: 0,
      current_balance: 100,
    },
    {
      id: 2,
      name: 'Μετρητά',
      account_type: 'bank',
      is_credit_card: false,
      opening_balance: 0,
      current_balance: 20,
    },
  ],
  balance_totals: { cash_total: 120, cards_total: 0, net_total: 120 },
  categories: [
    { id: 10, name: 'Σούπερ μάρκετ' },
    { id: 11, name: 'Καφές' },
  ],
  income_categories: [{ id: 20, name: 'Μισθός' }],
  tag_names: [],
  recent_tags: [],
  budget_enabled: false,
} as unknown as Bootstrap

export function renderManage(ui: ReactElement, path = '/') {
  return renderWithProviders(
    <BootstrapContext value={testBootstrap}>
      <ConfirmProvider>{ui}</ConfirmProvider>
    </BootstrapContext>,
    { path },
  )
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** The JSON body of the first fetch call whose URL ends with `suffix` and method matches. */
export function sentBody(mock: { mock: { calls: unknown[][] } }, method: string, suffix: string): unknown {
  const call = mock.mock.calls.find(
    ([u, init]) => String(u).endsWith(suffix) && (init as RequestInit | undefined)?.method === method,
  )
  if (!call) throw new Error(`no ${method} ${suffix}`)
  return JSON.parse(String((call[1] as RequestInit).body))
}

/** Sheets render as dialogs (desktop) in tests: vaul's drawer needs pointer APIs jsdom lacks. */
export function mockDesktop() {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({
    ...original(query),
    matches: query.includes('min-width'),
    media: query,
  })) as typeof window.matchMedia
  return () => {
    window.matchMedia = original
  }
}
