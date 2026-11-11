import { CalendarX2 } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { useBootstrap } from '@/bootstrap/bootstrap'
import { StatCard } from '@/components/Cards'
import { formatPercent, monthNominative } from '@/components/insights/format'
import { EmptyState } from '@/components/EmptyState'
import { ListGroup, ListRow, SectionHeader } from '@/components/ListGroup'
import { Money } from '@/components/Money'
import { CardSkeleton, ListSkeleton } from '@/components/skeletons'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLang, useT } from '@/i18n'
import { amountClass, formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useOverview, type CashFlowMonth } from './api'
import BalanceChart from './charts/BalanceChart'
import CashFlowChart from './charts/CashFlowChart'
import { Hint, ReportCard, ReportError } from './ReportParts'
import { parseAccountParam, useReportYear } from './year'
import { YearSwitcher } from './YearSwitcher'

const present = (v: number | null | undefined): v is number => v !== null && v !== undefined

/** /reports/overview: the year's cash flow, what you hold, bank balance, month by month. */
export default function ReportsOverviewPage() {
  const t = useT()
  const lang = useLang()
  const boot = useBootstrap()
  const { year, setYear, currentYear } = useReportYear()
  const [params, setParams] = useSearchParams()
  const account = parseAccountParam(
    params.get('account'),
    boot.accounts.map((a) => a.id),
  )
  const setAccount = (value: string) =>
    setParams(
      (p) => {
        const copy = new URLSearchParams(p)
        if (value === 'all') copy.delete('account')
        else copy.set('account', value)
        return copy
      },
      { replace: true },
    )
  const query = useOverview(year, account)
  const data = query.data
  const accountName = account === null ? t('reports.allAccounts') : (data?.account_label ?? '')
  const cf = data?.cash_flow

  return (
    <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <YearSwitcher year={year} onChange={setYear} className="-ml-2" />
        <Select value={account === null ? 'all' : String(account)} onValueChange={setAccount}>
          <SelectTrigger aria-label={t('common.account')} className="h-11! max-w-56 rounded-xl px-3 md:h-9!">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('reports.allAccounts')}</SelectItem>
            {boot.accounts.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isPending ? (
        <div role="status" aria-live="polite" className="space-y-4">
          <span className="sr-only">{t('common.loading')}</span>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
          <CardSkeleton className="h-64" />
          <ListSkeleton rows={4} />
        </div>
      ) : query.isError || !data || !cf ? (
        <ReportError onRetry={() => void query.refetch()} />
      ) : (
        <>
          <h2 className="sr-only">{t('reports.overviewTitle', { year })}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label={t('reports.income')}
              value={<Money value={cf.total_income} />}
              hint={
                present(cf.avg_income)
                  ? t('reports.perActiveMonth', { amount: formatMoney(cf.avg_income) })
                  : undefined
              }
            />
            <StatCard
              label={t('reports.spendingLabel')}
              value={<Money value={cf.total_expenses} />}
              hint={
                present(cf.avg_expenses)
                  ? t('reports.perActiveMonth', { amount: formatMoney(cf.avg_expenses) })
                  : undefined
              }
            />
            <StatCard
              label={t('reports.netSaved')}
              value={<Money value={cf.total_net} signed />}
              hint={t('reports.netSavedHint')}
            />
            <StatCard
              label={t('reports.savingsRate')}
              value={
                present(cf.savings_rate) ? (
                  <span className={amountClass(cf.savings_rate)}>{formatPercent(cf.savings_rate, lang)}</span>
                ) : (
                  <span className="amount-zero">—</span>
                )
              }
              hint={present(cf.savings_rate) ? t('reports.savingsRateHint') : t('reports.noIncome')}
            />
          </div>

          <SectionHeader title={t('reports.cashFlowTitle')} />
          <ReportCard>
            <Hint>{t('reports.cashFlowHint')}</Hint>
            {data.cash_flow_chart.has_data ? (
              <CashFlowChart chart={data.cash_flow_chart} year={year} />
            ) : (
              <EmptyState icon={CalendarX2} title={t('reports.nothingInYear', { year })} className="py-8" />
            )}
            {cf.best_month && cf.worst_month ? (
              <p className="mt-3 border-t pt-3 text-[13px] text-muted-foreground">
                {t('reports.bestWorst', {
                  best: monthNominative(year, cf.best_month.month, lang),
                  bestNet: formatMoney(cf.best_month.net, { signed: true }),
                  worst: monthNominative(year, cf.worst_month.month, lang),
                  worstNet: formatMoney(cf.worst_month.net, { signed: true }),
                })}
              </p>
            ) : null}
          </ReportCard>

          <SectionHeader title={t('reports.whatYouHold')} />
          <Hint className="mx-0.5">
            {t('reports.holdHint', {
              account: accountName,
              when: year === currentYear ? t('reports.todaysPrices') : t('reports.endOfYear', { year }),
            })}
          </Hint>
          <ListGroup label={t('reports.whatYouHold')}>
            <ListRow
              title={t('reports.bank')}
              subtitle={accountName}
              amount={data.bank_balance}
              amountProps={{ tone: 'all' }}
            />
            <ListRow title={t('reports.crypto')} subtitle="EUR" amount={data.crypto_value} amountProps={{ tone: 'all' }} />
            <ListRow
              title={t('reports.stocks')}
              subtitle={t('reports.quotedInUsd')}
              amount={data.stock_value}
              amountProps={{ tone: 'all', currency: '$' }}
            />
          </ListGroup>
          <Hint className="mx-0.5 mt-2">{t('reports.notSummed')}</Hint>

          <SectionHeader title={t('reports.bankBalanceTitle', { year })} />
          <ReportCard>
            <Hint>{t('reports.bankBalanceHint', { account: accountName })}</Hint>
            <BalanceChart
              chart={data.bank_chart}
              year={year}
              baseline={data.bank_baseline}
              caption={t('reports.bankBalanceCaption', { year })}
            />
          </ReportCard>

          <SectionHeader title={t('reports.monthByMonth')} />
          <MonthRows months={cf.months} year={year} />
        </>
      )}
    </div>
  )
}

function MonthRows({ months, year }: { months: CashFlowMonth[]; year: number }) {
  const t = useT()
  const lang = useLang()
  const active = months.filter((m) => m.active)
  if (!active.length)
    return (
      <div className="rounded-2xl border bg-card shadow-card">
        <EmptyState icon={CalendarX2} title={t('reports.nothingInYear', { year })} className="py-8" />
      </div>
    )
  return (
    <ListGroup label={t('reports.monthByMonth')}>
      {active.map((m) => (
        <ListRow
          key={m.month}
          title={monthNominative(year, m.month, lang)}
          subtitle={
            <span className="flex flex-wrap gap-x-3">
              <span>
                {t('reports.income')} <Money value={m.income} tone="none" className="amount-pos" />
              </span>
              <span>
                {t('reports.spendingLabel')} <Money value={m.expenses} tone="none" className="amount-neg" />
              </span>
            </span>
          }
          amount={m.net}
          amountProps={{ tone: 'all', signed: true }}
        />
      ))}
    </ListGroup>
  )
}
