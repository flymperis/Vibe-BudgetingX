/**
 * Date helpers. Dates travel as "YYYY-MM-DD" strings and months as "YYYY-MM",
 * exactly like the API. Never parse them with `new Date("2026-11-10")` (that
 * is UTC midnight and shows the wrong day west of Greenwich); use parseISODate.
 *
 * The server's "today" (from /api/bootstrap) is the authority for defaults in
 * forms; todayISO() is the device's local day, for display and fallbacks.
 */
import { LOCALES, translate, type Lang } from '@/i18n'

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Today in the device's local time zone, "YYYY-MM-DD". */
export function todayISO(now: Date = new Date()): string {
  return toISODate(now)
}

/** "YYYY-MM-DD" (or a longer "YYYY-MM-DD HH:MM:SS") -> local Date at midnight, or null. */
export function parseISODate(iso: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.getMonth() === Number(m[2]) - 1 ? d : null
}

/** Whole days from `iso` to `todayIso` (positive = in the past). */
export function daysAgo(iso: string, todayIso: string = todayISO()): number | null {
  const a = parseISODate(iso)
  const b = parseISODate(todayIso)
  if (!a || !b) return null
  // Round to absorb DST hour shifts.
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso)
  if (!d) return iso
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

const capitalize = (s: string, locale: string) => (s ? s.charAt(0).toLocaleUpperCase(locale) + s.slice(1) : s)

/** "Τρίτη" / "Tuesday" */
export function weekdayName(iso: string, lang: Lang): string {
  const d = parseISODate(iso)
  if (!d) return iso
  const locale = LOCALES[lang]
  return capitalize(new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d), locale)
}

/** "10 Νοεμβρίου 2026"; the year is left out when it is the current one. */
export function fullDateLabel(iso: string, lang: Lang, todayIso: string = todayISO()): string {
  const d = parseISODate(iso)
  if (!d) return iso
  const sameYear = iso.slice(0, 4) === todayIso.slice(0, 4)
  return new Intl.DateTimeFormat(LOCALES[lang], {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(d)
}

/**
 * Label for a day heading in lists: Σήμερα, Χθες, the weekday for the last
 * week, otherwise the full date.
 */
export function relativeDayLabel(iso: string, lang: Lang, todayIso: string = todayISO()): string {
  const diff = daysAgo(iso, todayIso)
  if (diff === null) return iso
  if (diff === 0) return translate('date.today', undefined, lang)
  if (diff === 1) return translate('date.yesterday', undefined, lang)
  if (diff > 1 && diff < 7) return weekdayName(iso, lang)
  return fullDateLabel(iso, lang, todayIso)
}

/** "10/11/2026" */
export function shortDateLabel(iso: string, lang: Lang): string {
  const d = parseISODate(iso)
  if (!d) return iso
  return new Intl.DateTimeFormat(LOCALES[lang], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

// ---- months ---------------------------------------------------------------

export const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isValidMonth(value: string | null | undefined): value is string {
  return !!value && MONTH_RE.test(value)
}

export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
}

export function addMonths(month: string, delta: number): string {
  const m = MONTH_RE.exec(month)
  if (!m) return month
  const index = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

export function monthFromParts(year: number, monthIndex0: number): string {
  return `${year}-${pad(monthIndex0 + 1)}`
}

function monthDate(month: string): Date | null {
  const m = MONTH_RE.exec(month)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : null
}

/** "Νοέμβριος 2026" / "November 2026" */
export function monthLabel(month: string, lang: Lang): string {
  const d = monthDate(month)
  if (!d) return month
  const locale = LOCALES[lang]
  return capitalize(new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d), locale)
}

/** "Νοέμβριος" / "November" (nominative, for headings) */
export function monthName(month: string, lang: Lang): string {
  const d = monthDate(month)
  if (!d) return month
  const locale = LOCALES[lang]
  return capitalize(new Intl.DateTimeFormat(locale, { month: 'long' }).format(d), locale)
}

/** "Νοε" / "Nov" (chart axes, month grid) */
export function monthShortName(month: string, lang: Lang): string {
  const d = monthDate(month)
  if (!d) return month
  const locale = LOCALES[lang]
  return capitalize(new Intl.DateTimeFormat(locale, { month: 'short' }).format(d).replace(/\.$/, ''), locale)
}
