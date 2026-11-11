import type { Account } from '@/api/accounts'
import type { MessageKey } from '@/i18n'
import { parseAmountInput } from '@/lib/amount'
import type { AccountIn } from './api'

export type AccountType = 'bank' | 'credit'

export interface AccountForm {
  name: string
  type: AccountType
  /** Opening balance; for a card, what was owed on it (entered positive). */
  opening: string
  limit: string
  statementDay: string
  dueDay: string
}

export const emptyAccountForm = (): AccountForm => ({
  name: '',
  type: 'bank',
  opening: '',
  limit: '',
  statementDay: '',
  dueDay: '',
})

const numText = (v: number | null | undefined) =>
  v === null || v === undefined ? '' : String(Math.round(v * 100) / 100).replace('.', ',')

/** Edit form: a card shows the owed amount positive (server `opening_balance_input`). */
export function accountFormFromAccount(a: Account): AccountForm {
  return {
    name: a.name,
    type: a.is_credit_card ? 'credit' : 'bank',
    opening: numText(a.opening_balance_input),
    limit: numText(a.credit_limit),
    statementDay: a.statement_day ? String(a.statement_day) : '',
    dueDay: a.due_day ? String(a.due_day) : '',
  }
}

function dayOk(text: string): boolean {
  const s = text.trim()
  if (!s) return true
  return /^\d+$/.test(s) && Number(s) >= 1 && Number(s) <= 31
}

/** First problem, or null. Mirrors the server's account form rules. */
export function validateAccount(form: AccountForm): MessageKey | null {
  if (!form.name.trim()) return 'settings.errName'
  if (form.opening.trim() && parseAmountInput(form.opening) === null) return 'settings.errOpening'
  if (form.type === 'credit') {
    if (form.limit.trim()) {
      const limit = parseAmountInput(form.limit)
      if (limit === null || limit < 0) return 'settings.errLimit'
    }
    if (!dayOk(form.statementDay)) return 'settings.errStatementDay'
    if (!dayOk(form.dueDay)) return 'settings.errDueDay'
    if (form.dueDay.trim() && !form.statementDay.trim()) return 'settings.errDueNeedsStatement'
  }
  return null
}

/** POST/PUT /api/accounts body. Card fields are only sent for cards (the server ignores them for banks). */
export function buildAccountBody(form: AccountForm): AccountIn {
  const isCard = form.type === 'credit'
  const day = (s: string) => (s.trim() ? Number(s.trim()) : null)
  return {
    name: form.name.trim(),
    account_type: form.type,
    opening_balance: parseAmountInput(form.opening) ?? 0,
    credit_limit: isCard ? parseAmountInput(form.limit) : null,
    statement_day: isCard ? day(form.statementDay) : null,
    due_day: isCard ? day(form.dueDay) : null,
  }
}

/** Keeps what can be typed into a balance field: digits, one "," or ".", and a leading "-" for banks. */
export function sanitizeBalanceTyping(text: string, allowNegative: boolean): string {
  const negative = allowNegative && text.trim().startsWith('-')
  let out = ''
  let seenSep = false
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') out += ch
    else if ((ch === ',' || ch === '.') && !seenSep) {
      seenSep = true
      out += ','
    }
  }
  return (negative ? '-' : '') + out
}
