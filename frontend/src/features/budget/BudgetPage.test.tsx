import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setCsrfToken } from '@/api/client'
import { ConfirmProvider } from '@/components/ConfirmProvider'
import { renderWithProviders } from '@/test/render'
import type { BudgetPanel } from './api'
import BudgetPage from './BudgetPage'
import { json, mockDesktop } from '@/test/helpers'

const fetchMock = vi.fn<typeof fetch>()

let restoreMatchMedia = () => {}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  setCsrfToken('tok')
  // Desktop layout: dialogs and typed amount inputs instead of the drawer + keypad.
  restoreMatchMedia = mockDesktop()
})
afterEach(() => {
  vi.unstubAllGlobals()
  restoreMatchMedia()
})

const line = (
  id: number | null,
  name: string,
  budget: number,
  spent: number,
  status: string,
  override: number | null = null,
) => ({
  category_id: id,
  name,
  default: override === null && id !== null ? budget : null,
  override,
  budget,
  spent,
  remaining: budget - spent,
  pct: (spent / budget) * 100,
  status,
})

function panel(overrides: Partial<BudgetPanel> = {}): BudgetPanel {
  const coffee = line(2, 'Καφές', 50, 129.5, 'over')
  return {
    month: '2026-10',
    enabled: true,
    summary: {
      ym: '2026-10',
      cleared: false,
      rows: [line(1, 'Σούπερ μάρκετ', 350, 320, 'warn'), coffee, line(3, 'Μεταφορικά', 70, 42, 'ok', 70)],
      unbudgeted: [{ category_id: 4, name: 'Ψυχαγωγία', spent: 75 }],
      unbudgeted_spent: 75,
      other: line(null, 'Everything else', 100, 75, 'ok'),
      total_budget: 570,
      total_spent: 566.5,
      total_remaining: 3.5,
      total_pct: 99.4,
      total_status: 'warn',
      over: [coffee],
    },
    form_rows: [
      { id: 1, name: 'Σούπερ μάρκετ', default: 350, avg: 352, active: true, fixed: false },
      { id: 2, name: 'Καφές', default: 50, avg: 54, active: true, fixed: true },
      { id: 3, name: 'Μεταφορικά', default: null, avg: 0, active: true, fixed: false },
      { id: 4, name: 'Ψυχαγωγία', default: null, avg: 50, active: true, fixed: false },
    ],
    other_amount: 100,
    defaults_total: 500,
    has_any_default: true,
    can_clear_month: true,
    cleared_total_spent: null,
    month_snapshots: [{ ym: '2026-09', amounts: { '1': 300, '2': 60 } }],
    ...overrides,
  }
}

/** Answers GET /api/budget with `data` and every POST with ok (or `postReply`). */
function serve(data: BudgetPanel, postReply?: (path: string, body: unknown) => Response | undefined) {
  const posts: { path: string; body: unknown }[] = []
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://x')
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      posts.push({ path: url.pathname, body })
      return postReply?.(url.pathname, body) ?? json(200, { ok: true, message: 'ok' })
    }
    if (url.pathname === '/api/budget') return json(200, data)
    return json(404, { detail: 'nope' })
  })
  return posts
}

const render = (path = '/budget?month=2026-10') =>
  renderWithProviders(
    <ConfirmProvider>
      <BudgetPage />
    </ConfirmProvider>,
    { path },
  )

