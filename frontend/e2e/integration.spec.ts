/**
 * Cross-cutting behaviour against the REAL backend: old-app links, deep-link
 * reloads, the back button with sheets, report filters across tabs, losing the
 * session mid-use, and bank logos. Each test registers a fresh user.
 */
import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'integration-e2e-pass-1'

async function register(page: Page) {
  const username = `agent_integ_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const session = await (await page.request.get('/api/auth/session')).json()
  const res = await page.request.post('/api/auth/register', {
    data: { username, password: PASSWORD, password2: PASSWORD },
    headers: { 'X-CSRF-Token': session.csrf_token },
  })
  expect(res.ok()).toBeTruthy()
  return { username, csrf: (await res.json()).csrf_token as string }
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768

test('old app links land on the matching screen, also through the login page', async ({ page }) => {
  await page.goto('/?panel=settings&settings_section=banks')
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Faccounts$/)
  const username = `agent_integ_l_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  await page.goto('/register')
  await page.getByLabel('Όνομα χρήστη').fill(username)
  await page.getByLabel('Κωδικός', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Επανάληψη κωδικού').fill(PASSWORD)
  await page.getByRole('button', { name: 'Δημιουργία λογαριασμού' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Αρχική' })).toBeVisible()

  const cases: [string, RegExp, string][] = [
    ['/?panel=settings&settings_section=banks', /\/settings\/accounts$/, 'Τράπεζες & λογαριασμοί'],
    ['/?panel=reports&reports_section=bank&report_year=2025', /\/reports\/overview\?year=2025$/, 'Αναφορές'],
    ['/?panel=investments&investments_section=stocks', /\/investments\/stocks$/, 'Επενδύσεις'],
    ['/?panel=transfer&month=2026-01', /\/transfers\?month=2026-01$/, 'Μεταφορές'],
    ['/?panel=export', /\/settings\/export$/, 'Εξαγωγή & εισαγωγή'],
    ['/?panel=shared&group=999999', /\/shared\/groups\/999999$/, 'Η ομάδα δεν βρέθηκε'],
    ['/shared?group=999999', /\/shared\/groups\/999999$/, 'Η ομάδα δεν βρέθηκε'],
  ]
  for (const [from, to, text] of cases) {
    await page.goto(from)
    await expect(page).toHaveURL(to)
    await expect(page.getByText(text, { exact: true }).filter({ visible: true }).first()).toBeVisible()
  }
})

test('every route survives a reload (SPA fallback) and unknown paths show not found', async ({ page }) => {
  await register(page)
  for (const path of [
    '/expenses?month=2025-03',
    '/reports/spending?year=2025',
    '/settings/integrations',
    '/yearly?year=2024',
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(path.replace(/[?]/g, '\\?') + '$'))
  }
  await page.goto('/no/such/page')
  await expect(page.getByText('Η σελίδα δεν βρέθηκε')).toBeVisible()
})

test('the back button closes a sheet instead of leaving the screen', async ({ page }) => {
  await register(page)
  await page.goto('/')
  await page.goto('/expenses')
  await page.locator('#main').getByRole('button', { name: 'Νέο έξοδο' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page).toHaveURL(/\/expenses$/)
  // Closing with Escape does not leave an extra history entry behind.
  await page.locator('#main').getByRole('button', { name: 'Νέο έξοδο' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
})

test('report year and account survive switching report tabs', async ({ page }) => {
  await register(page)
  await page.goto('/reports/overview?year=2025')
  const tabs = page.getByRole('navigation', { name: 'Ενότητες αναφορών' })
  await expect(tabs.getByRole('link', { name: 'Tags' })).toHaveAttribute('href', /year=2025/)
  await tabs.getByRole('link', { name: 'Tags' }).click()
  await expect(page).toHaveURL(/\/reports\/tags\?year=2025$/)
  await tabs.getByRole('link', { name: 'Έξοδα' }).click()
  await expect(page).toHaveURL(/\/reports\/spending\?year=2025$/)
  await expect(page.getByText('2025').first()).toBeVisible()
})

test('a lost session mid-use sends the user to the login page and back', async ({ page, context }) => {
  await register(page)
  await page.goto('/budget')
  await expect(page.getByRole('heading', { level: 1, name: 'Budget' })).toBeVisible()
  await context.clearCookies()
  // Any server call now answers 401: client-side navigation to another screen.
  if (isMobile(page))
    await page
      .getByRole('navigation', { name: 'Κύρια πλοήγηση' })
      .getByRole('link', { name: 'Έξοδα' })
      .click()
  else await page.getByRole('complementary').getByRole('link', { name: 'Έξοδα', exact: true }).first().click()
  await expect(page).toHaveURL(/\/login\?next=%2Fexpenses/)
  await expect(page.getByRole('heading', { level: 1, name: 'Καλώς ήρθες ξανά' })).toBeVisible()
})

test('bank logos are served (production build and dev proxy)', async ({ page }) => {
  const { csrf } = await register(page)
  const res = await page.request.post('/api/accounts', {
    data: { name: 'Eurobank', account_type: 'bank', opening_balance: 10 },
    headers: { 'X-CSRF-Token': csrf },
  })
  expect(res.ok()).toBeTruthy()
  await page.goto('/settings/accounts')
  const logo = page.locator('img[src^="/static/banks/"]').first()
  await expect(logo).toBeVisible()
  // loading="lazy": wait until the image has actually been fetched and decoded.
  await expect
    .poll(() =>
      logo.evaluate((el) => {
        const img = el as unknown as { complete: boolean; naturalWidth: number }
        return img.complete && img.naturalWidth > 0
      }),
    )
    .toBe(true)
})
