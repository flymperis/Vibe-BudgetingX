import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router'
import { useToday } from '@/bootstrap/bootstrap'
import { StatCard } from '@/components/Cards'
import { EmptyState } from '@/components/EmptyState'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { CardSkeleton } from '@/components/skeletons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLang, useT } from '@/i18n'
import { monthNameOf, monthShortName } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { chartPoints, MAX_YEAR, MIN_YEAR, parseYear, useYearly, type Yearly } from './api'

const YearlyChart = lazy(() => import('./YearlyChart'))

const pad = (m: number) => String(m).padStart(2, '0')

export default function YearlyPage() {
  const t = useT()
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const currentYear = Number(today.slice(0, 4))
  const year = parseYear(params.get('year'), currentYear)
  const query = useYearly(year)

  const setYear = (y: number) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (y === currentYear) next.delete('year')
        else next.set('year', String(y))
        return next
      },
      { replace: true },
    )

  return (
    <>
      <PageHeader title={t('nav.yearly')} />
      <div className="mb-3 -ml-2 flex items-center gap-1" role="group" aria-label={t('yearly.year')}>
        <Button
          variant="ghost"
          size="icon-touch"
          onClick={() => setYear(year - 1)}
          disabled={year <= MIN_YEAR}
          aria-label={t('month.previousYear')}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <span className="min-w-20 text-center text-base font-semibold tabular-nums" aria-live="polite">
          {year}
        </span>
        <Button
          variant="ghost"
          size="icon-touch"
          onClick={() => setYear(year + 1)}
          disabled={year >= MAX_YEAR}
          aria-label={t('month.nextYear')}
        >
          <ChevronRight aria-hidden />
        </Button>
        {year !== currentYear ? (
          <Button
            variant="secondary"
            size="sm"
            className="ml-1 h-9 rounded-full px-3"
            onClick={() => setYear(currentYear)}
          >
            {t('yearly.thisYear')}
          </Button>
        ) : null}
      </div>

      {query.isPending ? (
        <div role="status" aria-live="polite" className="space-y-4">
          <span className="sr-only">{t('common.loading')}</span>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton className="col-span-2 md:col-span-1" />
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={CalendarRange}
          title={t('errors.loadFailed')}
          action={
            <Button size="touch" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <YearlyBody data={query.data} currentMonth={today.slice(0, 7)} stale={query.isPlaceholderData} />
      )}
    </>
  )
}

function deltaClass(v: number) {
  return v > 0 ? 'text-positive' : v < 0 ? 'text-negative' : 'text-muted-foreground'
}

function YearlyBody({ data, currentMonth, stale }: { data: Yearly; currentMonth: string; stale: boolean }) {
  const t = useT()
  const lang = useLang()
  const ym = (m: number) => `${data.year}-${pad(m)}`
  const empty = data.rows.every((r) => r.income === 0 && r.expenses === 0)

  return (
    <div className={cn('transition-opacity', stale && 'opacity-60')}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label={t('yearly.totalIncome')} value={<Money value={data.total_income} tone="none" />} />
        <StatCard
          label={t('yearly.totalExpenses')}
          value={<Money value={data.total_expenses} tone="none" />}
        />
        <StatCard
          className="col-span-2 md:col-span-1"
          label={t('yearly.totalDelta')}
          value={
            <Money value={data.total_delta} signed className={deltaClass(data.total_delta)} tone="none" />
          }
          hint={t('yearly.deltaHint')}
        />
      </div>

      <div className="mt-4 rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="mb-2 text-[15px] font-semibold">{t('yearly.chartTitle')}</h2>
        {empty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('yearly.noData')}</p>
        ) : (
          <Suspense fallback={<Skeleton className="h-52 w-full rounded-xl md:h-64" />}>
            <YearlyChart points={chartPoints(data.rows, (m) => monthShortName(ym(m), lang))} />
          </Suspense>
        )}
      </div>

      <h2 className="mx-0.5 mt-6 mb-2.5 text-[17px] font-semibold">{t('yearly.byMonth')}</h2>
      <div
        className="overflow-x-auto rounded-2xl border bg-card shadow-card"
        tabIndex={0}
        role="region"
        aria-label={t('yearly.tableLabel', { year: data.year })}
      >
        <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th
                scope="col"
                className="sticky left-0 z-10 border-b bg-card px-3.5 py-2.5 text-left font-medium"
              >
                {t('yearly.month')}
              </th>
              <th scope="col" className="border-b px-3 py-2.5 text-right font-medium">
                {t('yearly.income')}
              </th>
              <th scope="col" className="border-b px-3 py-2.5 text-right font-medium">
                {t('yearly.expenses')}
              </th>
              <th scope="col" className="border-b px-3 py-2.5 text-right font-medium">
                {t('yearly.delta')}
              </th>
              <th scope="col" className="border-b px-3.5 py-2.5 text-right font-medium">
                {t('yearly.totalBalance')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const isCurrent = ym(r.month) === currentMonth
              return (
                <tr
                  key={r.month}
                  className={cn(isCurrent && 'font-semibold')}
                  aria-current={isCurrent ? 'date' : undefined}
                >
                  <th
                    scope="row"
                    className={cn(
                      'sticky left-0 z-10 border-b px-3.5 py-3 text-left font-medium',
                      isCurrent ? 'bg-muted' : 'bg-card',
                    )}
                  >
                    {monthNameOf(r.month, lang)}
                  </th>
                  <td className={cn('border-b px-3 py-3 text-right', isCurrent && 'bg-muted')}>
                    <Money value={r.income} tone="none" />
                  </td>
                  <td className={cn('border-b px-3 py-3 text-right', isCurrent && 'bg-muted')}>
                    <Money value={r.expenses} tone="none" />
                  </td>
                  <td
                    className={cn(
                      'border-b px-3 py-3 text-right',
                      deltaClass(r.delta),
                      isCurrent && 'bg-muted',
                    )}
                  >
                    <Money value={r.delta} tone="none" />
                  </td>
                  <td className={cn('border-b px-3.5 py-3 text-right', isCurrent && 'bg-muted')}>
                    <Money value={r.total_balance} tone="none" />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <th scope="row" className="sticky left-0 z-10 bg-muted px-3.5 py-3 text-left backdrop-blur">
                {t('common.total')}
              </th>
              <td className="bg-muted px-3 py-3 text-right">
                <Money value={data.total_income} tone="none" />
              </td>
              <td className="bg-muted px-3 py-3 text-right">
                <Money value={data.total_expenses} tone="none" />
              </td>
              <td className={cn('bg-muted px-3 py-3 text-right', deltaClass(data.total_delta))}>
                <Money value={data.total_delta} tone="none" />
              </td>
              <td className="bg-muted px-3.5 py-3 text-right text-muted-foreground">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
