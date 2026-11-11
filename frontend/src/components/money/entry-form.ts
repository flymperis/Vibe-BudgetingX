/**
 * The add/edit form of an expense or income entry, without React.
 *
 * Sign rules (old forms): an expense is stored negative (spending) unless the
 * -/+ toggle marks it as a refund; income is always positive.
 */
import { amountToText, parseAmountInput } from '@/lib/amount'
import { addDays } from '@/lib/dates'
import type { Entry, EntryKind, ExpenseIn, IncomeIn } from './entries'

export interface EntryDraft {
  /** Canonical amount string (see src/lib/amount.ts), always the magnitude. */
  amount: string
  /** Expense only: a refund (stored positive). */
  refund: boolean
  categoryId: number | null
  accountId: number | null
  /** YYYY-MM-DD */
  day: string
  notes: string
}

export type DraftError = 'amount' | 'category' | 'account'

export function emptyDraft(today: string, accountId: number | null = null): EntryDraft {
  return { amount: '', refund: false, categoryId: null, accountId, day: today, notes: '' }
}

export function draftFromEntry(entry: Entry): EntryDraft {
  return {
    amount: amountToText(entry.amount),
    refund: entry.kind === 'expense' && entry.amount > 0,
    categoryId: entry.category_id,
    accountId: entry.account_id,
    day: entry.date,
    notes: entry.notes,
  }
}

/** First problem of the draft, or null when it can be sent. */
export function validateDraft(draft: EntryDraft): DraftError | null {
  const value = parseAmountInput(draft.amount)
  if (value === null || value <= 0) return 'amount'
  if (draft.categoryId === null) return 'category'
  if (draft.accountId === null) return 'account'
  return null
}

/** Request body for POST/PUT /api/expenses or /api/income. Call after validateDraft. */
export function draftToBody(kind: EntryKind, draft: EntryDraft): ExpenseIn | IncomeIn {
  const magnitude = Math.abs(parseAmountInput(draft.amount) ?? 0)
  const common = {
    notes: draft.notes.trim(),
    category_id: draft.categoryId,
    account_id: draft.accountId,
  }
  if (kind === 'expense') {
    return { ...common, amount: draft.refund ? magnitude : -magnitude, spent_at: draft.day }
  }
  return { ...common, amount: magnitude, received_at: draft.day }
}

/** The signed amount the body will store (for the success toast). */
export function draftSignedAmount(kind: EntryKind, draft: EntryDraft): number {
  const magnitude = Math.abs(parseAmountInput(draft.amount) ?? 0)
  return kind === 'expense' && !draft.refund ? -magnitude : magnitude
}

/** Day chips: today and the three days before. */
export function recentDays(today: string, count = 4): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, -i))
}

// ---- last used account (per kind, per device) ---------------------------------

const ACCOUNT_KEY = (kind: EntryKind) => `vbx.lastAccount.${kind}`

export function rememberAccount(kind: EntryKind, accountId: number | null) {
  try {
    if (accountId !== null) localStorage.setItem(ACCOUNT_KEY(kind), String(accountId))
  } catch {
    /* private mode */
  }
}

/** The last account used for this kind if it still exists, else the first account. */
export function defaultAccountId(kind: EntryKind, accounts: readonly { id: number }[]): number | null {
  let stored: number | null = null
  try {
    stored = Number(localStorage.getItem(ACCOUNT_KEY(kind))) || null
  } catch {
    stored = null
  }
  if (stored !== null && accounts.some((a) => a.id === stored)) return stored
  return accounts[0]?.id ?? null
}
