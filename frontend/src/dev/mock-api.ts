/**
 * DEV ONLY (`npm run dev:mock`): a fake backend for /api/auth/* and
 * /api/bootstrap so the shell can be used before the real backend runs.
 * Any username logs in; the password "wrong" gives the server's 401 message.
 * Every other /api request is passed through to the Vite proxy unchanged.
 * Never imported by production builds (see main.tsx).
 */
import { SAMPLE_ACCOUNTS, SAMPLE_CATEGORIES } from './sample-data'
import { todayISO } from '@/lib/dates'

const KEY = 'vbx.mock.user'
const CSRF = 'mock-csrf-token'

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function currentUser() {
  const name = sessionStorage.getItem(KEY)
  return name ? { id: 1, username: name } : null
}

export function installMockApi() {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      location.origin,
    )
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = url.pathname
    if (!path.startsWith('/api/auth/') && path !== '/api/bootstrap') return realFetch(input, init)

    await wait(250)
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {}
    if (
      method !== 'GET' &&
      (init?.headers as Record<string, string> | undefined)?.['X-CSRF-Token'] !== CSRF
    ) {
      return json(403, { detail: 'CSRF token missing or invalid.' })
    }

    if (path === '/api/auth/session') {
      return json(200, { user: currentUser(), csrf_token: CSRF, allow_registration: true })
    }
    if (path === '/api/auth/login' && method === 'POST') {
      if (!body.username || body.password === 'wrong' || !body.password) {
        return json(401, { detail: 'Invalid username or password.' })
      }
      sessionStorage.setItem(KEY, body.username)
      return json(200, { user: currentUser(), csrf_token: CSRF })
    }
    if (path === '/api/auth/register' && method === 'POST') {
      if (!/^[A-Za-z0-9._-]{3,32}$/.test(body.username ?? ''))
        return json(400, { detail: 'Username must be 3–32 characters (letters, digits, . _ -).' })
      if ((body.password ?? '').length < 8)
        return json(400, { detail: 'Password must be at least 8 characters.' })
      if (body.password !== body.password2) return json(400, { detail: 'Passwords do not match.' })
      sessionStorage.setItem(KEY, body.username)
      return json(200, { user: currentUser(), csrf_token: CSRF })
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      sessionStorage.removeItem(KEY)
      return json(200, { ok: true })
    }
    if (path === '/api/bootstrap') {
      const user = currentUser()
      if (!user) return json(401, { detail: 'Not logged in.' })
      const accounts = SAMPLE_ACCOUNTS.map((name, i) => ({
        id: i + 1,
        name,
        account_type: 'bank',
        is_credit_card: false,
        opening_balance: 0,
        current_balance: 1000 - i * 150,
      }))
      const total = accounts.reduce((s, a) => s + a.current_balance, 0)
      return json(200, {
        user,
        today: todayISO(),
        month: todayISO().slice(0, 7),
        accounts,
        balance_totals: { cash_total: total, cards_total: 0, net_total: total },
        categories: SAMPLE_CATEGORIES.map((c, i) => ({ id: i + 1, name: c.name })),
        income_categories: [{ id: 1, name: 'Μισθός' }],
        tag_names: ['Νοέμβρης', 'φίλοι'],
        recent_tags: ['Νοέμβρης'],
        budget_enabled: true,
        posted_recurring: 0,
      })
    }
    return json(404, { detail: 'Not found.' })
  }
  console.info('[vbx] mock API active for /api/auth/* and /api/bootstrap')
}
