/** Form state <-> request bodies of the bill and settle-up sheets (pure, tested). */
import { amountToText } from '@/lib/amount'
import type { BillIn, GroupDetail, SettlementIn } from './api'
import { isSplitMethod, type SplitMethod } from './split'

export interface BillFormState {
  amount: string
  description: string
  paidBy: number | null
  spentOn: string
  method: SplitMethod
  included: Record<number, boolean>
  values: Record<number, string>
  record: boolean
  categoryId: number | null
  accountId: number | null
}

type Payload = GroupDetail['activity'][number] extends infer A
  ? A extends { kind: 'expense'; payload: infer P }
    ? P
    : never
  : never

/**
 * Start state: a new bill (expense_defaults, first category / account as the
 * old selects did) or an existing bill's payload. Editing keeps the editor's
 * current recording state, because a save without record_personal removes it.
 */
export function initialBillState(
  group: Pick<GroupDetail, 'members' | 'expense_defaults'>,
  options: { payload?: Payload | null; categoryIds: number[]; accountIds: number[] },
): BillFormState {
  const { payload, categoryIds, accountIds } = options
  const included: Record<number, boolean> = {}
  const values: Record<number, string> = {}
  const pickedIds = new Set(payload ? payload.included : group.expense_defaults.included)
  for (const m of group.members) {
    included[m.id] = pickedIds.has(m.id)
    values[m.id] = payload?.values[String(m.id)] ?? ''
  }
  const firstCategory = categoryIds[0] ?? null
  const firstAccount = accountIds[0] ?? null
  if (payload) {
    return {
      amount: amountToText(Number(payload.amount)),
      description: payload.description,
      paidBy: payload.paid_by,
      spentOn: payload.spent_on,
      method: isSplitMethod(payload.split_method) ? payload.split_method : 'equal',
      included,
      values,
      record: payload.record_personal,
      categoryId: payload.category_id ?? firstCategory,
      accountId: payload.account_id ?? firstAccount,
    }
  }
  const d = group.expense_defaults
  return {
    amount: '',
    description: '',
    paidBy: d.paid_by,
    spentOn: d.spent_on,
    method: isSplitMethod(d.split_method) ? d.split_method : 'equal',
    included,
    values,
    record: d.record_personal,
    categoryId: firstCategory,
    accountId: firstAccount,
  }
}

export function buildBillBody(state: BillFormState, memberIds: number[]): BillIn {
  const values: Record<string, string> = {}
  for (const id of memberIds) values[String(id)] = (state.values[id] ?? '').trim()
  return {
    description: state.description.trim(),
    amount: state.amount,
    paid_by: state.paidBy,
    split_method: state.method,
    spent_on: state.spentOn,
    included: memberIds.filter((id) => state.included[id]),
    values,
    record_personal: state.record,
    category_id: state.record ? state.categoryId : null,
    account_id: state.record ? state.accountId : null,
  }
}

export interface SettleFormState {
  amount: string
  fromId: number | null
  toId: number | null
  paidOn: string
  notes: string
  record: boolean
  accountId: number | null
}

export interface SettlePrefill {
  from_id: number
  to_id: number
  amount: number
}

export function initialSettleState(
  group: Pick<GroupDetail, 'settlement_defaults'>,
  accountIds: number[],
  prefill?: SettlePrefill | null,
): SettleFormState {
  const d = group.settlement_defaults
  return {
    amount: amountToText(prefill ? prefill.amount : d.amount),
    fromId: prefill ? prefill.from_id : d.from_person_id,
    toId: prefill ? prefill.to_id : d.to_person_id,
    paidOn: d.paid_on,
    notes: '',
    record: d.record_personal,
    accountId: accountIds[0] ?? null,
  }
}

export function buildSettlementBody(state: SettleFormState, meId: number | null): SettlementIn {
  const involved = meId !== null && (state.fromId === meId || state.toId === meId)
  const record = involved && state.record
  return {
    from_person_id: state.fromId,
    to_person_id: state.toId,
    amount: state.amount,
    paid_on: state.paidOn,
    notes: state.notes.trim(),
    record_personal: record,
    account_id: record ? state.accountId : null,
  }
}
