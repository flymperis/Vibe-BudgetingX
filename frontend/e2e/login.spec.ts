import { expect, test, type Page } from '@playwright/test'

/** Fakes the auth contract from docs/ARCHITECTURE.md; no backend needed. */
async function mockApi(page: Page) {
  let user: { id: number; username: string } | null = null
  // Only the backend: Vite also serves modules under /src/api/.
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const req = route.request()
      const path = new URL(req.url()).pathname
      const json = (status: number, body: unknown) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

      if (path === '/api/auth/session')
        return json(200, { user, csrf_token: 'tok', allow_registration: false })
      if (path === '/api/auth/login') {
        expect(req.headers()['x-csrf-token']).toBe('tok')
        const body = req.postDataJSON() as { username: string; password: string }
        if (body.password !== 'correct horse') return json(401, { detail: 'Invalid username or password.' })
        user = { id: 1, username: body.username }
        return json(200, { user, csrf_token: 'tok2' })
      }
      if (path === '/api/bootstrap') {
        if (!user) return json(401, { detail: 'Not logged in.' })
        return json(200, {
          user,
          today: '2026-11-10',
          month: '2026-11',
          accounts: [],
          categories: [],
          income_categories: [],
          tag_names: [],
          recent_tags: [],
          budget_enabled: false,
          posted_recurring: 0,
          balance_totals: { cash_total: 0, cards_total: 0, net_total: 0 },
        })
      }
      return json(404, { detail: 'Not found.' })
    },
  )
}

test('login page: shows the server error inline, then logs in and lands home', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')

  // Not logged in: redirected to /login
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Καλώς ήρθες ξανά')
  // allow_registration is false: no register link
  await expect(page.getByRole('link', { name: 'Δημιουργία λογαριασμού' })).toHaveCount(0)

  await page.getByLabel('Όνομα χρήστη').fill('demo_user')
  await page.getByLabel('Κωδικός', { exact: true }).fill('nope')
  await page.getByRole('button', { name: 'Σύνδεση' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid username or password.')

  await page.getByLabel('Κωδικός', { exact: true }).fill('correct horse')
  await page.getByRole('button', { name: 'Σύνδεση' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Αρχική' })).toBeVisible()
})
