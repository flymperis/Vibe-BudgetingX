import { ArrowLeftRight, Minus, PiggyBank, Plus, ReceiptText, Table2 } from 'lucide-react'
import { LoadError } from '@/components/LoadError'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useQuickAdd } from '@/app/quick-add'
import { useSession } from '@/auth/session'
import { useToday } from '@/bootstrap/bootstrap'
import { Avatar } from '@/components/Avatar'
import { AccountBalancesList, BalanceScopeHint } from '@/components/AccountBalancesList'
import { HeroCard } from '@/components/Cards'
import { IconTile } from '@/components/CategoryIcon'
import { ListGroup, ListRow, SectionHeader } from '@/components/ListGroup'
import { flattenPages, useEntryList } from '@/components/money/entries'
import { EntryActionSheets } from '@/components/money/EntryActionSheets'
import { TxnRow } from '@/components/money/TxnRow'
import { useEntryActions } from '@/components/money/use-entry-actions'
import { MonthSwitcher } from '@/components/MonthSwitcher'
import { PageHeader } from '@/components/PageHeader'
import { ListSkeleton } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'
import { useMonth, useMonthSearch } from '@/hooks/useMonth'
import { useLang, useT } from '@/i18n'
import { monthLabel } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useHome } from './api'
import { HomeBudgetCard } from './HomeBudgetCard'

const RECENT_COUNT = 5

/** Home (old `_home.html`): the month's net, income and expenses, budget, balances, shortcuts. */
export default function HomePage() {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const { month } = useMonth()
  const search = useMonthSearch()
  const session = useSession()
  const quickAdd = useQuickAdd()
  const home = useHome(month)
  const recent = useEntryList('expense', { month, categoryId: null })
  const recentRows = flattenPages(recent.data).slice(0, RECENT_COUNT)
  const actions = useEntryActions()
  const username = session.data?.user?.username
  const data = home.data

  return (
    <>
      <PageHeader
        title={t('nav.home')}
        eyebrow={monthLabel(month, lang)}
        actions={username ? <Avatar name={username} me /> : null}
      />
      <MonthSwitcher className="mb-2 -ml-2" />

      {data ? (
        <HeroCard
          label={t('home.net')}
          amount={data.net}
          pills={[
            { label: t('home.incomePill'), value: data.total_income },
            { label: t('home.expensesPill'), value: data.total_expenses },
          ]}
          className={cn('transition-opacity', home.isPlaceholderData && 'opacity-70')}
        >
          <p className="mt-3 text-[11px] opacity-75">{t('home.intro')}</p>
        </HeroCard>
      ) : home.isError ? (
        <LoadError onRetry={() => void home.refetch()} className="py-8" />
      ) : (
        <Skeleton className="h-44 w-full rounded-3xl" />
      )}

      <div role="group" aria-label={t('home.quickActions')} className="mt-3.5 grid grid-cols-3 gap-2.5">
        <QuickAction
          icon={<Minus aria-hidden />}
          label={t('home.addExpense')}
          onClick={() => quickAdd.open({ kind: 'expense' })}
        />
        <QuickAction
          icon={<Plus aria-hidden />}
          label={t('home.addIncome')}
          onClick={() => quickAdd.open({ kind: 'income' })}
          tone="positive"
        />
        <QuickAction
          icon={<ArrowLeftRight aria-hidden />}
          label={t('home.transfer')}
          to={`/transfers${search}`}
        />
      </div>

      {data?.budget_card ? <HomeBudgetCard card={data.budget_card} month={data.month} /> : null}

      <SectionHeader title={t('accounts.balances')} />
      {data ? (
        <>
          <AccountBalancesList
            accounts={data.accounts}
            totals={data}
            hasCards={data.has_cards}
            payTo={(a) => ({ pathname: '/transfers', search: `?pay_card=${a.id}&month=${data.month}` })}
            empty={
              <div className="rounded-2xl border bg-card px-4 py-5 text-center text-sm text-muted-foreground shadow-card">
                {t('accounts.none')}{' '}
                <Link
                  to="/settings/accounts"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {t('accounts.add')}
                </Link>
              </div>
            }
          />
          {data.accounts.length ? (
            <BalanceScopeHint
              throughToday={data.balance_scope === 'today'}
              asOf={data.balance_as_of}
              className="mt-2"
            />
          ) : null}
        </>
      ) : home.isError ? null : (
        <ListSkeleton rows={3} />
      )}

      <SectionHeader
        title={t('home.recentExpenses')}
        action={{ label: t('common.seeAll'), to: `/expenses${search}` }}
      />
      {recent.isPending ? (
        <ListSkeleton rows={3} />
      ) : recentRows.length ? (
        <ListGroup label={t('home.recentExpenses')}>
          {recentRows.map((e) => (
            <TxnRow key={e.id} entry={e} today={today} showDay onOpen={actions.open} />
          ))}
        </ListGroup>
      ) : (
        <p className="mx-1 text-sm text-muted-foreground">
          {t('expenses.emptyMonth', { month: monthLabel(month, lang) })}
        </p>
      )}

      <SectionHeader title={t('home.links')} />
      <ListGroup label={t('home.links')}>
        <ListRow
          to={`/expenses${search}`}
          icon={<IconTile icon={ReceiptText} />}
          title={t('home.expenseList')}
        />
        <ListRow to={`/income${search}`} icon={<IconTile icon={PiggyBank} />} title={t('home.incomeList')} />
        <ListRow to={`/summary${search}`} icon={<IconTile icon={Table2} />} title={t('home.summaryLink')} />
      </ListGroup>

      <EntryActionSheets {...actions.sheets} />
    </>
  )
}

function QuickAction({
  icon,
  label,
  onClick,
  to,
  tone,
}: {
  icon: ReactNode
  label: string
  onClick?: () => void
  to?: string
  tone?: 'positive'
}) {
  const cls =
    'flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card text-[13px] font-semibold shadow-card transition-colors outline-none hover:bg-muted/60 active:bg-muted focus-visible:ring-2 focus-visible:ring-ring'
  const body = (
    <>
      <span
        className={cn(
          'grid size-8 place-items-center rounded-full [&_svg]:size-4',
          tone === 'positive' ? 'bg-positive/15 text-positive' : 'bg-primary/10 text-primary',
        )}
      >
        {icon}
      </span>
      {label}
    </>
  )
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  )
}
