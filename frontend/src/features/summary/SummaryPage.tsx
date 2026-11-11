import { Table2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useToday } from '@/bootstrap/bootstrap'
import { HeroCard } from '@/components/Cards'
import { CategoryIcon, IconTile } from '@/components/CategoryIcon'
import { EmptyState } from '@/components/EmptyState'
import { ListGroup, ListRow } from '@/components/ListGroup'
import { Money } from '@/components/Money'
import { MonthSwitcher } from '@/components/MonthSwitcher'
import { PageHeader } from '@/components/PageHeader'
import { CardSkeleton, ListSkeleton } from '@/components/skeletons'
import { Button } from '@/components/ui/button'
import { useMonth } from '@/hooks/useMonth'
import { useLang, useT } from '@/i18n'
import { fullDateLabel } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useSummary, type BalanceAccount, type Summary } from './api'

export default function SummaryPage() {
  const t = useT()
  const { month } = useMonth()
  const query = useSummary(month)

  return (
    <>
      <PageHeader title={t('nav.summary')} />
      <MonthSwitcher className="mb-3 -ml-2" />
      {query.isPending ? (
        <div role="status" aria-live="polite" className="space-y-4">
          <span className="sr-only">{t('common.loading')}</span>
          <CardSkeleton className="h-40" />
          <ListSkeleton rows={4} />
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={Table2}
          title={t('errors.loadFailed')}
          action={
            <Button size="touch" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <SummaryBody data={query.data} />
      )}
    </>
  )
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <li className="px-3.5 py-4 text-center text-sm text-muted-foreground">{children}</li>
}

function SummaryBody({ data }: { data: Summary }) {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const budget = data.budget ?? null

  return (
    <>
      <HeroCard
        label={t('summary.netBalance')}
        amount={data.net_total}
        pills={[
          { label: t('summary.totalIncome'), value: data.total_income },
          { label: t('summary.totalExpenses'), value: data.total_expenses },
        ]}
      >
        <p className="mt-3 text-xs opacity-80">{t('summary.netBalanceHint')}</p>
      </HeroCard>

      <div className="mt-6 grid gap-6 md:grid-cols-2 md:items-start [&>*]:min-w-0">
        <ListGroup header={t('summary.income')} headerAside={<Money value={data.total_income} tone="none" />}>
          {data.income_breakdown.length ? (
            data.income_breakdown.map((row) => (
              <ListRow
                key={row.category_name}
                icon={<CategoryIcon name={row.category_name} size="sm" />}
                title={row.category_name}
                amount={row.total_amount}
              />
            ))
          ) : (
            <EmptyRow>{t('summary.noIncome')}</EmptyRow>
          )}
        </ListGroup>

        <ListGroup
          header={t('summary.expenses')}
          headerAside={<Money value={data.total_expenses} tone="none" />}
        >
          {budget ? (
            budget.rows.length || budget.unbudgeted.length || budget.other ? (
              <>
                {budget.rows.map((row) => (
                  <ExpenseBudgetRow
                    key={row.category_id}
                    name={row.name}
                    spent={row.spent}
                    budget={row.budget}
                    left={row.remaining}
                  />
                ))}
                {budget.unbudgeted.map((row) => (
                  <ExpenseBudgetRow
                    key={`u${row.category_id}`}
                    name={row.name}
                    spent={row.spent}
                    budget={null}
                    left={null}
                  />
                ))}
                {budget.other ? (
                  <ExpenseBudgetRow
                    name={t('budget.everythingElse')}
                    isOther
                    spent={budget.other.spent}
                    budget={budget.other.budget}
                    left={budget.other.remaining}
                  />
                ) : null}
              </>
            ) : (
              <EmptyRow>{t('summary.noExpenses')}</EmptyRow>
            )
          ) : data.expense_breakdown.length ? (
            data.expense_breakdown.map((row) => (
              <ListRow
                key={row.category_name}
                icon={<CategoryIcon name={row.category_name} size="sm" />}
                title={row.category_name}
                amount={row.total_amount}
                amountProps={{ tone: 'none' }}
              />
            ))
          ) : (
            <EmptyRow>{t('summary.noExpenses')}</EmptyRow>
          )}
        </ListGroup>
      </div>

      <ListGroup
        className="mt-6"
        header={t('summary.balances')}
        headerAside={
          <span className="text-xs text-muted-foreground">
            {data.balance_scope === 'today'
              ? t('summary.balancesToday')
              : t('summary.balancesAt', { date: fullDateLabel(data.balance_as_of, lang, today) })}
          </span>
        }
      >
        {data.accounts.length ? (
          <>
            {data.accounts.map((a) => (
              <AccountRow key={a.id} account={a} />
            ))}
            {data.has_cards ? (
              <>
                <ListRow
                  title={t('summary.cashTotal')}
                  amount={data.cash_total}
                  amountProps={{ tone: 'all' }}
                  className="min-h-12 bg-muted/40"
                />
                <ListRow
                  title={t('summary.cardsTotal')}
                  amount={data.cards_total}
                  amountProps={{ tone: 'all' }}
                  className="min-h-12 bg-muted/40"
                />
              </>
            ) : null}
            <ListRow
              title={<span className="font-semibold">{t('summary.netTotal')}</span>}
              amount={data.net_total}
              amountProps={{ tone: 'all' }}
              className="min-h-12 bg-muted/40"
            />
          </>
        ) : (
          <EmptyRow>{t('summary.noAccounts')}</EmptyRow>
        )}
      </ListGroup>
    </>
  )
}

function ExpenseBudgetRow({
  name,
  spent,
  budget,
  left,
  isOther,
}: {
  name: string
  spent: number
  budget: number | null
  left: number | null
  isOther?: boolean
}) {
  const t = useT()
  return (
    <li className="flex min-h-14 items-center gap-3 px-3.5 py-2.5">
      {isOther ? <IconTile size="sm">…</IconTile> : <CategoryIcon name={name} size="sm" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-snug font-medium">{name}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
          {budget === null ? (
            t('summary.noBudget')
          ) : (
            <>
              {t('summary.budgetOf', { amount: formatMoney(budget) })} ·{' '}
              <span
                className={cn(
                  left !== null && left < 0 && 'text-negative',
                  left !== null && left > 0 && 'text-positive',
                )}
              >
                {t('summary.leftOf', { amount: formatMoney(left) })}
              </span>
            </>
          )}
        </span>
      </span>
      <Money value={spent} tone="none" className="text-[15px] font-semibold" />
    </li>
  )
}

function AccountRow({ account }: { account: BalanceAccount }) {
  const t = useT()
  const card = account.card
  return (
    <ListRow
      icon={<IconTile tone="muted">{account.name.charAt(0).toUpperCase()}</IconTile>}
      title={account.name}
      subtitle={
        card?.limit != null
          ? t('summary.cardAvailable', {
              available: formatMoney(card.available),
              limit: formatMoney(card.limit),
            })
          : account.bank?.name
      }
      amount={account.current_balance}
      amountProps={{ tone: 'all' }}
    />
  )
}
