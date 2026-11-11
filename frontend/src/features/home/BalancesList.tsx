import { Link } from 'react-router'
import { AccountAvatar } from '@/components/money/AccountAvatar'
import { Money } from '@/components/Money'
import { ProgressBar } from '@/components/ProgressBar'
import { useLang, useT } from '@/i18n'
import type { BudgetStatus } from '@/lib/budget'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { BalanceAccount, CardStatus, Home } from './api'
import { statementLine, type StatementTone } from './statement'

const TONE: Record<StatementTone, string> = {
  muted: 'text-muted-foreground',
  positive: 'text-positive',
  warning: 'text-warning',
  negative: 'text-negative font-medium',
  default: 'text-foreground',
}

const LEVELS: BudgetStatus[] = ['ok', 'warn', 'over']
const asLevel = (v: string): BudgetStatus => (LEVELS.includes(v as BudgetStatus) ? (v as BudgetStatus) : 'ok')

/** Account balances of the old Home (and Transfer) panel: rows, card details, totals. */
export function BalancesList({ home }: { home: Home }) {
  const t = useT()
  if (!home.accounts.length) {
    return (
      <div className="rounded-2xl border bg-card px-4 py-5 text-center text-sm text-muted-foreground shadow-card">
        {t('home.noAccounts')}{' '}
        <Link to="/settings/accounts" className="font-medium text-primary underline-offset-2 hover:underline">
          {t('home.addAccount')}
        </Link>
      </div>
    )
  }
  return (
    <ul
      aria-label={t('home.balances')}
      className="divide-y divide-border overflow-hidden rounded-2xl border bg-card shadow-card"
    >
      {home.accounts.map((a) => (
        <AccountRow key={a.id} account={a} month={home.month} />
      ))}
      {home.has_cards ? (
        <>
          <TotalRow label={t('home.cashTotal')} value={home.cash_total} />
          <TotalRow label={t('home.cardsTotal')} value={home.cards_total} />
          <TotalRow label={t('home.netTotal')} value={home.net_total} strong />
        </>
      ) : (
        <TotalRow label={t('home.total')} value={home.net_total} strong />
      )}
    </ul>
  )
}

function AccountRow({ account, month }: { account: BalanceAccount; month: string }) {
  return (
    <li className="flex gap-3 px-3.5 py-3">
      <AccountAvatar name={account.name} bank={account.bank} />
      <div className="min-w-0 flex-1">
        <div className="flex min-h-10 items-center justify-between gap-3">
          <span className="truncate text-[15px] font-medium">{account.name}</span>
          <Money value={account.current_balance} className="text-[15px] font-semibold" />
        </div>
        {account.card ? <CardDetails card={account.card} account={account} month={month} /> : null}
      </div>
    </li>
  )
}

function CardDetails({ card, account, month }: { card: CardStatus; account: BalanceAccount; month: string }) {
  const t = useT()
  const lang = useLang()
  const st = card.statement ? statementLine(card.statement, lang) : null
  const canPay = card.owed > 0
  return (
    <div className="mt-0.5 space-y-1.5 pb-0.5">
      {card.limit ? (
        <>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t('home.available', { available: formatMoney(card.available), limit: formatMoney(card.limit) })}
          </p>
          <ProgressBar
            value={card.used_pct ?? 0}
            max={100}
            status={asLevel(card.used_level)}
            label={`${t('home.limitUsed')}: ${account.name}`}
          />
        </>
      ) : null}
      {st || canPay ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {st ? <p className={cn('text-xs tabular-nums', TONE[st.tone])}>{st.text}</p> : <span />}
          {canPay ? (
            <Link
              to={{ pathname: '/transfers', search: `?pay_card=${account.id}&month=${month}` }}
              aria-label={t('home.payCardLabel', { name: account.name })}
              className="-my-2 inline-flex h-9 items-center rounded-full px-2 text-[13px] font-semibold text-primary hover:underline"
            >
              {t('home.payCard')}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function TotalRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <li
      className={cn(
        'flex min-h-12 items-center justify-between gap-3 px-3.5 py-2.5',
        strong && 'bg-muted/40',
      )}
    >
      <span className={cn('text-sm', strong ? 'font-semibold' : 'text-muted-foreground')}>{label}</span>
      <Money value={value} className={cn('text-[15px]', strong ? 'font-bold' : 'font-semibold')} />
    </li>
  )
}
