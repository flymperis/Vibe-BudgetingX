import { SectionHeader } from '@/components/ListGroup'
import { CardSkeleton } from '@/components/skeletons'
import { useT } from '@/i18n'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useReportInvestments } from './api'
import BalanceChart from './charts/BalanceChart'
import { Hint, ReportCard, ReportError } from './ReportParts'
import { useReportYear } from './year'
import { YearSwitcher } from './YearSwitcher'

/** /reports/investments: month-end value of the crypto (EUR) and stock (USD) portfolios. */
export default function ReportsInvestmentsPage() {
  const t = useT()
  const { year, setYear } = useReportYear()
  const query = useReportInvestments(year)
  const data = query.data
  return (
    <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')}>
      <YearSwitcher year={year} onChange={setYear} className="mb-1 -ml-2" />
      {query.isPending ? (
        <div role="status" aria-live="polite" className="space-y-4">
          <span className="sr-only">{t('common.loading')}</span>
          <CardSkeleton className="h-72" />
          <CardSkeleton className="h-72" />
        </div>
      ) : query.isError || !data ? (
        <ReportError onRetry={() => void query.refetch()} />
      ) : (
        <>
          <h2 className="sr-only">{t('reports.portfoliosTitle', { year })}</h2>
          <SectionHeader
            className="mt-3"
            title={t('reports.cryptoHeading', { value: formatMoney(data.crypto_value) })}
          />
          <ReportCard>
            <Hint>{t('reports.cryptoChartHint')}</Hint>
            <BalanceChart
              chart={data.crypto_chart}
              year={year}
              baseline={data.crypto_baseline}
              caption={t('reports.cryptoChartCaption', { year })}
            />
          </ReportCard>
          <SectionHeader
            title={t('reports.stocksHeading', { value: formatMoney(data.stock_value, { currency: '$' }) })}
          />
          <ReportCard>
            <Hint>{t('reports.stocksChartHint')}</Hint>
            <BalanceChart
              chart={data.stock_chart}
              year={year}
              currency="$"
              baseline={data.stock_baseline}
              caption={t('reports.stocksChartCaption', { year })}
            />
          </ReportCard>
        </>
      )}
    </div>
  )
}
