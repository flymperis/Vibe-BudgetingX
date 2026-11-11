/**
 * The selected month lives in the URL (`?month=YYYY-MM`) so it survives reloads,
 * can be shared and follows the browser back button. Default: current month
 * (the param is then left out of the URL).
 *
 *   const { month, setMonth, prev, next } = useMonth()
 *   useQuery({ queryKey: expenseKeys.list({ month }), ... })
 */
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { addMonths, currentMonth, isValidMonth } from '@/lib/dates'

export const MONTH_PARAM = 'month'

export function monthFromSearch(search: URLSearchParams, now: Date = new Date()): string {
  const raw = search.get(MONTH_PARAM)
  return isValidMonth(raw) ? raw : currentMonth(now)
}

export function useMonth() {
  const [params, setParams] = useSearchParams()
  const month = monthFromSearch(params)
  const isCurrent = month === currentMonth()

  const setMonth = useCallback(
    (value: string) => {
      setParams(
        (prev) => {
          const nextParams = new URLSearchParams(prev)
          if (!isValidMonth(value) || value === currentMonth()) nextParams.delete(MONTH_PARAM)
          else nextParams.set(MONTH_PARAM, value)
          return nextParams
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return {
    month,
    isCurrent,
    setMonth,
    prev: () => setMonth(addMonths(month, -1)),
    next: () => setMonth(addMonths(month, 1)),
  }
}

/** Search string that keeps the selected month when navigating ("" or "?month=2026-10"). */
export function useMonthSearch(): string {
  const [params] = useSearchParams()
  const raw = params.get(MONTH_PARAM)
  return isValidMonth(raw) ? `?${MONTH_PARAM}=${raw}` : ''
}

/**
 * Search string keeping only the listed params, in that order ("?month=2026-10&year=2025").
 * Sub-tabs use it so a report's `year` / `account` survive switching tabs.
 */
export function useKeptSearch(keep: readonly string[]): string {
  const [params] = useSearchParams()
  const kept = new URLSearchParams()
  for (const name of keep) {
    const value = params.get(name)
    if (value === null || value === '') continue
    if (name === MONTH_PARAM && !isValidMonth(value)) continue
    kept.set(name, value)
  }
  const text = kept.toString()
  return text ? `?${text}` : ''
}
