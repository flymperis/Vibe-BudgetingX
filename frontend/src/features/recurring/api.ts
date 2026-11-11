import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { createKeys, qk } from '@/api/keys'
import type { Schema } from '@/api/types'
import { invalidateBalances } from '@/components/manage/accounts-api'
import { translate } from '@/i18n'
import type { RecurringIn } from './recurringForm'

export const recurringKeys = createKeys('recurring')

export function useRecurringRules() {
  return useQuery({
    queryKey: recurringKeys.list(),
    queryFn: () => api.get<Schema<'RecurringListOut'>>('/recurring'),
  })
}

/**
 * Rules post their due entries when /api/bootstrap loads (as the old dashboard
 * load did), so after a change bootstrap and every money screen are refreshed.
 */
function useAfterChange() {
  const qc = useQueryClient()
  return () => {
    void invalidateBalances(qc)
    void qc.invalidateQueries({ queryKey: qk.bootstrap })
  }
}

export function useSaveRecurring() {
  const after = useAfterChange()
  return useMutation({
    mutationFn: ({ id, body }: { id: number | null; body: RecurringIn }) =>
      id === null
        ? api.post<Schema<'RecurringSavedOut'>>('/recurring', body)
        : api.put<Schema<'RecurringSavedOut'>>(`/recurring/${id}`, body),
    meta: { toastErrors: false },
    onSuccess: (_d, vars) => {
      after()
      toast.success(translate(vars.id === null ? 'recurring.added' : 'common.saved'))
    },
  })
}

export function useDeleteRecurring() {
  const after = useAfterChange()
  return useMutation({
    mutationFn: (id: number) => api.delete<Schema<'OkOut'>>(`/recurring/${id}`),
    onSuccess: () => {
      after()
      toast.success(translate('common.deleted'))
    },
  })
}
