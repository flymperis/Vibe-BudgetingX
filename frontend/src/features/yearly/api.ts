import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { createKeys } from '@/api/keys'
import type { Schema } from '@/api/types'

export type Yearly = Schema<'YearlyOut'>
export type YearlyRow = Schema<'YearlyRow'>

export const yearlyKeys = createKeys('yearly')

/** The old year picker offered 2000..2100 (backend normalize_year). */
export const MIN_YEAR = 2000
export const MAX_YEAR = 2100

export function parseYear(raw: string | null, fallback: number): number {
  if (!raw || !/^\d{4}$/.test(raw)) return fallback
  const y = Number(raw)
  return y >= MIN_YEAR && y <= MAX_YEAR ? y : fallback
}

export function useYearly(year: number) {
  return useQuery({
    queryKey: yearlyKeys.list({ year }),
    queryFn: () => api.get<Yearly>('/yearly', { params: { year } }),
    placeholderData: (prev) => prev,
  })
}

/** Chart points (the API reports expenses as positive spending). */
export function chartPoints(rows: YearlyRow[], label: (month: number) => string) {
  return rows.map((r) => ({
    month: r.month,
    label: label(r.month),
    income: r.income,
    expenses: r.expenses,
  }))
}
