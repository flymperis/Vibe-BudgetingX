/**
 * Shared expenses against the REAL backend (dev server proxying /api to :5001).
 * Two browser contexts = two registered users; one invites the other.
 */
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const PASSWORD = 'e2e-secret-pass-123'

async function register(request: APIRequestContext, username: string) {
  const session = await (await request.get('/api/auth/session')).json()
  const res = await request.post('/api/auth/register', {
    data: { username, password: PASSWORD, password2: PASSWORD },
    headers: { 'X-CSRF-Token': session.csrf_token },
  })
  expect(res.ok()).toBeTruthy()
}

async function newUser(
  browser: Browser,
  baseURL: string,
  username: string,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({ baseURL, viewport, locale: 'el-GR' })
  const page = await context.newPage()
  await register(page.request, username)
  return { context, page }
}

/** The open sheet (vaul drawer on mobile, dialog on desktop). */
const sheet = (page: Page) => page.getByRole('dialog').last()

async function confirmDestructive(page: Page, label: string) {
  await page.getByRole('alertdialog').getByRole('button', { name: label }).click()
}

test('two users: group, bills with every split, joining, recording, payments, cleanup', async ({
  browser,
  baseURL,
}, info) => {
  const viewport = info.project.use.viewport ?? { width: 390, height: 844 }
  const tag = `${info.project.name.slice(0, 1)}${Date.now().toString(36)}`
  const userA = `agent_shared_a_${tag}`
  const userB = `agent_shared_b_${tag}`
  const a = await newUser(browser, baseURL!, userA, viewport)
  const b = await newUser(browser, baseURL!, userB, viewport)
  const groupName = `Ταξίδι ${tag}`

  // --- A: people ------------------------------------------------------------
  await a.page.goto('/shared')
  await expect(a.page.getByRole('heading', { level: 1, name: 'Κοινά έξοδα' })).toBeVisible()
  await expect(a.page.getByText('Καμία ομάδα ακόμα')).toBeVisible()
  await a.page.getByLabel('Προσθήκη ατόμων').fill('Κώστας, Ελένη')
  await a.page.getByRole('button', { name: 'Προσθήκη', exact: true }).click()
  await expect(a.page.getByRole('button', { name: 'Επεξεργασία: Ελένη' })).toBeVisible()

  // rename + remove a contact
  await a.page.getByRole('button', { name: 'Επεξεργασία: Ελένη' }).click()
  await sheet(a.page).getByLabel('Όνομα').fill('Ελένη Π.')
  await sheet(a.page).getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(a.page.getByRole('button', { name: 'Επεξεργασία: Ελένη Π.' })).toBeVisible()
  await a.page.getByRole('button', { name: 'Επεξεργασία: Ελένη Π.' }).click()
  await sheet(a.page).getByRole('button', { name: 'Αφαίρεση ατόμου' }).click()
  await confirmDestructive(a.page, 'Αφαίρεση')
  await expect(a.page.getByRole('button', { name: 'Επεξεργασία: Ελένη Π.' })).toHaveCount(0)

  // --- A: new group inviting B ------------------------------------------------
  await a.page.locator('#main').getByRole('button', { name: 'Νέα ομάδα' }).first().click()
  const ng = sheet(a.page)
  await ng.getByLabel('Όνομα ομάδας').fill(groupName)
  await ng.getByRole('checkbox', { name: 'Κώστας' }).click()
  await ng.getByLabel('Πρόσκληση χρηστών του Vibe Budgeting').fill(userB)
  await ng.getByRole('button', { name: 'Δημιουργία ομάδας' }).click()
  await expect(a.page).toHaveURL(/\/shared\/groups\/\d+$/)
  await expect(a.page.getByRole('heading', { level: 1, name: groupName })).toBeVisible()
  await expect(a.page.getByText('σε αναμονή')).toBeVisible()

  // --- A: equal bill ----------------------------------------------------------
  await a.page.locator('#main').getByRole('button', { name: 'Νέο κοινό έξοδο' }).click()
  let form = sheet(a.page)
  await form.getByLabel('Ποσό').fill('90')
  await form.getByLabel('Περιγραφή').fill('Φαγητό #e2e')
  await expect(form.getByText(/Περίπου 30,00\s€ ο καθένας/)).toBeVisible()
  await form.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(form).toBeHidden()
  const bill = a.page.getByRole('button', { name: /Φαγητό #e2e/ })
  await expect(bill).toContainText('δάνεισες 60,00')
  await expect(a.page.getByText('Παίρνεις πίσω')).toBeVisible()

  // --- A: edit it to percentages, then exact amounts --------------------------
  await bill.click()
  await sheet(a.page).getByRole('button', { name: 'Επεξεργασία' }).click()
  form = sheet(a.page)
  await expect(form.getByRole('heading', { name: 'Επεξεργασία κοινού εξόδου' })).toBeVisible()
  await form.getByRole('radio', { name: 'Ποσοστά' }).click()
  await expect(form.getByRole('button', { name: 'Αποθήκευση' })).toBeDisabled()
  await form.getByRole('button', { name: 'Μοίρασε ίσα' }).click()
  await expect(form.getByText('Σύνολο 100%.')).toBeVisible()
  await form.getByRole('radio', { name: 'Ποσά' }).click()
  await form.getByLabel('Μερίδιο: Εσύ').fill('50')
  await expect(form.getByText(/Μένουν 40,00\s€/)).toBeVisible()
  await form.getByRole('button', { name: 'Βάλε το υπόλοιπο σε: Κώστας' }).click()
  await expect(form.getByText('Ταιριάζει με το σύνολο.')).toBeVisible()
  await form.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(form).toBeHidden()
  await expect(bill).toContainText('με ακριβή ποσά')
  await expect(bill).toContainText('δάνεισες 40,00')

  // --- B: accept the invitation -------------------------------------------------
  await b.page.goto('/shared')
  await expect(b.page.getByText(`σε προσκάλεσε στην ομάδα «${groupName}»`)).toBeVisible()
  await b.page.getByRole('button', { name: 'Συμμετοχή' }).click()
  await expect(b.page.getByRole('heading', { level: 1, name: groupName })).toBeVisible()

  // B adds a bill paid by B, split by shares between A and B
  await b.page.locator('#main').getByRole('button', { name: 'Νέο κοινό έξοδο' }).click()
  form = sheet(b.page)
  await form.getByLabel('Ποσό').fill('30')
  await form.getByLabel('Περιγραφή').fill('Βενζίνη')
  await form.getByRole('radio', { name: 'Μερίδια' }).click()
  await form.getByLabel('Μερίδιο: Εσύ').fill('2')
  await form.getByLabel(`Μερίδιο: ${userA}`).fill('1')
  await expect(form.getByText('3 μερίδια συνολικά')).toBeVisible()
  await form.getByRole('button', { name: 'Αποθήκευση' }).click()
  await expect(form).toBeHidden()

  // --- A: sees B's bill, records own share, settles with the suggestion ------------
  await a.page.reload()
  const fuel = a.page.getByRole('button', { name: /Βενζίνη/ })
  await expect(fuel).toContainText('δανείστηκες 10,00')
  await expect(fuel).toContainText('Όχι στο budget σου ακόμα')
  await fuel.click()
  await sheet(a.page).getByRole('button', { name: 'Προσθήκη στο budget μου' }).click()
  await expect(sheet(a.page).getByText('Στο budget σου')).toBeVisible()
  await sheet(a.page).getByRole('button', { name: 'Αφαίρεση από το budget μου' }).click()
  await expect(sheet(a.page).getByText('Όχι στο budget σου ακόμα')).toBeVisible()
  await a.page.keyboard.press('Escape')
  await expect(a.page.getByRole('dialog')).toHaveCount(0)

  // Kostas owes A: record that suggested payment
  await a.page.getByRole('button', { name: 'Καταχώριση: Κώστας → Εσύ' }).click()
  form = sheet(a.page)
  await expect(form.getByLabel('Ποσό')).toHaveValue('30')
  await expect(form.getByText('Μπήκε στον λογαριασμό')).toBeVisible()
  await form.getByRole('button', { name: 'Καταχώριση πληρωμής' }).click()
  await expect(form).toBeHidden()
  const payment = a.page.getByRole('button', { name: /Κώστας → Εσύ/ })
  await expect(payment).toContainText('Στους λογαριασμούς σου')

  // B sees the payment between two others (not involved)
  await b.page.reload()
  await expect(b.page.getByRole('button', { name: new RegExp(`Κώστας → ${userA}`) })).toBeVisible()

  // --- A: payment un-record and delete; bill delete --------------------------------
  await payment.click()
  await sheet(a.page).getByRole('button', { name: 'Αφαίρεση από τους λογαριασμούς μου' }).click()
  await expect(sheet(a.page).getByText('Όχι στους λογαριασμούς σου ακόμα')).toBeVisible()
  await sheet(a.page).getByRole('button', { name: 'Διαγραφή πληρωμής' }).click()
  await confirmDestructive(a.page, 'Διαγραφή')
  await expect(payment).toHaveCount(0)

  await bill.click()
  await sheet(a.page).getByRole('button', { name: 'Διαγραφή' }).click()
  await confirmDestructive(a.page, 'Διαγραφή')
  await expect(bill).toHaveCount(0)

  // --- settings: rename, members, delete ----------------------------------------
  await a.page.getByRole('button', { name: 'Ρυθμίσεις ομάδας' }).click()
  const settings = sheet(a.page)
  await settings.getByLabel('Όνομα ομάδας').fill(`${groupName}!`)
  await settings.getByRole('button', { name: 'Μετονομασία' }).click()
  await expect(a.page.getByText('Μετονομάστηκε')).toBeVisible()
  await expect(a.page.locator('h1')).toHaveText(`${groupName}!`)
  await settings.getByLabel('Άτομα χωρίς λογαριασμό').fill('Γιαγιά')
  await settings.getByRole('button', { name: 'Προσθήκη', exact: true }).click()
  await expect(settings.getByRole('button', { name: 'Αφαίρεση: Γιαγιά' })).toBeVisible()
  await settings.getByRole('button', { name: 'Αφαίρεση: Γιαγιά' }).click()
  await confirmDestructive(a.page, 'Αφαίρεση')
  await expect(settings.getByRole('button', { name: 'Αφαίρεση: Γιαγιά' })).toHaveCount(0)

  // B is not the creator: no delete button for B
  await b.page.reload()
  await b.page.getByRole('button', { name: 'Ρυθμίσεις ομάδας' }).click()
  await expect(sheet(b.page).getByRole('button', { name: 'Διαγραφή ομάδας' })).toHaveCount(0)
  await b.page.keyboard.press('Escape')

  await settings.getByRole('button', { name: 'Διαγραφή ομάδας' }).click()
  await confirmDestructive(a.page, 'Διαγραφή')
  await expect(a.page).toHaveURL(/\/shared$/)
  await expect(a.page.getByText('Καμία ομάδα ακόμα')).toBeVisible()

  await a.context.close()
  await b.context.close()
})
