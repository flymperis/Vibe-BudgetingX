/**
 * The credit card statement line of the old `account_balances_list` macro, as
 * text ("Κατάσταση: 120,00 € · λήγει 5 Δεκ"). Amounts come from the API; this
 * only picks the wording and the tone.
 */
import { translate, type Lang } from '@/i18n'
import { dayMonthShort } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

export interface CardStatementLike {
  closed_on: string
  amount: number
  paid: number
  remaining: number
  due_on?: string | null
  /** none | paid | open | soon | overdue */
  state: string
}

export type StatementTone = 'muted' | 'positive' | 'warning' | 'negative' | 'default'

export function statementLine(st: CardStatementLike, lang: Lang): { text: string; tone: StatementTone } {
  const closed = dayMonthShort(st.closed_on, lang)
  if (st.state === 'none')
    return { text: translate('accounts.statementNone', { date: closed }, lang), tone: 'muted' }
  if (st.state === 'paid')
    return { text: translate('accounts.statementPaid', { date: closed }, lang), tone: 'positive' }
  let text =
    st.paid > 0
      ? translate(
          'accounts.statementLeft',
          { remaining: formatMoney(st.remaining), amount: formatMoney(st.amount) },
          lang,
        )
      : translate('accounts.statementOpen', { remaining: formatMoney(st.remaining) }, lang)
  if (st.due_on) {
    const due = dayMonthShort(st.due_on, lang)
    text += ` · ${translate(st.state === 'overdue' ? 'accounts.statementWasDue' : 'accounts.statementDue', { date: due }, lang)}`
  }
  const tone = st.state === 'overdue' ? 'negative' : st.state === 'soon' ? 'warning' : 'default'
  return { text, tone }
}
