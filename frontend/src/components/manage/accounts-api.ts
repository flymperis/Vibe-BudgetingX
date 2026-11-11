/**
 * GET /api/accounts, shared by the Transfers screen and Settings → accounts
 * (both show balances for the selected month, like the old panels).
 */
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { createKeys, invalidateDomains, invalidateMoney } from '@/api/keys'
import type { Schema } from '@/api/types'

export type AccountList = Schema<'AccountListOut'>
export type Account = Schema<'vbx__api__schemas__accounts__AccountOut'>

export const accountKeys = createKeys('accounts')

export function useAccounts(month?: string) {
  return useQuery({
    queryKey: accountKeys.list({ month: month ?? null }),
    queryFn: () => api.get<AccountList>('/accounts', { params: { month } }),
  })
}

/** Balances changed: every money screen plus the accounts list. */
export function invalidateBalances(qc: QueryClient) {
  return Promise.all([invalidateMoney(qc), invalidateDomains(qc, accountKeys.all)])
}
