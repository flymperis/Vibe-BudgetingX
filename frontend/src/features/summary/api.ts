import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { createKeys } from '@/api/keys'
import type { Schema } from '@/api/types'

export type Summary = Schema<'SummaryOut'>
export type BalanceAccount = Schema<'BalanceAccount'>

export const summaryKeys = createKeys('summary')

export function useSummary(month: string) {
  return useQuery({
    queryKey: summaryKeys.list({ month }),
    queryFn: () => api.get<Summary>('/summary', { params: { month } }),
  })
}
