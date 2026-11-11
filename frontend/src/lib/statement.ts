/**
 * The credit card lines of the old `account_balances_list` macro, as text.
 * Amounts come from the API; this only picks the wording.
 */
import { LOCALES, translate, type Lang } from '@/i18n'
import { parseISODate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import type { CardStatement } from './api'

/** "5 Νοε" / "5 Nov" (old `{{ d.day }} {{ d.strftime('%b') }}`). */
export function dayMonthShort(iso: string, lang: Lang): string {
  const d = parseISODate(iso)
  if (!d) return iso
  return new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'short' })
    .format(d)
    .replace(/\.$/, '')
}

export type StatementTone = 'muted' | 'positive' | 'warning' | 'negative' | 'default'

export function statementLine(st: CardStatement, lang: Lang): { text: string; tone: StatementTone } {
  const closed = dayMonthShort(st.closed_on, lang)
  if (st.state === 'none')
    return { text: translate('home.statementNone', { date: closed }, lang), tone: 'muted' }
  if (st.state === 'paid')
    return { text: translate('home.statementPaid', { date: closed }, lang), tone: 'positive' }
  let text = translate('home.statementOpen', { remaining: formatMoney(st.remaining) }, lang)
  if (st.paid > 0) text += ` ${translate('home.statementLeftOf', { amount: formatMoney(st.amount) }, lang)}`
  if (st.due_on) {
    const due = dayMonthShort(st.due_on, lang)
    text += ` · ${translate(st.state === 'overdue' ? 'home.statementWasDue' : 'home.statementDue', { date: due }, lang)}`
  }
  const tone = st.state === 'overdue' ? 'negative' : st.state === 'soon' ? 'warning' : 'default'
  return { text, tone }
}
