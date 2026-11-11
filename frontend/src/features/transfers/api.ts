import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { createKeys, invalidateMoney } from '@/api/keys'
import type { Schema } from '@/api/types'
import { translate } from '@/i18n'

export type TransferList = Schema<'TransferListOut'>
export type Transfer = Schema<'TransferOut'>
export type TransferDefaults = Schema<'TransferDefaults'>
export type TransferIn = Schema<'TransferIn'>

export const transferKeys = createKeys('transfers')

/** Last transfers + form defaults; `payCard` asks for the old "Pay card" pre-fill. */
export function useTransfers(month: string, payCard: number | null) {
  return useQuery({
    queryKey: transferKeys.list({ month, payCard }),
    queryFn: () => api.get<TransferList>('/transfers', { params: { month, pay_card: payCard } }),
    placeholderData: (prev) => prev,
  })
}

export function useCreateTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TransferIn) => api.post<Schema<'TransferSavedOut'>>('/transfers', body),
    meta: { toastErrors: false },
    onSuccess: () => {
      void invalidateMoney(qc)
      toast.success(translate('transfers.recorded'))
    },
  })
}

export function useDeleteTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<Schema<'OkOut'>>(`/transfers/${id}`),
    onSuccess: () => {
      void invalidateMoney(qc)
      toast.success(translate('common.deleted'))
    },
  })
}
