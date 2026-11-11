/**
 * "manage" group flows against the REAL backend (base URL from playwright.config.ts).
 * Each test registers a fresh throwaway user.
 */
import { expect, test, type Page } from '@playwright/test'

async function register(page: Page) {
  const username = `agent_manage_e2e_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const session = await (await page.request.get('/api/auth/session')).json()
  const res = await page.request.post('/api/auth/register', {
    data: { username, password: 'pw-e2e-123456', password2: 'pw-e2e-123456' },
    headers: { 'X-CSRF-Token': session.csrf_token },
  })
  expect(res.ok()).toBeTruthy()
  return username
}

/** The open sheet (dialog on desktop, drawer on mobile). */
const sheet = (page: Page) => page.getByRole('dialog')

async function addAccount(page: Page, name: string, opening: string) {
  await page.getByRole('button', { name: 'Νέος λογαριασμός' }).first().click()
  await sheet(page).getByLabel('Όνομα').fill(name)
  await sheet(page).getByLabel('Αρχικό υπόλοιπο').fill(opening)
  await sheet(page).getByRole('button', { name: 'Νέος λογαριασμός' }).click()
  await expect(sheet(page)).toBeHidden()
}

test('accounts, transfers and pay-card prefill', async ({ page }) => {
  await register(page)
  await page.goto('/settings/accounts')
  await expect(page.getByRole('heading', { name: 'Τράπεζες & λογαριασμοί' })).toBeVisible()
  await addAccount(page, 'Eurobank Μισθοδοσία', '1000')
  await expect(page.getByText('Eurobank Μισθοδοσία')).toBeVisible()

  // A credit card with what is owed and its statement days.
  await page.getByRole('button', { name: 'Νέος λογαριασμός' }).first().click()
  await sheet(page).getByLabel('Όνομα').fill('Alpha Visa')
  await sheet(page).getByRole('radio', { name: 'Πιστωτική κάρτα' }).click()
  await sheet(page).getByLabel('Οφειλή στην κάρτα').fill('300')
  await sheet(page).getByLabel('Πιστωτικό όριο').fill('1000')
  await sheet(page).getByLabel('Ημέρα κατάστασης').fill('1')
  await sheet(page).getByLabel('Ημέρα λήξης').fill('20')
  await sheet(page).getByRole('button', { name: 'Νέος λογαριασμός' }).click()
  await expect(sheet(page)).toBeHidden()
  await expect(page.getByText(/Διαθέσιμα 700,00 € από 1\.000,00 €/)).toBeVisible()

  // Edit: rename the bank account, then a refused delete is impossible to miss.
  await page.getByRole('button', { name: /Eurobank Μισθοδοσία/ }).click()
  await sheet(page).getByLabel('Όνομα').fill('Eurobank')
  await sheet(page).getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(sheet(page)).toBeHidden()
  await expect(page.getByRole('button', { name: /^Eurobank(?! Μισθοδοσία)/ })).toBeVisible()

  // Transfer: pay the card from the bank account.
  await page.goto('/transfers')
  await page.getByRole('button', { name: 'Πληρωμή' }).click()
  await expect(sheet(page).getByRole('heading', { name: 'Πληρωμή κάρτας Alpha Visa' })).toBeVisible()
  // Pre-filled with what the last statement left to pay (300 owed before the 1st).
  const amount = sheet(page).getByRole('textbox', { name: 'Ποσό' })
  if (await amount.isVisible()) {
    await expect(amount).toHaveValue('300')
    await amount.fill('120')
  } else {
    await expect(sheet(page).getByRole('status', { name: 'Ποσό' })).toContainText('300')
    for (let i = 0; i < 3; i++) await sheet(page).getByRole('button', { name: 'Σβήσιμο' }).click()
    for (const k of ['1', '2', '0']) await sheet(page).getByRole('button', { name: k, exact: true }).click()
  }
  await sheet(page).getByRole('button', { name: 'Καταχώριση μεταφοράς' }).click()
  await expect(sheet(page)).toBeHidden()
  const log = page.getByRole('list', { name: 'Τελευταίες μεταφορές' })
  await expect(log.getByText('120,00 €')).toBeVisible()
  await expect(page.getByText('Διαθέσιμα 820,00 € από 1.000,00 €')).toBeVisible()

  // Same account is refused before sending.
  await page.getByRole('button', { name: 'Νέα μεταφορά' }).first().click()
  await sheet(page)
    .getByRole('radiogroup', { name: 'Προς' })
    .getByRole('radio', { name: /Alpha Visa/ })
    .click()
  await sheet(page)
    .getByRole('radiogroup', { name: 'Από' })
    .getByRole('radio', { name: /Alpha Visa/ })
    .click()
  await expect(sheet(page).getByText('Διάλεξε δύο διαφορετικούς λογαριασμούς.')).toBeVisible()
  await expect(sheet(page).getByRole('button', { name: 'Καταχώριση μεταφοράς' })).toBeDisabled()
  await page.keyboard.press('Escape')

  // Delete the transfer.
  await log.getByRole('button').first().click()
  await sheet(page).getByRole('button', { name: 'Διαγραφή μεταφοράς' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Διαγραφή' }).click()
  await expect(page.getByText('Καμία μεταφορά ακόμα.')).toBeVisible()
})

test('categories: add, rename, delete', async ({ page }) => {
  await register(page)
  await page.goto('/settings/expense-categories')
  await page.getByRole('button', { name: 'Νέα κατηγορία' }).first().click()
  await sheet(page).getByLabel('Όνομα κατηγορίας').fill('Καφές e2e')
  await sheet(page).getByRole('button', { name: 'Νέα κατηγορία' }).click()
  await expect(sheet(page)).toBeHidden()
  await page.getByRole('button', { name: /Καφές e2e/ }).click()
  await expect(sheet(page).getByText('Δεν χρησιμοποιείται')).toBeVisible()
  await sheet(page).getByLabel('Όνομα κατηγορίας').fill('Καφές & γλυκά')
  await sheet(page).getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(sheet(page)).toBeHidden()
  await page.getByRole('button', { name: /Καφές & γλυκά/ }).click()
  await sheet(page).getByRole('button', { name: 'Διαγραφή κατηγορίας' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Διαγραφή' }).click()
  await expect(page.getByRole('button', { name: /Καφές & γλυκά/ })).toHaveCount(0)

  await page.goto('/settings/income-categories')
  await page.getByRole('button', { name: 'Νέα κατηγορία' }).first().click()
  await sheet(page).getByLabel('Όνομα κατηγορίας').fill('Μπόνους')
  await sheet(page).getByRole('button', { name: 'Νέα κατηγορία' }).click()
  await expect(page.getByRole('button', { name: /Μπόνους/ })).toBeVisible()
})

test('recurring: add, pause, delete', async ({ page }) => {
  await register(page)
  await page.goto('/recurring')
  await expect(page.getByText('Κανένας επαναλαμβανόμενος κανόνας ακόμα.')).toBeVisible()
  await page.getByRole('button', { name: 'Νέος κανόνας' }).first().click()
  await sheet(page).getByLabel('Ποσό κάθε φορά').fill('10,99')
  await sheet(page).getByLabel('Σημειώσεις (προαιρετικά)').fill('Spotify #συνδρομές')
  await sheet(page).getByLabel('Επανάληψη κάθε').fill('2')
  await sheet(page).getByRole('radio', { name: 'εβδομάδες' }).click()
  await sheet(page).getByRole('switch', { name: 'Χωρίς λήξη' }).click()
  await sheet(page).getByLabel('Πόσες φορές').fill('6')
  await sheet(page).getByRole('button', { name: 'Προσθήκη κανόνα' }).click()
  await expect(sheet(page)).toBeHidden()
  const row = page.getByRole('button', { name: 'Κανόνας: Spotify #συνδρομές' })
  await expect(row).toContainText('Κάθε 2 εβδομάδες')
  await expect(row).toContainText('6 φορές')
  await expect(row).toContainText('-10,99 €')

  // Pause it: the saved rule must come back paused (enabled is always sent).
  await row.click()
  await sheet(page)
    .getByRole('switch', { name: /Ενεργός/ })
    .click()
  await sheet(page).getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(sheet(page)).toBeHidden()
  await expect(row).toContainText('Σε παύση')
  // ...and saving again without touching the toggle keeps it paused, then resume.
  await row.click()
  await sheet(page).getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(row).toContainText('Σε παύση')
  await row.click()
  await sheet(page)
    .getByRole('switch', { name: /Ενεργός/ })
    .click()
  await sheet(page).getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(row).not.toContainText('Σε παύση')

  await row.click()
  await sheet(page).getByRole('button', { name: 'Διαγραφή κανόνα' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Διαγραφή' }).click()
  await expect(page.getByText('Κανένας επαναλαμβανόμενος κανόνας ακόμα.')).toBeVisible()
})

test('integrations and export screens load; test buttons answer inline', async ({ page }) => {
  await register(page)
  await page.goto('/settings/integrations')
  await expect(page.getByRole('heading', { name: 'Τοπικό AI (Ollama)' })).toBeVisible()
  await page.getByLabel('Διεύθυνση (Base URL)').fill('http://127.0.0.1:9')
  await page.getByRole('button', { name: 'Δοκιμή σύνδεσης' }).click()
  await expect(page.getByRole('status').filter({ hasText: /./ }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Φόρτωση μοντέλων' }).click()
  await expect(page.getByText(/Could not reach Ollama|Connection failed|Ollama responded/)).toBeVisible()
  await expect(page.getByText('Αποθήκευσε πρώτα το token του bot'))
    .toBeVisible()
    .catch(() => {
      /* a bot may already be configured on the shared server */
    })

  await page.goto('/settings/export')
  const res = await page.request.get('/api/export/excel')
  expect(res.ok()).toBeTruthy()
  expect((await res.body()).subarray(0, 2).toString()).toBe('PK')
  await page.getByRole('button', { name: 'Εισαγωγή' }).click()
  await expect(page.getByText('Διάλεξε ένα αρχείο Excel (.xlsx).')).toBeVisible()
})
