/** Report year: `?year=` in the URL, remembered for the session so the sections share it. */
import { useSearchParams } from 'react-router'
import { useBootstrap } from '@/bootstrap/bootstrap'

export const MIN_YEAR = 2000
export const MAX_YEAR = 2100
const STORAGE_KEY = 'vbx.reports.year'

/** Old rule: blank, invalid or outside 2000-2100 = the current year. */
export function normalizeYear(raw: string | null | undefined, currentYear: number): number {
  const text = (raw ?? '').trim()
  if (!/^\d{4}$/.test(text)) return currentYear
  const year = Number(text)
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : currentYear
}

function stored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function useReportYear() {
  const [params, setParams] = useSearchParams()
  const currentYear = Number(useBootstrap().today.slice(0, 4))
  const year = normalizeYear(params.get('year') ?? stored(), currentYear)
  const setYear = (next: number) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      /* private mode */
    }
    setParams(
      (p) => {
        const copy = new URLSearchParams(p)
        copy.set('year', String(next))
        return copy
      },
      { replace: true },
    )
  }
  return { year, setYear, currentYear }
}

/** `?account=` (old report_account): an account id, or null for all accounts. */
export function parseAccountParam(raw: string | null, ids: number[]): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return ids.includes(id) ? id : null
}
