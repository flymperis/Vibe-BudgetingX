import { CreditCard } from 'lucide-react'
import type { ReactNode } from 'react'
import { Money } from '@/components/Money'
import { ProgressBar } from '@/components/ProgressBar'
import { Button } from '@/components/ui/button'
import { useLang, useT } from '@/i18n'
import type { BudgetStatus } from '@/lib/budget'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { AccountAvatar } from './AccountAvatar'
import type { Account, AccountList } from './accounts-api'
import { dayMonthLabel } from './format'

export interface AccountBalancesListProps {
  data: AccountList
  /** Shows a "Pay" button on cards with something owed (old "Pay card" link). */
  onPay?: (account: Account) => void
  /** Makes each row a button (e.g. open the account's edit sheet). */
  onSelect?: (account: Account) => void
  className?: string
}

const rowCls = 'flex w-full min-h-14 items-center gap-3 px-3.5 py-2.5 text-left'
const interactive =
  'cursor-pointer outline-none transition-colors hover:bg-muted/60 active:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

/**
 * The account balances block of the old Home/Transfer panels: every account
 * with its balance; credit cards add the limit left, a usage bar and the last
 * statement; with any card the total splits into cash, cards and net.
 */
export function AccountBalancesList({ data, onPay, onSelect, className }: AccountBalancesListProps) {
  const t = useT()
  const { items, totals, has_cards: hasCards } = data
  return (
    <ul
      aria-label={t('manage.balances')}
      className={cn(
        'divide-y divide-border overflow-hidden rounded-2xl border bg-card shadow-card',
        className,
      )}
    >
      {items.map((a) => (
        <AccountBalanceRow key={a.id} account={a} onPay={onPay} onSelect={onSelect} />
      ))}
      {hasCards ? (
        <>
          <TotalRow label={t('manage.cashTotal')} value={totals.cash_total} />
          <TotalRow label={t('manage.cardsTotal')} value={totals.cards_total} />
          <TotalRow label={t('manage.netTotal')} value={totals.net_total} strong />
        </>
      ) : items.length ? (
        <TotalRow label={t('manage.total')} value={totals.net_total} strong />
      ) : null}
    </ul>
  )
}

function TotalRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <li className={cn('flex items-center justify-between gap-3 px-3.5 py-3', strong ? 'bg-muted/40' : '')}>
      <span className={cn('text-sm', strong ? 'font-semibold' : 'text-muted-foreground')}>{label}</span>
      <Money value={value} className={cn('text-[15px]', strong ? 'font-bold' : 'font-semibold')} />
    </li>
  )
}

function AccountBalanceRow({
  account: a,
  onPay,
  onSelect,
}: {
  account: Account
  onPay?: (a: Account) => void
  onSelect?: (a: Account) => void
}) {
  const t = useT()
  const card = a.card
  const main: ReactNode = (
    <>
      <AccountAvatar name={a.name} bank={a.bank} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] leading-snug font-medium">{a.name}</span>
          {a.is_credit_card ? (
            <CreditCard
              aria-label={t('manage.creditCard')}
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          ) : null}
        </span>
        {card?.limit ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t('manage.availableOf', {
              available: formatMoney(card.available),
              limit: formatMoney(card.limit),
            })}
          </span>
        ) : null}
      </span>
      <Money value={a.current_balance} className="text-[15px] font-semibold" />
    </>
  )
  const extra =
    card && (card.limit || card.statement || (onPay && a.can_pay)) ? (
      <div className="-mt-1 space-y-2 pr-3.5 pb-3 pl-[66px]">
        {card.limit ? (
          <ProgressBar
            value={card.owed}
            max={card.limit}
            status={card.used_level as BudgetStatus}
            label={t('manage.limitUsed', { name: a.name })}
          />
        ) : null}
        {card.statement || (onPay && a.can_pay) ? (
          <div className="flex items-center justify-between gap-3">
            {card.statement ? <StatementLine statement={card.statement} /> : <span />}
            {onPay && a.can_pay ? (
              <Button
                size="sm"
                variant="secondary"
                className="h-11 shrink-0 rounded-full px-4"
                onClick={() => onPay(a)}
              >
                {t('manage.payCard')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    ) : null

  return (
    <li>
      {onSelect ? (
        <button type="button" className={cn(rowCls, interactive)} onClick={() => onSelect(a)}>
          {main}
        </button>
      ) : (
        <div className={rowCls}>{main}</div>
      )}
      {extra}
    </li>
  )
}

type Statement = NonNullable<NonNullable<Account['card']>['statement']>

/** "Κατάσταση 120,00 € · λήγει 5 Δεκ" etc., as the old card line. */
export function StatementLine({ statement: st }: { statement: Statement }) {
  const t = useT()
  const lang = useLang()
  const closed = dayMonthLabel(st.closed_on, lang)
  if (st.state === 'none') {
    return (
      <span className="text-xs text-muted-foreground">{t('manage.statementNone', { date: closed })}</span>
    )
  }
  if (st.state === 'paid') {
    return <span className="text-xs text-positive">{t('manage.statementPaid', { date: closed })}</span>
  }
  const tone =
    st.state === 'overdue' ? 'text-negative' : st.state === 'soon' ? 'text-warning' : 'text-muted-foreground'
  return (
    <span className={cn('text-xs', tone)}>
      {st.paid > 0
        ? t('manage.statementLeft', { remaining: formatMoney(st.remaining), amount: formatMoney(st.amount) })
        : t('manage.statementDue', { remaining: formatMoney(st.remaining) })}
      {st.due_on
        ? ` · ${t(st.state === 'overdue' ? 'manage.wasDue' : 'manage.due', { date: dayMonthLabel(st.due_on, lang) })}`
        : null}
    </span>
  )
}
