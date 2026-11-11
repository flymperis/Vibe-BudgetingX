/** Income vs expenses per month (Recharts; lazy-loaded by YearlyPage). */
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLocale, useT } from '@/i18n'
import { formatMoney } from '@/lib/money'

export interface YearlyChartPoint {
  month: number
  label: string
  income: number
  expenses: number
}

const INCOME = 'var(--chart-2)'
const EXPENSES = 'var(--chart-3)'

export default function YearlyChart({ points }: { points: YearlyChartPoint[] }) {
  const t = useT()
  const locale = useLocale()
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })

  return (
    <figure>
      <figcaption className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm" style={{ background: INCOME }} />
          {t('yearly.income')}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm" style={{ background: EXPENSES }} />
          {t('yearly.expenses')}
        </span>
      </figcaption>
      <div className="h-52 md:h-64" role="img" aria-label={t('yearly.chartLabel')}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            barGap={2}
            barCategoryGap="22%"
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
            <YAxis
              width={52}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              tickFormatter={(v: number) => compact.format(v)}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
              contentStyle={{
                background: 'var(--popover)',
                color: 'var(--popover-foreground)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                fontSize: 12,
              }}
              labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              formatter={(_value, name, item) => {
                const p = item.payload as YearlyChartPoint
                return name === 'income'
                  ? [formatMoney(p.income), t('yearly.income')]
                  : [formatMoney(p.expenses), t('yearly.expenses')]
              }}
            />
            <Bar dataKey="income" name="income" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="expenses" name="expenses" fill={EXPENSES} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
