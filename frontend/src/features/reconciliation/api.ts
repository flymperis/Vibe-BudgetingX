import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { createKeys, invalidateMoney } from '@/api/keys'
import type { Schema } from '@/api/types'
import { translate } from '@/i18n'

export type ReconcileStart = Schema<'ReconcileStartOut'>
export type ReconcileAccount = Schema<'ReconcileStartAccount'>
export type ReconcileIn = Schema<'ReconcileIn'>
export type ReconcilePlan = Schema<'ReconcilePlanOut'>

export const reconciliationKeys = createKeys('reconciliation')

/** Every account with its recorded balance at the end of `date`. */
export function useReconcileStart(date: string) {
  return useQuery({
    queryKey: reconciliationKeys.list({ date }),
    queryFn: () => api.get<ReconcileStart>('/reconciliation', { params: { date } }),
    placeholderData: (prev) => prev,
  })
}

/** The transfers and "balancing input" entries the typed balances need (nothing is saved). */
export function usePreviewReconciliation() {
  return useMutation({
    mutationFn: (body: ReconcileIn) => api.post<ReconcilePlan>('/reconciliation/preview', body),
  })
}

export function useApplyReconciliation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ReconcileIn) => api.post<Schema<'ReconcileAppliedOut'>>('/reconciliation/apply', body),
    onSuccess: (out) => {
      void invalidateMoney(qc)
      const nothing = !out.transfers.length && !out.adjustments.length
      toast.success(translate(nothing ? 'reconcile.nothingToDo' : 'reconcile.applied'))
    },
  })
}
