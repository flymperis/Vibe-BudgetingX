/**
 * GET /api/accounts: every account with its balance as of a month (Transfers,
 * Settings -> accounts). `accounts` is a money domain, so `invalidateMoney`
 * refreshes it after any expense / income / transfer / recurring / shared change.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { createKeys } from '@/api/keys'
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
