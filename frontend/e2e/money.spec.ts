import { expect, test, type Page } from '@playwright/test'

/**
 * Home / Expenses / Income / quick add against the REAL backend, through a dev
 * server that proxies /api to it (default: the money group's Vite on :5181;
 * override with VBX_E2E_BASE). Each test registers a fresh user, who starts
 * with the default "Main" account and "General" / "Other" categories.
 */
test.use({ baseURL: process.env.VBX_E2E_BASE ?? 'http://127.0.0.1:5181' })

const PASSWORD = 'e2e-pass-123'

async function register(page: Page) {
  const username = `agent_money_e2e_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  await page.goto('/register')
  await page.getByLabel('Όνομα χρήστη').fill(username)
  await page.getByLabel('Κωδικός', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Επανάληψη κωδικού').fill(PASSWORD)
  await page.getByRole('button', { name: 'Δημιουργία λογαριασμού' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Αρχική' })).toBeVisible()
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768

async function typeAmount(page: Page, text: string) {
  if (isMobile(page)) {
    const pad = page.getByRole('group', { name: 'Πληκτρολόγιο ποσού' })
    for (const ch of text) {
      await pad.getByRole('button', { name: ch === ',' ? 'Υποδιαστολή' : ch, exact: true }).click()
    }
  } else {
    await page.getByLabel('Ποσό').fill(text)
  }
}

async function openQuickAdd(page: Page) {
  if (isMobile(page))
    await page.getByRole('navigation').getByRole('button', { name: 'Νέα καταχώριση' }).click()
  else await page.getByRole('button', { name: 'Νέο έξοδο' }).first().click()
}

test('quick add, edit, filter and delete an expense', async ({ page }) => {
  await register(page)

  await openQuickAdd(page)
  await expect(page.getByRole('radio', { name: 'Νέο έξοδο' })).toHaveAttribute('aria-checked', 'true')
  await typeAmount(page, '12,5')
  await page.getByRole('radio', { name: 'General' }).click()
  await page.getByLabel('Σημειώσεις').fill('καφές #e2eTag')
  await page.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(page.getByText('Καταχωρήθηκε: -12,50 € · General')).toBeVisible()

  // Home reflects it right away (month expenses + recent list).
  await expect(page.getByRole('list', { name: 'Πρόσφατα έξοδα' })).toContainText('καφές #e2eTag')

  await page.goto('/expenses')
  const row = page.getByRole('button', { name: /^καφές #e2eTag, -12,50 €/ })
  await expect(row).toBeVisible()

  // Edit
  await row.click({ position: { x: 24, y: 24 } })
  await page.getByRole('button', { name: 'Επεξεργασία' }).click()
  await expect(page.getByRole('heading', { name: 'Επεξεργασία εξόδου' })).toBeVisible()
  if (isMobile(page)) {
    const pad = page.getByRole('group', { name: 'Πληκτρολόγιο ποσού' })
    for (let i = 0; i < 4; i++) await pad.getByRole('button', { name: 'Σβήσιμο' }).click()
  }
  await typeAmount(page, '20')
  await page.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(page.getByRole('button', { name: /^καφές #e2eTag, -20,00 €/ })).toBeVisible()

  // Filters: another category is empty, "All months" keeps the row.
  await page.getByRole('radio', { name: 'Other' }).click()
  await expect(page.getByText('Κανένα έξοδο με αυτά τα φίλτρα')).toBeVisible()
  await page.getByRole('radio', { name: 'Όλες' }).click()
  await page.getByRole('button', { name: 'Όλοι οι μήνες' }).click()
  await expect(page).toHaveURL(/all=1/)
  await expect(page.getByRole('button', { name: /^καφές #e2eTag, -20,00 €/ })).toBeVisible()

  // Delete
  await page.getByRole('button', { name: /^καφές #e2eTag/ }).click({ position: { x: 24, y: 24 } })
  await page.getByRole('button', { name: 'Διαγραφή' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Διαγραφή' }).click()
  await expect(page.getByText('Κανένα έξοδο ακόμα')).toBeVisible()
})

test('income from the Home quick action, and a #tag link opens its report', async ({ page }) => {
  await register(page)

  await page.getByRole('group', { name: 'Γρήγορες ενέργειες' }).getByRole('button', { name: 'Έσοδο' }).click()
  await expect(page.getByRole('radio', { name: 'Νέο έσοδο' })).toHaveAttribute('aria-checked', 'true')
  await typeAmount(page, '1850')
  await page.getByRole('radio', { name: 'Salary' }).click()
  await page.getByLabel('Σημειώσεις').fill('μισθός #δουλειά')
  await page.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(page.getByText('Καταχωρήθηκε: +1.850,00 € · Salary')).toBeVisible()

  // Hero totals come from /api/home
  await expect(page.getByText('1.850,00 €').first()).toBeVisible()

  await page.goto('/income')
  await expect(page.getByRole('button', { name: /^μισθός #δουλειά, 1\.850,00 €/ })).toBeVisible()
  await page.getByRole('link', { name: '#δουλειά' }).click()
  await expect(page).toHaveURL(/\/reports\/tags\?tag=/)
})
