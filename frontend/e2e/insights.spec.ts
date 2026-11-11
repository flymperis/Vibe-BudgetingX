/**
 * Insights screens (Investments, Reports) against the REAL dev backend,
 * through the insights dev server (`npm run dev -- --port 5185 --strictPort`;
 * override with INSIGHTS_BASE_URL). Each test registers a fresh user.
 * Note: investments and the report overview ask the backend for live prices
 * (CoinGecko / Yahoo), so these tests need the backend to have internet; the
 * assertions do not depend on the price values.
 */
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.INSIGHTS_BASE_URL ?? 'http://127.0.0.1:5185'
test.use({ baseURL: BASE })

const PASSWORD = 'insights-e2e-pass-1'

async function setup(page: Page) {
  const req = page.request
  const session = await (await req.get('/api/auth/session')).json()
  const username = `agent_insights_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const reg = await req.post('/api/auth/register', {
    data: { username, password: PASSWORD, password2: PASSWORD },
    headers: { 'X-CSRF-Token': session.csrf_token },
  })
  expect(reg.ok()).toBeTruthy()
  const csrf = (await reg.json()).csrf_token as string
  const post = async (path: string, data: unknown) => {
    const res = await req.post(path, { data, headers: { 'X-CSRF-Token': csrf } })
    expect(res.ok(), `${path}: ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  await post('/api/accounts', { name: 'Δεύτερος λογαριασμός', account_type: 'bank', opening_balance: 100 })
  const boot = await (await req.get('/api/bootstrap')).json()
  return { boot, post, year: Number((boot.today as string).slice(0, 4)) }
}

test('investments: add, edit and delete a crypto buy; stocks tab defaults', async ({ page }) => {
  await setup(page)
  const priceCalls: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.pathname === '/api/investments' && r.method() === 'GET') priceCalls.push(u.search)
  })
  await page.goto('/investments/crypto')
  await expect(page.getByText('Καμία θέση ακόμα')).toBeVisible()
  expect(priceCalls).toEqual(['?live=true'])

  // Add
  await page.getByRole('button', { name: 'Νέα συναλλαγή' }).first().click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Coin ID').fill('bitcoin')
  await sheet.getByLabel('Σύμβολο', { exact: true }).fill('BTC')
  await sheet.getByLabel('Όνομα').fill('Bitcoin')
  await sheet.getByLabel('Ποσότητα').fill('0,015')
  await sheet.getByLabel('Τιμή μονάδας (€)').fill('38000')
  await sheet.getByLabel('Προμήθεια (€)').fill('2,5')
  await sheet.getByLabel('Ανταλλακτήριο').fill('Binance')
  await sheet.getByRole('button', { name: 'Νέα συναλλαγή' }).click()
  await expect(sheet).toBeHidden()
  const history = page.getByRole('list', { name: 'Ιστορικό συναλλαγών' })
  await expect(history.getByText('572,50 €')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Θέσεις' }).getByText('BTC', { exact: true })).toBeVisible()

  // Inline server validation
  await page.getByRole('button', { name: 'Νέα συναλλαγή' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Νέα συναλλαγή' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Fill in Coin ID, Symbol, and Name.')
  await page.keyboard.press('Escape')

  // Edit
  await history.getByRole('button').first().click()
  await page.getByRole('dialog').getByLabel('Προμήθεια (€)').fill('12,5')
  await page.getByRole('dialog').getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(history.getByText('582,50 €')).toBeVisible()

  // Tab switch does not ask for prices again
  await page.getByRole('navigation', { name: 'Είδη επενδύσεων' }).getByRole('link', { name: 'Μετοχές' }).click()
  await expect(page.getByText('Καμία συναλλαγή ακόμα')).toBeVisible()
  await page.getByRole('button', { name: 'Νέα συναλλαγή' }).first().click()
  await expect(page.getByRole('dialog').getByLabel('Broker')).toHaveValue('Freedom24')
  await page.keyboard.press('Escape')
  await page.getByRole('navigation', { name: 'Είδη επενδύσεων' }).getByRole('link', { name: 'Crypto' }).click()
  expect(priceCalls.filter((s) => s.includes('refresh'))).toEqual([])

  // Refresh prices = forced lookup for crypto only
  await page.getByRole('button', { name: 'Ανανέωση τιμών' }).click()
  await expect.poll(() => priceCalls.some((s) => s.includes('refresh_crypto=true'))).toBe(true)

  // Delete
  await history.getByRole('button').first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Διαγραφή συναλλαγής' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Διαγραφή' }).click()
  await expect(page.getByText('Καμία συναλλαγή ακόμα')).toBeVisible()
})

