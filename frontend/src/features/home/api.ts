import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/keys'
import type { Schema } from '@/api/types'

export type Home = Schema<'HomeOut'>
export type BalanceAccount = Schema<'BalanceAccount'>
export type CardStatus = Schema<'CardStatus'>
export type CardStatement = Schema<'CardStatement'>

/** GET /api/home?month= : month totals, balances as of the month, budget card. */
export function useHome(month: string) {
  return useQuery({
    queryKey: [...qk.home, { month }],
    queryFn: () => api.get<Home>('/home', { params: { month } }),
    placeholderData: (prev) => prev,
  })
}
