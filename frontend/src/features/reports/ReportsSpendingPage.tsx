import { ReceiptText } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { formatPercent } from '@/components/insights/format'
import { SectionHeader } from '@/components/ListGroup'
import { Money } from '@/components/Money'
import { CardSkeleton, ListSkeleton } from '@/components/skeletons'
import { useLang, useT } from '@/i18n'
import { monthShortName } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useSpending, type Spending } from './api'
import { monthKey } from './charts/theme'
import { Hint, RankRow, ReportError } from './ReportParts'
import { useReportYear } from './year'
import { YearSwitcher } from './YearSwitcher'

/** /reports/spending: category ranking and the category × month table for the year. */
export default function ReportsSpendingPage() {
  const t = useT()
  const { year, setYear } = useReportYear()
  const query = useSpending(year)
  const data = query.data

  return (
    <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')}>
      <YearSwitcher year={year} onChange={setYear} className="-ml-2 mb-3" />
      {query.isPending ? (
        <div role="status" aria-live="polite" className="space-y-4">
          <span className="sr-only">{t('common.loading')}</span>
          <ListSkeleton rows={6} />
          <CardSkeleton className="h-48" />
        </div>
      ) : query.isError || !data ? (
        <ReportError onRetry={() => void query.refetch()} />
      ) : (
        <>
          <h2 className="sr-only">{t('reports.spendingTitle', { year })}</h2>
          <Ranking data={data} />
          <SectionHeader title={t('reports.pivotTitle')} />
          <Pivot data={data} />
        </>
      )}
    </div>
  )
}

function Ranking({ data }: { data: Spending }) {
  const t = useT()
  const lang = useLang()
  const { categories: c, year } = data
  if (!c.rows.length)
    return (
      <div className="rounded-2xl border bg-card shadow-card">
        <EmptyState icon={ReceiptText} title={t('reports.noExpensesInYear', { year })} className="py-8" />
      </div>
    )
  return (
    <>
      <Hint className="mx-0.5">
        {c.has_previous
          ? t('reports.rankingHintCompare', { prev: c.prev_year })
          : t('reports.rankingHint')}
      </Hint>
      <ol aria-label={t('reports.ranking')} className="divide-y overflow-hidden rounded-2xl border bg-card shadow-card">
        {c.rows.map((row) => (
          <RankRow
            key={row.name}
            name={row.name}
            amount={<Money value={row.total} />}
            barPercent={row.share}
            meta={
              <>
                <span>{t('reports.shareOfSpending', { share: formatPercent(row.share, lang) })}</span>
                {row.delta !== null && row.delta !== undefined ? (
                  <span>
                    <Money value={row.delta} signed /> {t('reports.vsYear', { year: c.prev_year })}
                  </span>
                ) : c.has_previous ? (
                  <span className="rounded-md bg-primary/10 px-1.5 py-px font-medium text-primary">
                    {t('reports.newThisYear')}
                  </span>
                ) : null}
              </>
            }
          />
        ))}
      </ol>
    </>
  )
}

function Pivot({ data }: { data: Spending }) {
  const t = useT()
  const lang = useLang()
  const p = data.expense_pivot
  if (!p.rows.length)
    return (
      <div className="rounded-2xl border bg-card shadow-card">
        <EmptyState icon={ReceiptText} title={t('reports.noExpensesInYear', { year: data.year })} className="py-8" />
      </div>
    )
  // Headers come as "01.Jan"; the month number gives the localized name.
  const months = p.month_headers.map((_, i) => monthShortName(monthKey(data.year, i + 1), lang))
  const sticky = 'sticky left-0 z-10 bg-card'
  const num = 'px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums'
  const avgTitle =
    p.avg_monthly_total !== null && p.avg_monthly_total !== undefined
      ? t('reports.pivotAvgTitle', { count: p.active_month_count })
      : undefined
  return (
    <>
      <Hint className="mx-0.5">{t('reports.pivotHint')}</Hint>
      <div
        className="overflow-x-auto rounded-2xl border bg-card shadow-card"
        role="region"
        aria-label={t('reports.pivotTitle')}
        tabIndex={0}
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="text-xs tracking-wide text-muted-foreground uppercase">
              <th scope="col" className={cn(sticky, 'border-r border-b px-3 py-2 text-left font-semibold')}>
                {t('common.category')}
              </th>
              {months.map((m) => (
                <th key={m} scope="col" className={cn(num, 'border-b font-semibold')}>
                  {m}
                </th>
              ))}
              <th scope="col" className={cn(num, 'border-b border-l bg-muted/40 font-semibold')}>
                {t('common.total')}
              </th>
              <th scope="col" className={cn(num, 'border-b bg-muted/40 font-semibold')}>
                {t('reports.avg')}
              </th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((row) => (
              <tr key={row.name} className="[&>*]:border-b">
                <th
                  scope="row"
                  className={cn(sticky, 'max-w-36 truncate border-r px-3 py-2.5 text-left font-medium')}
                  title={row.name}
                >
                  {row.name}
                </th>
                {row.months.map((v, i) => (
                  <td key={i} className={num}>
                    {v !== 0 ? <Money value={v} tone="positive" /> : null}
                  </td>
                ))}
                <td className={cn(num, 'border-l bg-muted/40 font-semibold')}>
                  <Money value={row.total} tone="positive" />
                </td>
                <td className={cn(num, 'bg-muted/40')}>
                  {row.avg !== null && row.avg !== undefined ? <Money value={row.avg} tone="positive" /> : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <th scope="row" className={cn(sticky, 'border-r px-3 py-2.5 text-left')}>
                {t('reports.grandTotal')}
              </th>
              {p.month_totals.map((v, i) => (
                <td key={i} className={num}>
                  <Money value={v} tone="positive" />
                </td>
              ))}
              <td className={cn(num, 'border-l bg-muted/40')}>
                <Money value={p.grand_total} tone="positive" />
              </td>
              <td className={cn(num, 'bg-muted/40')} title={avgTitle}>
                {p.avg_monthly_total !== null && p.avg_monthly_total !== undefined ? (
                  <Money value={p.avg_monthly_total} tone="positive" />
                ) : null}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {avgTitle ? <p className="mx-0.5 mt-2 text-xs text-muted-foreground">{t('reports.avg')}: {avgTitle}</p> : null}
    </>
  )
}
