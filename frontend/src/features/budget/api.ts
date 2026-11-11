import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { createKeys, invalidateDomains, qk } from '@/api/keys'
import type { Schema } from '@/api/types'
import { translate, type MessageKey } from '@/i18n'

export type BudgetPanel = Schema<'BudgetPanelOut'>
export type BudgetSummary = Schema<'BudgetSummary'>
export type BudgetLine = Schema<'BudgetLine'>
export type BudgetFormRow = Schema<'BudgetFormRow'>
export type MonthSnapshot = Schema<'MonthSnapshot'>
export type BudgetDefaultsIn = Schema<'BudgetDefaultsIn'>
export type BudgetOverrideIn = Schema<'BudgetOverrideIn'>
type OkOut = Schema<'OkOut'>

export const budgetKeys = createKeys('budget')

export function useBudget(month: string) {
  return useQuery({
    queryKey: budgetKeys.list({ month }),
    queryFn: () => api.get<BudgetPanel>('/budget', { params: { month } }),
  })
}

/** Budgets change the budget screen, the Home card, Summary's table and the reports. */
function invalidateBudget(qc: QueryClient, withBootstrap = false) {
  const keys: QueryKey[] = [budgetKeys.all, qk.home, ['summary'], ['reports']]
  if (withBootstrap) keys.push(qk.bootstrap)
  return invalidateDomains(qc, ...keys)
}

function useBudgetMutation<TBody>(
  path: string,
  successKey: MessageKey | ((body: TBody) => MessageKey),
  { inlineErrors = false, withBootstrap = false } = {},
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TBody) => api.post<OkOut>(path, body),
    meta: inlineErrors ? { toastErrors: false } : undefined,
    onSuccess: async (_data, body) => {
      await invalidateBudget(qc, withBootstrap)
      toast.success(translate(typeof successKey === 'function' ? successKey(body) : successKey))
    },
  })
}

export function useToggleBudget() {
  return useBudgetMutation<{ enabled: boolean }>(
    '/budget/toggle',
    (b) => (b.enabled ? 'budget.enabledToast' : 'budget.disabledToast'),
    { withBootstrap: true },
  )
}

export function useSaveDefaults() {
  return useBudgetMutation<BudgetDefaultsIn>('/budget/defaults', 'budget.defaultsSaved', {
    inlineErrors: true,
  })
}

export function useSaveOverride() {
  return useBudgetMutation<BudgetOverrideIn>(
    '/budget/override',
    (b) => (b.clear ? 'budget.overrideCleared' : 'common.saved'),
    { inlineErrors: true },
  )
}

export function useClearMonth() {
  return useBudgetMutation<{ month: string }>('/budget/clear-month', 'budget.monthCleared')
}

export function useRestoreMonth() {
  return useBudgetMutation<{ month: string }>('/budget/restore-month', 'budget.monthRestored')
}
