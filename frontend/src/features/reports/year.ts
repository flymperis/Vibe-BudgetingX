/** Report year: `?year=` in the URL (the report tabs carry it over, see ReportsLayout). */
import { useSearchParams } from 'react-router'
import { useBootstrap } from '@/bootstrap/bootstrap'

export const MIN_YEAR = 2000
export const MAX_YEAR = 2100

/** Old rule: blank, invalid or outside 2000-2100 = the current year. */
export function normalizeYear(raw: string | null | undefined, currentYear: number): number {
  const text = (raw ?? '').trim()
  if (!/^\d{4}$/.test(text)) return currentYear
  const year = Number(text)
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : currentYear
}

export function useReportYear() {
  const [params, setParams] = useSearchParams()
  const currentYear = Number(useBootstrap().today.slice(0, 4))
  const year = normalizeYear(params.get('year'), currentYear)
  const setYear = (next: number) => {
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
