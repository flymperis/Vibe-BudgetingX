#!/usr/bin/env node
/**
 * Rich demo data through the public API (no direct database access), for
 * looking at every screen with realistic content and for manual review:
 *
 *   node e2e/seed/seed.mjs [baseURL] [username]
 *   VBX_E2E_BASE=http://127.0.0.1:5002 node e2e/seed/seed.mjs
 *
 * Creates (or reuses, if the user exists) `<username>` (default "demo") and a
 * friend `<username>_friend`, both with the password below (synthetic test
 * values, never use them anywhere real), then adds:
 *  - Greek expense / income categories, five accounts incl. a credit card with
 *    statement and due days and a credit limit;
 *  - 18 months of expenses (many with #tags) and income, refunds, transfers,
 *    card payments;
 *  - recurring rules of every interval unit (weekly, monthly, every 3 months,
 *    yearly), one with a run count, one paused;
 *  - budgets with defaults, a fixed one, "everything else" and month overrides;
 *  - a shared group with the friend (who joins) and one bill per split method
 *    (equal, exact, percent, shares), a recorded share and a settlement;
 *  - crypto and stock transactions.
 * Only run it against a throwaway database (dev / e2e servers).
 */
export const SEED_PASSWORD = 'seed-demo-pass-2026'

const base = (process.argv[2] ?? process.env.VBX_E2E_BASE ?? 'http://127.0.0.1:5001').replace(/\/$/, '')
const username = process.argv[3] ?? process.env.VBX_SEED_USER ?? 'demo'

/** Minimal API client with its own cookie jar and CSRF token. */
function client() {
  let cookie = ''
  let csrf = ''
  async function call(method, path, body) {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(method !== 'GET' ? { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) {
      const err = new Error(`${method} ${path}: ${res.status} ${text}`)
      err.status = res.status
      throw err
    }
    if (data && typeof data.csrf_token === 'string') csrf = data.csrf_token
    return data
  }
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    put: (p, b) => call('PUT', p, b ?? {}),
    async login(user) {
      await call('GET', '/auth/session')
      try {
        await call('POST', '/auth/register', {
          username: user,
          password: SEED_PASSWORD,
          password2: SEED_PASSWORD,
        })
        return true
      } catch (e) {
        if (e.status !== 400 && e.status !== 403) throw e
        await call('POST', '/auth/login', { username: user, password: SEED_PASSWORD })
        return false
      }
    },
  }
}

// Deterministic pseudo-random numbers, so every seed looks the same.
let state = 20261111
const rand = () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
const pick = (xs) => xs[Math.floor(rand() * xs.length)]
const between = (lo, hi) => Math.round((lo + rand() * (hi - lo)) * 100) / 100
const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const EXPENSE_CATS = {
  'Σούπερ μάρκετ': [25, 140, ['Σκλαβενίτης', 'Lidl', 'ΑΒ Βασιλόπουλος', 'Μασούτης', 'λαϊκή']],
  Καφές: [2.5, 6, ['freddo espresso', 'cappuccino', 'καφές με τον Νίκο', 'καφές γραφείο']],
  Εστιατόρια: [18, 85, ['σουβλάκια', 'efood', 'ταβέρνα', 'sushi', 'πίτσα']],
  Μεταφορικά: [1.2, 25, ['ΟΑΣΑ', 'ταξί', 'Beat', 'εισιτήριο μετρό']],
  Βενζίνη: [40, 75, ['Shell', 'ΕΚΟ', 'BP']],
  'ΔΕΚΟ (ρεύμα, νερό)': [35, 120, ['ΔΕΗ', 'ΕΥΔΑΠ', 'Cosmote', 'φυσικό αέριο']],
  Υγεία: [15, 90, ['φαρμακείο', 'οδοντίατρος', 'εξετάσεις']],
  Ψυχαγωγία: [8, 60, ['σινεμά', 'θέατρο', 'συναυλία', 'μπόουλινγκ']],
  'Ρούχα & παπούτσια': [20, 140, ['Zara', 'παπούτσια', 'H&M', 'μπουφάν']],
  Δώρα: [15, 80, ['δώρο γενεθλίων', 'λουλούδια', 'δώρο γάμου']],
  'Σπίτι & κατοικίδια': [8, 70, ['IKEA', 'τροφή σκύλου', 'κτηνίατρος', 'καθαριστικά']],
}
const INCOME_CATS = ['Μισθός', 'Bonus', 'Ενοίκια', 'Επιστροφή φόρου']
const TAGS = ['#διακοπές2026', '#Λονδίνο2025', '#γάμος_Μαρίας', '#σπίτι', '#δουλειά']