test('reports: overview filters, spending pivot, tags and portfolio charts', async ({ page }) => {
  const { boot, post, year } = await setup(page)
  const [cat] = boot.categories
  const acc = boot.accounts[0].id
  await post('/api/expenses', {
    amount: -120.4,
    category_id: cat.id,
    account_id: acc,
    spent_at: `${year}-01-15`,
    notes: 'Ξενοδοχείο #ταξίδι',
  })
  await post('/api/expenses', {
    amount: -30,
    category_id: cat.id,
    account_id: acc,
    spent_at: `${year - 1}-03-02`,
    notes: 'Καφές',
  })
  await post('/api/income', {
    amount: 1000,
    category_id: boot.income_categories[0].id,
    account_id: acc,
    received_at: `${year}-01-01`,
    notes: '',
  })

  // Overview
  await page.goto('/reports/overview')
  await expect(page.getByText('1.000,00 €').first()).toBeVisible()
  await expect(page.getByText('+879,60 €').first()).toBeVisible()
  await expect(page.getByRole('list', { name: 'Μήνα προς μήνα' }).getByRole('listitem')).toHaveCount(1)
  await expect(page.locator('.recharts-surface').first()).toBeVisible()

  // Account filter
  await page.getByRole('combobox', { name: 'Λογαριασμός' }).click()
  await page.getByRole('option', { name: 'Δεύτερος λογαριασμός' }).click()
  await expect(page).toHaveURL(/account=\d+/)
  await expect(page.getByText(/Τράπεζα: Δεύτερος λογαριασμός/)).toBeVisible()

  // Year switch (previous year has the one coffee)
  await page.getByRole('button', { name: 'Προηγούμενο έτος' }).click()
  await expect(page).toHaveURL(new RegExp(`year=${year - 1}`))

  // Spending keeps the chosen year for the session
  await page.getByRole('navigation', { name: 'Ενότητες αναφορών' }).getByRole('link', { name: 'Έξοδα' }).click()
  await expect(page.getByRole('combobox', { name: 'Διάλεξε έτος' })).toHaveText(String(year - 1))
  await expect(page.getByRole('table').getByText('-30,00 €').first()).toBeVisible()
  await page.getByRole('button', { name: 'Επόμενο έτος' }).click()
  await expect(page.getByRole('table').getByText('-120,40 €').first()).toBeVisible()
  await expect(page.getByText('νέα φέτος').or(page.getByText(/σε σχέση με το/)).first()).toBeVisible()

  // Tags list -> one tag -> back
  await page.goto('/reports/tags')
  await page.getByRole('link', { name: /#ταξίδι/ }).click()
  await expect(page.getByRole('heading', { name: '#ταξίδι' })).toBeVisible()
  await expect(page.getByText('100% του συνόλου')).toBeVisible()
  await page.getByRole('link', { name: 'Όλα τα tags' }).click()
  await expect(page.getByRole('link', { name: /#ταξίδι/ })).toBeVisible()

  // Investments charts
  await page.goto('/reports/investments')
  await expect(page.getByRole('heading', { name: /Crypto —/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Μετοχές — \$/ })).toBeVisible()
})