describe('BudgetPage', () => {
  it('offers to enable budgeting when it is off', async () => {
    const posts = serve(panel({ enabled: false, summary: null }))
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: 'Ενεργοποίηση budget' }))
    await waitFor(() => expect(posts).toEqual([{ path: '/api/budget/toggle', body: { enabled: true } }]))
  })

  it('shows the month: hero, rows with left/over, over list, unbudgeted', async () => {
    serve(panel())
    render()
    expect(await screen.findByText('3,50 €')).toBeInTheDocument()
    expect(screen.getByText('1 κατηγορία πάνω από το budget')).toBeInTheDocument()
    expect(screen.getAllByText('79,50 € πάνω').length).toBe(2)
    expect(screen.getByText('30,00 € μένουν')).toBeInTheDocument()
    expect(screen.getByText('Όλα τα υπόλοιπα')).toBeInTheDocument()
    expect(screen.getByText('Καλύπτονται από «Όλα τα υπόλοιπα»')).toBeInTheDocument()
    expect(screen.getByText('Μόνο αυτόν τον μήνα')).toBeInTheDocument()
  })

  it('saves a category for this month only, and resets an override', async () => {
    const posts = serve(panel())
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: /Σούπερ μάρκετ/ }))
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByLabelText('Ποσό')
    expect(amount).toHaveValue('350')
    await user.clear(amount)
    await user.type(amount, '400,5')
    await user.click(within(dialog).getByRole('button', { name: 'Αποθήκευση' }))
    await waitFor(() =>
      expect(posts).toEqual([
        { path: '/api/budget/override', body: { month: '2026-10', category_id: 1, amount: '400.5' } },
      ]),
    )

    await user.click(await screen.findByRole('button', { name: /Μεταφορικά/ }))
    const dialog2 = await screen.findByRole('dialog')
    await user.click(within(dialog2).getByRole('button', { name: 'Επαναφορά στο κανονικό ποσό' }))
    await waitFor(() =>
      expect(posts[1]).toEqual({
        path: '/api/budget/override',
        body: { month: '2026-10', category_id: 3, clear: true },
      }),
    )
  })

  it('requires an amount for this month and shows the server detail inline', async () => {
    const posts = serve(panel(), () => json(400, { detail: 'Invalid budget amount.' }))
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: /Σούπερ μάρκετ/ }))
    const dialog = await screen.findByRole('dialog')
    await user.clear(within(dialog).getByLabelText('Ποσό'))
    await user.click(within(dialog).getByRole('button', { name: 'Αποθήκευση' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Γράψε ένα ποσό.')
    expect(posts).toEqual([])

    await user.type(within(dialog).getByLabelText('Ποσό'), '5')
    await user.click(within(dialog).getByRole('button', { name: 'Αποθήκευση' }))
    expect(await within(dialog).findByText('Invalid budget amount.')).toBeInTheDocument()
  })

  it('changes the default for every month and keeps the fixed flag', async () => {
    const posts = serve(panel())
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: /^Καφές/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: 'Κάθε μήνα' }))
    expect(within(dialog).getByRole('switch')).toBeChecked()
    const amount = within(dialog).getByLabelText('Ποσό')
    await user.clear(amount)
    await user.type(amount, '60')
    await user.click(within(dialog).getByRole('button', { name: 'Αποθήκευση' }))
    await waitFor(() =>
      expect(posts).toEqual([
        { path: '/api/budget/defaults', body: { amounts: { '2': '60' }, fixed: { '2': true } } },
      ]),
    )
  })

  it('clears the month after confirming, and disables budgeting', async () => {
    const posts = serve(panel())
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole('button', { name: /Καθαρισμός μήνα/ }))
    const alert = await screen.findByRole('alertdialog')
    await user.click(within(alert).getByRole('button', { name: 'Καθαρισμός μήνα' }))
    await waitFor(() =>
      expect(posts[0]).toEqual({ path: '/api/budget/clear-month', body: { month: '2026-10' } }),
    )
    await user.click(screen.getByRole('button', { name: /Απενεργοποίηση budget/ }))
    await waitFor(() => expect(posts[1]).toEqual({ path: '/api/budget/toggle', body: { enabled: false } }))
  })

  it('cleared month without own amounts: spent and restore', async () => {
    const data = panel({ cleared_total_spent: 640.25, can_clear_month: false })
    data.summary = { ...data.summary!, cleared: true, rows: [], other: null, over: [] }
    const posts = serve(data)
    const user = userEvent.setup()
    render()
    expect(await screen.findByText('640,25 €')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Καθαρισμός μήνα/ })).toBeNull()
    // every category is listed, with dashes
    expect(screen.getAllByText('Χωρίς budget αυτόν τον μήνα')).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: 'Επαναφορά μηνιαίων budget' }))
    await waitFor(() =>
      expect(posts[0]).toEqual({ path: '/api/budget/restore-month', body: { month: '2026-10' } }),
    )
  })
})

describe('Monthly budgets editor', () => {
  it('edits every default, Everything else and the fixed flags, then saves them all', async () => {
    const posts = serve(panel())
    const user = userEvent.setup()
    render('/budget?month=2026-10&edit=defaults')
    const field = await screen.findByLabelText('Σούπερ μάρκετ')
    expect(field).toHaveValue('350')
    expect(screen.getByText('500,00 €')).toBeInTheDocument() // live total: 350 + 50 + Everything else 100
    await user.clear(field)
    await user.type(field, '360')
    await user.type(screen.getByLabelText('Μεταφορικά'), '20')
    await user.click(screen.getByRole('button', { name: 'Σταθερό ποσό για Καφές' }))
    await user.clear(screen.getByLabelText('Όλα τα υπόλοιπα'))
    expect(screen.getByText('430,00 €')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση budget' }))
    await waitFor(() =>
      expect(posts).toEqual([
        {
          path: '/api/budget/defaults',
          body: { amounts: { '1': '360', '2': '50', '3': '20', '4': '' }, fixed: {}, other_amount: '' },
        },
      ]),
    )
  })

  it('distributes a total by average and copies from another month', async () => {
    serve(panel())
    const user = userEvent.setup()
    render('/budget?month=2026-10&edit=defaults')
    await user.type(await screen.findByLabelText('Σύνολο'), '10')
    await user.click(screen.getByRole('button', { name: 'Μοίρασε' }))
    expect(await screen.findByText(/ξεπερνούν το σύνολο/)).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Σύνολο'))
    await user.type(screen.getByLabelText('Σύνολο'), '452')
    await user.click(screen.getByRole('button', { name: 'Μοίρασε' }))
    // 50 kept for the fixed Καφές; 402 split 352:50 between the two with history
    expect(screen.getByLabelText('Σούπερ μάρκετ')).toHaveValue('352')
    expect(screen.getByLabelText('Ψυχαγωγία')).toHaveValue('50')
    expect(screen.getByLabelText('Μεταφορικά')).toHaveValue('')
    expect(screen.getByText(/1 σταθερή κατηγορία/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Αντιγραφή από άλλον μήνα/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('μένει (σταθερό) 50,00 €')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Συμπλήρωση' }))
    await waitFor(() => expect(screen.getByLabelText('Σούπερ μάρκετ')).toHaveValue('300'))
    expect(screen.getByText(/συμπληρώθηκαν από τα budget του Σεπτεμβρίου 2026/)).toBeInTheDocument()
  })
})