async function main() {
  const me = client()
  const fresh = await me.login(username)
  let boot = await me.get('/bootstrap')
  if (!fresh && boot.accounts.length > 3) {
    console.log(`seed: ${username} already has data at ${base}; nothing to do`)
    return
  }
  const today = boot.today
  const [ty, tm] = today.split('-').map(Number)

  // ---- reference data ---------------------------------------------------------
  for (const name of Object.keys(EXPENSE_CATS)) await me.post('/categories', { name })
  for (const name of INCOME_CATS) await me.post('/income-categories', { name })
  const accounts = [
    { name: 'Eurobank Μισθοδοσία', account_type: 'bank', opening_balance: 2400 },
    { name: 'Πειραιώς Ταμιευτήριο', account_type: 'bank', opening_balance: 5200 },
    { name: 'Μετρητά', account_type: 'bank', opening_balance: 150 },
    { name: 'Revolut', account_type: 'bank', opening_balance: 300 },
    {
      name: 'Alpha Bank Visa',
      account_type: 'credit',
      opening_balance: 350,
      credit_limit: 2500,
      statement_day: 5,
      due_day: 25,
    },
  ]
  for (const a of accounts) await me.post('/accounts', a)
  boot = await me.get('/bootstrap')
  const cat = (n) => boot.categories.find((c) => c.name === n).id
  const icat = (n) => boot.income_categories.find((c) => c.name === n).id
  const acc = (n) => boot.accounts.find((a) => a.name === n).id
  const spendAccounts = [
    'Eurobank Μισθοδοσία',
    'Eurobank Μισθοδοσία',
    'Eurobank Μισθοδοσία',
    'Alpha Bank Visa',
    'Μετρητά',
    'Revolut',
  ]

  // ---- 18 months of movements -----------------------------------------------------
  let count = 0
  for (let back = 17; back >= 0; back--) {
    const first = new Date(ty, tm - 1 - back, 1)
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const lastDay = back === 0 ? Number(today.slice(8, 10)) : days
    const day = (d) => iso(new Date(first.getFullYear(), first.getMonth(), Math.min(d, lastDay)))
    // salary + occasional extra income
    await me.post('/income', {
      amount: 1850,
      category_id: icat('Μισθός'),
      account_id: acc('Eurobank Μισθοδοσία'),
      received_at: day(1),
      notes: 'Μισθός',
    })
    if (first.getMonth() === 11 || first.getMonth() === 3)
      await me.post('/income', {
        amount: between(400, 900),
        category_id: icat('Bonus'),
        account_id: acc('Eurobank Μισθοδοσία'),
        received_at: day(20),
        notes: 'δώρο #δουλειά',
      })
    if (back % 3 === 0)
      await me.post('/income', {
        amount: 450,
        category_id: icat('Ενοίκια'),
        account_id: acc('Πειραιώς Ταμιευτήριο'),
        received_at: day(5),
        notes: 'ενοίκιο διαμερίσματος',
      })
    // expenses
    const n = 22 + Math.floor(rand() * 14)
    for (let i = 0; i < n; i++) {
      const name = pick(Object.keys(EXPENSE_CATS))
      const [lo, hi, notes] = EXPENSE_CATS[name]
      let note = pick(notes)
      if (rand() < 0.18) note += ` ${pick(TAGS)}`
      await me.post('/expenses', {
        amount: -between(lo, hi),
        category_id: cat(name),
        account_id: acc(pick(spendAccounts)),
        spent_at: day(1 + Math.floor(rand() * lastDay)),
        notes: rand() < 0.1 ? '' : note,
      })
      count++
    }
    if (rand() < 0.4)
      await me.post('/expenses', {
        amount: between(10, 40),
        category_id: cat('Ρούχα & παπούτσια'),
        account_id: acc('Alpha Bank Visa'),
        spent_at: day(18),
        notes: 'επιστροφή Zara',
      })
    // transfers: savings and the card payment
    await me.post('/transfers', {
      from_account_id: acc('Eurobank Μισθοδοσία'),
      to_account_id: acc('Πειραιώς Ταμιευτήριο'),
      amount: 300,
      transferred_at: day(2),
      notes: 'αποταμίευση',
    })
    if (back > 0)
      await me.post('/transfers', {
        from_account_id: acc('Eurobank Μισθοδοσία'),
        to_account_id: acc('Alpha Bank Visa'),
        amount: between(250, 600),
        transferred_at: day(24),
        notes: 'πληρωμή κάρτας',
      })
    if (back % 2 === 0)
      await me.post('/transfers', {
        from_account_id: acc('Eurobank Μισθοδοσία'),
        to_account_id: acc('Revolut'),
        amount: 100,
        transferred_at: day(10),
        notes: '',
      })
  }

  // ---- recurring rules of each interval ---------------------------------------------
  const ym = (back) => {
    const d = new Date(ty, tm - 1 - back, 1)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  }
  const startNext = (back, d) => `${ym(back)}-${pad(d)}`
  const rules = [
    {
      category_choice: `e-${cat('ΔΕΚΟ (ρεύμα, νερό)')}`,
      amount: 10.99,
      account_id: acc('Alpha Bank Visa'),
      interval_unit: 'month',
      interval_count: 1,
      start_date: startNext(-1, 15),
      indefinitely: true,
      notes: 'Spotify',
      enabled: true,
    },
    {
      category_choice: `e-${cat('Σπίτι & κατοικίδια')}`,
      amount: 520,
      account_id: acc('Eurobank Μισθοδοσία'),
      interval_unit: 'month',
      interval_count: 1,
      start_date: startNext(-1, 1),
      indefinitely: true,
      notes: 'Ενοίκιο #σπίτι',
      enabled: true,
    },
    {
      category_choice: `e-${cat('Καφές')}`,
      amount: 12,
      account_id: acc('Μετρητά'),
      interval_unit: 'week',
      interval_count: 2,
      start_date: iso(new Date(ty, tm, 3)),
      indefinitely: true,
      notes: 'καφέδες γραφείου',
      enabled: true,
    },
    {
      category_choice: `e-${cat('Υγεία')}`,
      amount: 180,
      account_id: acc('Eurobank Μισθοδοσία'),
      interval_unit: 'month',
      interval_count: 3,
      start_date: startNext(-2, 10),
      indefinitely: false,
      months_to_run: 4,
      notes: 'φυσικοθεραπεία',
      enabled: true,
    },
    {
      category_choice: `e-${cat('Μεταφορικά')}`,
      amount: 285,
      account_id: acc('Eurobank Μισθοδοσία'),
      interval_unit: 'year',
      interval_count: 1,
      start_date: `${ty + 1}-03-01`,
      indefinitely: true,
      notes: 'ασφάλεια αυτοκινήτου',
      enabled: true,
    },
    {
      category_choice: `i-${icat('Ενοίκια')}`,
      amount: 450,
      account_id: acc('Πειραιώς Ταμιευτήριο'),
      interval_unit: 'month',
      interval_count: 1,
      start_date: startNext(-1, 5),
      indefinitely: true,
      notes: 'ενοίκιο διαμερίσματος',
      enabled: true,
    },
    {
      category_choice: `e-${cat('Ψυχαγωγία')}`,
      amount: 13.99,
      account_id: acc('Revolut'),
      interval_unit: 'month',
      interval_count: 1,
      start_date: startNext(-1, 20),
      indefinitely: true,
      notes: 'Netflix',
      enabled: false,
    },
  ]
  for (const r of rules) {
    const saved = await me.post('/recurring', r)
    // A new rule always starts active (old behaviour); pause it with an edit.
    if (!r.enabled) await me.put(`/recurring/${saved.rule?.id ?? saved.id}`, r)
  }

  // ---- budgets ----------------------------------------------------------------------
  await me.post('/budget/toggle', { enabled: true })
  const defaults = {
    'Σούπερ μάρκετ': 450,
    Καφές: 60,
    Εστιατόρια: 180,
    Βενζίνη: 140,
    'ΔΕΚΟ (ρεύμα, νερό)': 200,
    Ψυχαγωγία: 80,
  }
  await me.post('/budget/defaults', {
    amounts: Object.fromEntries(Object.entries(defaults).map(([n, v]) => [String(cat(n)), v])),
    fixed: { [String(cat('ΔΕΚΟ (ρεύμα, νερό)'))]: true },
    other_amount: 250,
  })
  await me.post('/budget/override', {
    month: ym(0),
    category_id: cat('Εστιατόρια'),
    amount: 260,
    clear: false,
  })
  await me.post('/budget/override', {
    month: ym(1),
    category_id: cat('Σούπερ μάρκετ'),
    amount: 520,
    clear: false,
  })
  await me.post('/budget/override', { month: ym(0), category_id: cat('Δώρα'), amount: 120, clear: false })

  // ---- shared: a group with the friend ----------------------------------------------
  const friendName = `${username}_friend`
  const friend = client()
  await friend.login(friendName)
  await me.post('/shared/people', { name: 'Κώστας, Ελένη' })
  const created = await me.post('/shared/groups', {
    name: 'Κρήτη 2026',
    usernames: friendName,
    new_members: 'Γιώργος',
  })
  const groupId = created.group_id
  const overview = await friend.get('/shared')
  const invite = overview.invitations.find((i) => i.id === groupId)
  if (invite) await friend.post(`/shared/groups/${groupId}/accept`)
  let group = await me.get(`/shared/groups/${groupId}`)
  const ids = group.members.map((m) => m.id)
  const meId = group.me_id
  const other = ids.filter((i) => i !== meId)
  const day = (d) => iso(new Date(ty, tm - 1, Math.min(d, Number(today.slice(8, 10)))))
  const bills = [
    {
      description: 'Σούπερ μάρκετ #διακοπές2026',
      amount: 96,
      paid_by: meId,
      split_method: 'equal',
      included: ids,
      values: {},
    },
    {
      description: 'Ταβέρνα στα Χανιά',
      amount: 120,
      paid_by: other[0],
      split_method: 'exact',
      included: ids,
      values: Object.fromEntries(
        ids.map((id, i) => [String(id), i === 0 ? '50' : String(70 / (ids.length - 1))]),
      ),
    },
    {
      description: 'Ενοικίαση αυτοκινήτου',
      amount: 210,
      paid_by: meId,
      split_method: 'percent',
      included: ids,
      values: Object.fromEntries(
        ids.map((id, i) => [String(id), i === 0 ? '40' : String(60 / (ids.length - 1))]),
      ),
    },
    {
      description: 'Βίλα (4 βράδια)',
      amount: 640,
      paid_by: other[0],
      split_method: 'shares',
      included: ids,
      values: Object.fromEntries(ids.map((id, i) => [String(id), i === 0 ? '2' : '1'])),
    },
  ]
  for (const [i, b] of bills.entries()) {
    const iPaid = b.paid_by === meId
    await me.post(`/shared/groups/${groupId}/expenses`, {
      ...b,
      spent_on: day(2 + i),
      record_personal: i !== 3,
      category_id: cat('Εστιατόρια'),
      account_id: iPaid ? acc('Alpha Bank Visa') : null,
    })
  }
  group = await me.get(`/shared/groups/${groupId}`)
  const sugg = group.suggestions[0]
  if (sugg)
    await me.post(`/shared/groups/${groupId}/settlements`, {
      from_person_id: sugg.from_id,
      to_person_id: sugg.to_id,
      amount: Math.min(sugg.amount, 50),
      paid_on: day(6),
      notes: 'IRIS',
      record_personal: false,
    })

  // ---- investments ---------------------------------------------------------------
  const crypto = [
    ['bitcoin', 'BTC', 'Bitcoin', 'buy', 0.015, 38000, 2.5, 'Binance', 16],
    ['bitcoin', 'BTC', 'Bitcoin', 'buy', 0.01, 52000, 2, 'Binance', 9],
    ['ethereum', 'ETH', 'Ethereum', 'buy', 0.6, 2100, 1.5, 'Kraken', 12],
    ['ethereum', 'ETH', 'Ethereum', 'sell', 0.2, 3100, 1, 'Kraken', 3],
    ['solana', 'SOL', 'Solana', 'buy', 5, 95, 0.5, 'Binance', 6],
  ]
  for (const [
    coin_id,
    coin_symbol,
    coin_name,
    tx_type,
    quantity,
    price_per_unit,
    fee,
    exchange,
    back,
  ] of crypto)
    await me.post('/investments/crypto', {
      coin_id,
      coin_symbol,
      coin_name,
      tx_type,
      quantity,
      price_per_unit,
      fee,
      exchange,
      transacted_at: `${ym(back)}-10`,
      notes: '',
    })
  const stocks = [
    ['VUAA.EU', 'VUAA', 'Vanguard S&P 500 UCITS ETF', 'buy', 10, 98.5, 2, 15],
    ['VUAA.EU', 'VUAA', 'Vanguard S&P 500 UCITS ETF', 'buy', 5, 112, 2, 6],
    ['AAPL.US', 'AAPL', 'Apple Inc.', 'buy', 3, 189, 1, 10],
    ['AAPL.US', 'AAPL', 'Apple Inc.', 'sell', 1, 228, 1, 2],
  ]
  for (const [symbol, ticker, instrument_name, tx_type, quantity, price_per_unit, fee, back] of stocks)
    await me.post('/investments/stocks', {
      symbol,
      ticker,
      instrument_name,
      tx_type,
      quantity,
      price_per_unit,
      fee,
      broker: 'Freedom24',
      transacted_at: `${ym(back)}-12`,
      notes: '',
    })

  console.log(
    `seed: ${username} (+ ${friendName}) at ${base}: ${count} expenses over 18 months, ${rules.length} rules, group ${groupId}`,
  )
}

main().catch((e) => {
  console.error(`seed failed: ${e.message}`)
  process.exit(1)
})
