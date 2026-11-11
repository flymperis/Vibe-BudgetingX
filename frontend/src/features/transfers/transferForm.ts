import type { MessageKey } from '@/i18n'
import { amountToText, parseAmountInput } from '@/lib/amount'
import type { TransferDefaults, TransferIn } from './api'

export interface TransferForm {
  fromId: number | null
  toId: number | null
  /** Canonical amount string (see lib/amount). */
  amount: string
  date: string
  notes: string
}

/** Form state from the server defaults (first/second account, or the pay-card pre-fill). */
export function transferFormFromDefaults(d: TransferDefaults): TransferForm {
  return {
    fromId: d.from_account_id,
    toId: d.to_account_id,
    amount: d.amount ? amountToText(d.amount) : '',
    date: d.transferred_at,
    notes: '',
  }
}

export function swapAccounts(form: TransferForm): TransferForm {
  return { ...form, fromId: form.toId, toId: form.fromId }
}

/** True while From and To are the same account (old live hint; submit disabled). */
export function sameAccount(form: TransferForm): boolean {
  return form.fromId !== null && form.fromId === form.toId
}

/** First problem the user must fix, or null. The server checks everything again. */
export function validateTransfer(form: TransferForm): MessageKey | null {
  if (form.fromId === null || form.toId === null) return 'transfers.chooseAccounts'
  if (sameAccount(form)) return 'transfers.sameAccount'
  const amount = parseAmountInput(form.amount)
  if (amount === null || amount <= 0) return 'transfers.amountRequired'
  return null
}

/** POST /api/transfers body: what the old form posted (amount positive). */
export function buildTransferBody(form: TransferForm): TransferIn {
  return {
    from_account_id: form.fromId,
    to_account_id: form.toId,
    amount: parseAmountInput(form.amount),
    transferred_at: form.date,
    notes: form.notes.trim(),
  }
}
