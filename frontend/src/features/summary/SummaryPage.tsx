import { Table2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { AccountBalancesList, BalanceScopeHint } from '@/components/AccountBalancesList'
import { HeroCard } from '@/components/Cards'
import { CategoryIcon, IconTile } from '@/components/CategoryIcon'
import { EmptyState } from '@/components/EmptyState'
import { ListGroup, ListRow, SectionHeader } from '@/components/ListGroup'
import { Money } from '@/components/Money'
import { MonthSwitcher } from '@/components/MonthSwitcher'
import { PageHeader } from '@/components/PageHeader'
import { CardSkeleton, ListSkeleton } from '@/components/skeletons'
import { Button } from '@/components/ui/button'
import { useMonth } from '@/hooks/useMonth'
import { useT } from '@/i18n'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useSummary, type Summary } from './api'

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

      <SectionHeader title={t('accounts.balances')} />
      <AccountBalancesList
        accounts={data.accounts}
        totals={data}
        hasCards={data.has_cards}
        payTo={(a) => ({ pathname: '/transfers', search: `?pay_card=${a.id}&month=${data.month}` })}
        empty={<p className="mx-1 text-sm text-muted-foreground">{t('accounts.none')}</p>}
      />
      {data.accounts.length ? (
        <BalanceScopeHint
          throughToday={data.balance_scope === 'today'}
          asOf={data.balance_as_of}
          className="mt-2"
        />
      ) : null}
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
