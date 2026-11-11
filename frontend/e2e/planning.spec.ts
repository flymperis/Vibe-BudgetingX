/**
 * Planning screens (Budget, Summary, Yearly) against the REAL dev backend,
 * through the planning dev server (`npm run dev -- --port 5183 --strictPort`;
 * override with PLANNING_BASE_URL). Each test registers a fresh user.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const BASE = process.env.PLANNING_BASE_URL ?? 'http://127.0.0.1:5183'
test.use({ baseURL: BASE })

const PASSWORD = 'planning-e2e-pass-1'

async function setup(page: Page) {
  const req: APIRequestContext = page.request
  const session = await (await req.get('/api/auth/session')).json()
  const username = `agent_planning_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
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
  for (const name of ['Σούπερ μάρκετ', 'Καφές']) await post('/api/categories', { name })
  const boot = await (await req.get('/api/bootstrap')).json()
  const cat = (n: string) => boot.categories.find((c: { name: string }) => c.name === n).id
  const account = boot.accounts[0].id
  const month = boot.month as string
  await post('/api/expenses', {
    amount: -120,
    category_id: cat('Σούπερ μάρκετ'),
    account_id: account,
    spent_at: boot.today,
    notes: '',
  })
  await post('/api/expenses', {
    amount: -30,
    category_id: cat('Καφές'),
    account_id: account,
    spent_at: boot.today,
    notes: '',
  })
  await post('/api/income', {
    amount: 1000,
    category_id: boot.income_categories[0].id,
    account_id: account,
    received_at: boot.today,
    notes: '',
  })
  return { month, year: Number(month.slice(0, 4)) }
}

test('budget: enable, set defaults, override a month, clear and restore, disable', async ({ page }) => {
  await setup(page)
  await page.goto('/budget')

  await page.getByRole('button', { name: 'Ενεργοποίηση budget' }).click()
  await expect(page.getByText('Δεν έχεις ορίσει budget ακόμα')).toBeVisible()

  // Monthly budgets editor
  await page.getByRole('button', { name: 'Όρισε μηνιαία budget' }).click()
  await expect(page.getByRole('heading', { name: 'Μηνιαία budget' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Σούπερ μάρκετ', exact: true }).fill('100')
  await page.getByRole('textbox', { name: 'Καφές', exact: true }).fill('50')
  await page.getByRole('button', { name: 'Σταθερό ποσό για Καφές' }).click()
  await page.getByRole('textbox', { name: 'Όλα τα υπόλοιπα', exact: true }).fill('20')
  await expect(page.getByText('170,00 €')).toBeVisible()
  await page.getByRole('button', { name: 'Αποθήκευση budget' }).click()
  await expect(page.getByText('Τα μηνιαία budget αποθηκεύτηκαν')).toBeVisible()

  // Back on the month: over and left
  await expect(page.getByText('20,00 € πάνω').first()).toBeVisible()
  await expect(page.getByText('20,00 € μένουν')).toHaveCount(2)
  await expect(page.getByText('1 κατηγορία πάνω από το budget')).toBeVisible()

  // This month only
  await page.getByRole('button', { name: /^Σούπερ μάρκετ/ }).click()
  const sheet = page.getByRole('dialog')
  const isDesktop = (page.viewportSize()?.width ?? 0) >= 768
  if (isDesktop) {
    await sheet.getByLabel('Ποσό').fill('150')
  } else {
    for (let i = 0; i < 3; i++) await sheet.getByRole('button', { name: 'Σβήσιμο' }).click()
    for (const k of ['1', '5', '0']) await sheet.getByRole('button', { name: k, exact: true }).click()
  }
  await sheet.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Μόνο αυτόν τον μήνα')).toBeVisible()
  await expect(page.getByText('30,00 € μένουν')).toBeVisible()

  // Reset to default
  await page.getByRole('button', { name: /^Σούπερ μάρκετ/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Επαναφορά στο κανονικό ποσό' }).click()
  await expect(page.getByText('Μόνο αυτόν τον μήνα')).toHaveCount(0)

  // Clear the month and restore it
  await page.getByRole('button', { name: /Καθαρισμός μήνα/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Καθαρισμός μήνα' }).click()
  await expect(page.getByText(/χωρίς budget$/)).toBeVisible()
  await expect(page.getByText('150,00 €').first()).toBeVisible()
  await page.getByRole('button', { name: 'Επαναφορά μηνιαίων budget' }).click()
  await expect(page.getByText(/^Απομένουν/)).toBeVisible()

  // Summary shows the budget table
  await page.goto('/summary')
  await expect(page.getByText('Budget 100,00 € ·')).toBeVisible()
  await expect(page.getByText('1.000,00 €').first()).toBeVisible()

  // Disable
  await page.goto('/budget')
  await page.getByRole('button', { name: /Απενεργοποίηση budget/ }).click()
  await expect(page.getByRole('button', { name: 'Ενεργοποίηση budget' })).toBeVisible()
})

test('yearly: months, totals, chart and year switch', async ({ page }) => {
  const { year } = await setup(page)
  await page.goto('/yearly')
  await expect(page.getByText(String(year), { exact: true })).toBeVisible()
  const table = page.getByRole('table')
  await expect(table.getByRole('row')).toHaveCount(14)
  await expect(table.getByRole('row').last()).toContainText('1.000,00 €')
  await expect(table.getByRole('row').last()).toContainText('150,00 €')
  await expect(page.getByRole('img', { name: /Ραβδόγραμμα/ })).toBeVisible()
  await page.getByRole('button', { name: 'Προηγούμενο έτος' }).click()
  await expect(page).toHaveURL(new RegExp(`year=${year - 1}`))
  await expect(page.getByText('Καμία κίνηση αυτό το έτος.')).toBeVisible()
  await page.getByRole('button', { name: 'Φέτος' }).click()
  await expect(table.getByRole('row').last()).toContainText('850,00 €')
})
