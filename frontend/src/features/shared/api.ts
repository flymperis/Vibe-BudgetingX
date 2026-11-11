/** Data layer of the Shared screens (/api/shared, see docs/parity/C.md). */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { createKeys, invalidateMoney } from '@/api/keys'
import type { Schema } from '@/api/types'
import { translate, type MessageKey } from '@/i18n'

export type SharedOverview = Schema<'SharedOverviewOut'>
export type GroupDetail = Schema<'GroupDetailOut'>
export type Contact = Schema<'ContactOut'>
export type Member = Schema<'MemberOut'>
export type Suggestion = Schema<'SuggestionOut'>
export type BillActivity = Schema<'ExpenseActivityOut'>
export type PaymentActivity = Schema<'SettlementActivityOut'>
export type Activity = BillActivity | PaymentActivity
export type BillIn = Schema<'vbx__api__schemas__shared__ExpenseIn'>
export type SettlementIn = Schema<'SettlementIn'>
export type MembersIn = Schema<'MembersIn'>
export type GroupIn = Schema<'GroupIn'>
type ActionOut = Schema<'SharedActionOut'>

export const sharedKeys = createKeys('shared')
export const overviewKey = sharedKeys.custom('overview')

export function useSharedOverview() {
  return useQuery({
    queryKey: overviewKey,
    queryFn: () => api.get<SharedOverview>('/shared'),
  })
}

export function useGroupDetail(groupId: number) {
  return useQuery({
    queryKey: sharedKeys.detail(groupId),
    queryFn: () => api.get<GroupDetail>(`/shared/groups/${groupId}`),
    // A 404 (left / deleted / never a member) is shown in the screen itself.
    meta: { toastErrors: false },
  })
}

type Scope = 'shared' | 'money'

function refresh(qc: QueryClient, scope: Scope) {
  return scope === 'money' ? invalidateMoney(qc) : qc.invalidateQueries({ queryKey: sharedKeys.all })
}

/**
 * One mutation hook per endpoint. `scope` says what to refresh: "money" for
 * anything that can touch my accounts (bills, payments, recording, deleting a
 * group), "shared" for people / groups / members.
 */
function useSharedMutation<V>(
  fn: (vars: V) => Promise<ActionOut>,
  {
    scope,
    success,
    inline = false,
    before,
  }: {
    scope: Scope
    success: MessageKey
    inline?: boolean
    /** Runs before the refresh (e.g. leave a group screen that is about to 404). */
    before?: (vars: V) => void
  },
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    meta: inline ? { toastErrors: false } : undefined,
    onSuccess: async (_res, vars) => {
      before?.(vars)
      await refresh(qc, scope)
      toast.success(translate(success))
    },
  })
}

// --- people -----------------------------------------------------------------

export const useAddPeople = () =>
  useSharedMutation((name: string) => api.post<ActionOut>('/shared/people', { name }), {
    scope: 'shared',
    success: 'shared.toast.peopleAdded',
    inline: true,
  })

export const useRenamePerson = () =>
  useSharedMutation(
    ({ id, name }: { id: number; name: string }) => api.put<ActionOut>(`/shared/people/${id}`, { name }),
    { scope: 'shared', success: 'shared.toast.renamed', inline: true },
  )

export const useDeletePerson = () =>
  useSharedMutation((id: number) => api.delete<ActionOut>(`/shared/people/${id}`), {
    scope: 'shared',
    success: 'shared.toast.personRemoved',
    inline: true,
  })

export const useLinkPerson = () =>
  useSharedMutation(
    ({ id, username }: { id: number; username: string }) =>
      api.put<ActionOut>(`/shared/people/${id}/link`, { username }),
    { scope: 'shared', success: 'shared.toast.linked', inline: true },
  )

export const useUnlinkPerson = () =>
  useSharedMutation((id: number) => api.delete<ActionOut>(`/shared/people/${id}/link`), {
    scope: 'shared',
    success: 'shared.toast.unlinked',
    inline: true,
  })

// --- groups -----------------------------------------------------------------

export const useCreateGroup = () =>
  useSharedMutation((body: GroupIn) => api.post<ActionOut>('/shared/groups', body), {
    scope: 'shared',
    success: 'shared.toast.groupCreated',
    inline: true,
  })

