import { CreditCard } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, type To } from 'react-router'
import type { Schema } from '@/api/types'
import { AccountAvatar } from '@/components/AccountAvatar'
import { Money } from '@/components/Money'
import { ProgressBar } from '@/components/ProgressBar'
import { Button } from '@/components/ui/button'
import { useLang, useT } from '@/i18n'
import type { BudgetStatus } from '@/lib/budget'
import { fullDateLabel } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { statementLine, type StatementTone } from '@/lib/statement'
import { cn } from '@/lib/utils'

/** What a row needs: /api/home, /api/summary and /api/accounts all return at least this. */
export type BalanceAccount = Schema<'BalanceAccount'> & { can_pay?: boolean }

export interface BalanceTotals {
  cash_total: number
  cards_total: number
  net_total: number
}

export interface AccountBalancesListProps<A extends BalanceAccount> {
  accounts: A[]
  totals: BalanceTotals
  /** With any credit card the total splits into cash & bank, cards and net. */
  hasCards: boolean
  /** "Pay card" opens the transfer sheet (Transfers screen)… */
  onPay?: (account: A) => void
  /** …or links to it (Home, Summary: `/transfers?pay_card=<id>&month=`). */
  payTo?: (account: A) => To
  /** Makes each row a button (e.g. open the account's edit sheet). */
  onSelect?: (account: A) => void
  /** Shown instead of the list when there are no accounts. */
  empty?: ReactNode
  className?: string
}

const STATEMENT_TONE: Record<StatementTone, string> = {
  muted: 'text-muted-foreground',
  positive: 'text-positive',
  warning: 'text-warning',
  negative: 'text-negative font-medium',
  default: 'text-muted-foreground',
}

const LEVELS: BudgetStatus[] = ['ok', 'warn', 'over']
const asLevel = (v: string): BudgetStatus => (LEVELS.includes(v as BudgetStatus) ? (v as BudgetStatus) : 'ok')

const rowCls = 'flex w-full min-h-14 items-center gap-3 px-3.5 py-2.5 text-left'
const interactive =
  'cursor-pointer outline-none transition-colors hover:bg-muted/60 active:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

/** A card can be paid when something is owed (the server's `can_pay` when it sent one). */
const canPay = (a: BalanceAccount) => a.can_pay ?? (a.card?.owed ?? 0) > 0

/**
 * The account balances block of the old Home / Transfer panels (macro
 * `account_balances_list`): every account with its bank avatar and balance;
 * credit cards add the limit left, a usage bar, the last statement and "Pay";
 * with any card the total splits into cash & bank, cards and net.
 */
export function AccountBalancesList<A extends BalanceAccount>({
  accounts,
  totals,
  hasCards,
  onPay,
  payTo,
  onSelect,
  empty,
  className,
}: AccountBalancesListProps<A>) {
  const t = useT()
  if (!accounts.length && empty) return <>{empty}</>
  return (
    <ul
      aria-label={t('accounts.balances')}
      className={cn(
        'divide-y divide-border overflow-hidden rounded-2xl border bg-card shadow-card',
        className,
      )}
    >
      {accounts.map((a) => (
        <AccountBalanceRow key={a.id} account={a} onPay={onPay} payTo={payTo} onSelect={onSelect} />
      ))}
      {hasCards ? (
        <>
          <TotalRow label={t('accounts.cashTotal')} value={totals.cash_total} />
          <TotalRow label={t('accounts.cardsTotal')} value={totals.cards_total} />
          <TotalRow label={t('accounts.netTotal')} value={totals.net_total} strong />
        </>
      ) : accounts.length ? (
        <TotalRow label={t('accounts.total')} value={totals.net_total} strong />
      ) : null}
    </ul>
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
      <Money value={value} animate className={cn('text-[15px]', strong ? 'font-bold' : 'font-semibold')} />
    </li>
  )
}

function AccountBalanceRow<A extends BalanceAccount>({
  account: a,
  onPay,
  payTo,
  onSelect,
}: {
  account: A
  onPay?: (a: A) => void
  payTo?: (a: A) => To
  onSelect?: (a: A) => void
}) {
  const t = useT()
  const lang = useLang()
  const card = a.card
  const st = card?.statement ? statementLine(card.statement, lang) : null
  const pay = (onPay || payTo) && canPay(a)
  const main: ReactNode = (
    <>
      <AccountAvatar name={a.name} bank={a.bank} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] leading-snug font-medium">{a.name}</span>
          {a.is_credit_card ? (
            <CreditCard
              aria-label={t('accounts.creditCard')}
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          ) : null}
        </span>
        {card?.limit ? (
          <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
            {t('accounts.availableOf', {
              available: formatMoney(card.available),
              limit: formatMoney(card.limit),
            })}
          </span>
        ) : null}
      </span>
      <Money value={a.current_balance} animate className="shrink-0 text-[15px] font-semibold" />
    </>
  )
  const payLabel = t('accounts.payCardLabel', { name: a.name })
  const payClass = 'h-11 shrink-0 rounded-full px-4'
  const payButton = !pay ? null : payTo ? (
    <Button asChild size="sm" variant="secondary" className={payClass}>
      <Link to={payTo(a)} aria-label={payLabel}>
        {t('accounts.payCard')}
      </Link>
    </Button>
  ) : (
    <Button
      size="sm"
      variant="secondary"
      className={payClass}
      aria-label={payLabel}
      onClick={() => onPay?.(a)}
    >
      {t('accounts.payCard')}
    </Button>
  )

  const extra =
    card && (card.limit || st || payButton) ? (
      <div className="-mt-1 space-y-2 pr-3.5 pb-3 pl-[66px]">
        {card.limit ? (
          <ProgressBar
            value={card.used_pct ?? 0}
            max={100}
            status={asLevel(card.used_level)}
            label={t('accounts.limitUsed', { name: a.name })}
          />
        ) : null}
        {st || payButton ? (
          <div className="flex items-center justify-between gap-3">
            {st ? (
              <p className={cn('min-w-0 text-xs tabular-nums', STATEMENT_TONE[st.tone])}>{st.text}</p>
            ) : (
              <span />
            )}
            {payButton}
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

/** "Balances through today" / "Balances as of 30 November 2026" under (or over) the list. */
export function BalanceScopeHint({
  throughToday,
  asOf,
  className,
}: {
  throughToday: boolean
  /** YYYY-MM-DD the balances are computed through. */
  asOf: string
  className?: string
}) {
  const t = useT()
  const lang = useLang()
  return (
    <p className={cn('mx-1 text-xs text-muted-foreground', className)}>
      {throughToday
        ? t('accounts.scopeToday')
        : t('accounts.scopeMonthEnd', { date: fullDateLabel(asOf, lang, '0000-00-00') })}
    </p>
  )
}
