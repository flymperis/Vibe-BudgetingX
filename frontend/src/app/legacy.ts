/**
 * Links and home-screen bookmarks of the old app: `/?panel=<panel>&month=…`
 * with `settings_section`, `reports_section`, `investments_section`, `tag`,
 * `group`, `pay_card` and the list filters (old config.py ALLOWED_PANELS and
 * helpers.normalize_*_section). `legacyTarget` maps them to the new routes;
 * the root route's loader redirects there, so an old URL never lands on a
 * dead end. Unknown panels go to Home, like the old index did.
 */

const MONTH_RE = /^(\d{4})-(\d{1,2})$/

/** Old normalize_month / parse_optional_month: "2026-3" -> "2026-03", junk -> null. */
function normMonth(raw: string | null): string | null {
  const m = MONTH_RE.exec((raw ?? '').trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12) return null
  return `${y}-${String(mo).padStart(2, '0')}`
}

function monthFromParts(year: string | null, month: string | null): string | null {
  if (!year || !month) return null
  return normMonth(`${year.trim()}-${month.trim()}`)
}

const positiveInt = (raw: string | null) =>
  raw && /^\d+$/.test(raw.trim()) && Number(raw) > 0 ? raw.trim() : null
/** Old normalize_year: 2000..2100, anything else = the current year (left out). */
const yearParam = (raw: string | null) => {
  const text = (raw ?? '').trim()
  return /^\d{4}$/.test(text) && Number(text) >= 2000 && Number(text) <= 2100 ? text : null
}

/** Old normalize_settings_section -> new /settings/<page>. */
const SETTINGS: Record<string, string> = {
  general: 'general',
  banks: 'accounts',
  expenses: 'expense-categories',
  income: 'income-categories',
  export: 'export',
  migration: 'export',
  integrations: 'integrations',
}

const LEGACY_REPORTS: Record<string, string> = {
  bank: 'overview',
  crypto: 'investments',
  stocks: 'investments',
}

/** Old normalize_reports_section (same rules as GET /api/reports/section), incl. the legacy names. */
export function reportSection(raw: string | null): string {
  const s = (raw ?? '').trim().toLowerCase()
  if (['overview', 'spending', 'tags', 'investments'].includes(s)) return s
  return LEGACY_REPORTS[s] ?? 'overview'
}

/** Old normalize_investments_section. */
const investmentSection = (raw: string | null) =>
  (raw ?? '').trim().toLowerCase() === 'stocks' ? 'stocks' : 'crypto'

/** Screens whose content follows the selected month (the month is carried over). */
const MONTH_SCREENS = [
  '/',
  '/expenses',
  '/income',
  '/recurring',
  '/transfers',
  '/budget',
  '/summary',
  '/shared',
]

/**
 * New path + search for an old `/?panel=…` URL, or null when the URL is not
 * an old-app link (no `panel` parameter).
 */
export function legacyTarget(search: URLSearchParams): string | null {
  if (!search.has('panel')) return null
  const panel = (search.get('panel') ?? '').trim()
  const q = new URLSearchParams()
  const set = (name: string, value: string | null) => {
    if (value) q.set(name, value)
  }
  // The primary month: ?month=YYYY-MM or ?cal_year=&cal_month= (old resolve_month_filter_from_request).
  const month =
    normMonth(search.get('month')) ?? monthFromParts(search.get('cal_year'), search.get('cal_month'))

  let path: string
  switch (panel) {
    case 'expenses':
    case 'income': {
      path = `/${panel}`
      const pre = panel === 'expenses' ? 'exp' : 'inc'
      const listMonth =
        monthFromParts(search.get(`${pre}_cal_year`), search.get(`${pre}_cal_month`)) ??
        normMonth(search.get(`${pre}_month`))
      set('month', listMonth ?? month)
      set('category', positiveInt(search.get(`${pre}_category`)))
      break
    }
    case 'recurring':
    case 'summary':
    case 'budget':
      path = `/${panel}`
      break
    case 'transfer':
      path = '/transfers'
      set('pay_card', positiveInt(search.get('pay_card')))
      break
    case 'yearly':
      path = '/yearly'
      set('year', yearParam(search.get('year')))
      break
    case 'shared': {
      const group = positiveInt(search.get('group'))
      path = group ? `/shared/groups/${group}` : '/shared'
      break
    }
    case 'reports': {
      const tag = (search.get('tag') ?? '').trim()
      const section =
        search.has('reports_section') || !tag ? reportSection(search.get('reports_section')) : 'tags'
      path = `/reports/${section}`
      set('year', yearParam(search.get('report_year')))
      const account = (search.get('report_account') ?? '').trim()
      if (section === 'overview' && /^\d+$/.test(account)) set('account', account)
      if (section === 'tags') set('tag', tag || null)
      break
    }
    case 'investments':
      path = `/investments/${investmentSection(search.get('investments_section'))}`
      break
    case 'settings':
      path = `/settings/${SETTINGS[(search.get('settings_section') ?? '').trim().toLowerCase()] ?? 'general'}`
      break
    case 'export':
    case 'migration':
      path = '/settings/export'
      break
    default: // 'home' and anything unknown
      path = '/'
  }
  const isMonthScreen = MONTH_SCREENS.includes(path) || path.startsWith('/shared/')
  if (!q.has('month') && month && isMonthScreen) q.set('month', month)
  const text = q.toString()
  return text ? `${path}?${text}` : path
}