export const useRenameGroup = () =>
  useSharedMutation(
    ({ id, name }: { id: number; name: string }) => api.put<ActionOut>(`/shared/groups/${id}`, { name }),
    { scope: 'shared', success: 'shared.toast.renamed', inline: true },
  )

export const useDeleteGroup = (onGone?: () => void) =>
  useSharedMutation((id: number) => api.delete<ActionOut>(`/shared/groups/${id}`), {
    scope: 'money',
    success: 'shared.toast.groupDeleted',
    before: () => onGone?.(),
  })

export const useAcceptInvite = (onJoined?: (groupId: number) => void) =>
  useSharedMutation((id: number) => api.post<ActionOut>(`/shared/groups/${id}/accept`), {
    scope: 'shared',
    success: 'shared.toast.joined',
    before: (id) => onJoined?.(id),
  })

export const useDeclineInvite = () =>
  useSharedMutation((id: number) => api.post<ActionOut>(`/shared/groups/${id}/decline`), {
    scope: 'shared',
    success: 'shared.toast.declined',
  })

export const useAddMembers = () =>
  useSharedMutation(
    ({ groupId, body }: { groupId: number; body: MembersIn }) =>
      api.post<ActionOut>(`/shared/groups/${groupId}/members`, body),
    { scope: 'shared', success: 'shared.toast.membersAdded', inline: true },
  )

export const useRemoveMember = (onLeft?: () => void) =>
  useSharedMutation(
    ({ groupId, personId }: { groupId: number; personId: number; leaving: boolean }) =>
      api.delete<ActionOut>(`/shared/groups/${groupId}/members/${personId}`),
    {
      scope: 'money',
      success: 'shared.toast.memberRemoved',
      before: (vars) => {
        if (vars.leaving) onLeft?.()
      },
    },
  )

// --- bills --------------------------------------------------------------------

export const useSaveBill = () =>
  useSharedMutation(
    ({ groupId, billId, body }: { groupId: number; billId?: number; body: BillIn }) =>
      billId
        ? api.put<ActionOut>(`/shared/expenses/${billId}`, body)
        : api.post<ActionOut>(`/shared/groups/${groupId}/expenses`, body),
    { scope: 'money', success: 'common.saved', inline: true },
  )

export const useDeleteBill = () =>
  useSharedMutation((id: number) => api.delete<ActionOut>(`/shared/expenses/${id}`), {
    scope: 'money',
    success: 'common.deleted',
  })

export const useRecordBill = () =>
  useSharedMutation(
    ({
      id,
      category_id,
      account_id,
    }: {
      id: number
      category_id: number | null
      account_id: number | null
    }) => api.put<ActionOut>(`/shared/expenses/${id}/record`, { category_id, account_id }),
    { scope: 'money', success: 'shared.toast.recorded', inline: true },
  )

export const useUnrecordBill = () =>
  useSharedMutation((id: number) => api.delete<ActionOut>(`/shared/expenses/${id}/record`), {
    scope: 'money',
    success: 'shared.toast.unrecorded',
  })

// --- payments -----------------------------------------------------------------

export const useAddPayment = () =>
  useSharedMutation(
    ({ groupId, body }: { groupId: number; body: SettlementIn }) =>
      api.post<ActionOut>(`/shared/groups/${groupId}/settlements`, body),
    { scope: 'money', success: 'shared.toast.paymentAdded', inline: true },
  )

export const useDeletePayment = () =>
  useSharedMutation((id: number) => api.delete<ActionOut>(`/shared/settlements/${id}`), {
    scope: 'money',
    success: 'common.deleted',
  })

export const useRecordPayment = () =>
  useSharedMutation(
    ({ id, account_id }: { id: number; account_id: number | null }) =>
      api.put<ActionOut>(`/shared/settlements/${id}/record`, { account_id }),
    { scope: 'money', success: 'shared.toast.paymentRecorded', inline: true },
  )

export const useUnrecordPayment = () =>
  useSharedMutation((id: number) => api.delete<ActionOut>(`/shared/settlements/${id}/record`), {
    scope: 'money',
    success: 'shared.toast.paymentUnrecorded',
  })
