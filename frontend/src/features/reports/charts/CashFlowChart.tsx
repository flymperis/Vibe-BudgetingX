import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { formatAxisMoney } from '@/lib/format'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useLang, useT } from '@/i18n'
import { monthNameOf, monthShortName } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import type { CashFlowChartData } from '../api'
import { ChartTooltipBox, TooltipLine } from './ChartTooltipBox'
import { AXIS_TICK, CHART, monthKey } from './theme'

interface Row {
  month: string
  short: string
  income: number | null
  expenses: number | null
  net: number
  /** The net line skips months without activity (API's has_net_point). */
  netPoint: number | null
}

/**
 * Income bars above zero, spending bars below, net as a line: the series and
 * the y range come from the API (old cash_flow_chart_spec).
 */
export default function CashFlowChart({ chart, year }: { chart: CashFlowChartData; year: number }) {
  const t = useT()
  const lang = useLang()
  const isDesktop = useIsDesktop()
  const rows: Row[] = chart.months.map((m) => ({
    month: monthNameOf(m.month, lang),
    short: monthShortName(monthKey(year, m.month), lang),
    income: m.income !== 0 ? m.income : null,
    expenses: m.expenses !== 0 ? m.expenses : null,
    net: m.net,
    netPoint: m.has_net_point ? m.net : null,
  }))
  const domain: [number, number] = [chart.y_min ?? 0, chart.y_max ?? 0]
  // Ticks at the API's bounds and at zero.
  const ticks = Array.from(new Set([domain[0], 0, domain[1]])).filter((v) => v >= domain[0] && v <= domain[1])

  const renderTooltip = ({ active, payload }: TooltipContentProps<ValueType, NameType>) => {
    const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined
    if (!row) return null
    return (
      <ChartTooltipBox title={row.month}>
        <TooltipLine color={CHART.income} label={t('reports.income')} value={formatMoney(row.income ?? 0)} />
        <TooltipLine
          color={CHART.spending}
          label={t('reports.spendingLabel')}
          value={formatMoney(row.expenses ?? 0)}
        />
        <TooltipLine
          color={CHART.net}
          label={t('reports.net')}
          value={formatMoney(row.net, { signed: true })}
        />
      </ChartTooltipBox>
    )
  }

  return (
    <figure>
      <figcaption className="sr-only">{t('reports.cashFlowCaption', { year })}</figcaption>
      <div
        className="h-60 w-full md:h-72 [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none"
        role="img"
        aria-label={t('reports.cashFlowCaption', { year })}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="short"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              // Phones show every other month so the labels never collide.
              interval={isDesktop ? 0 : 1}
              tickMargin={6}
            />
            <YAxis
              domain={domain}
              ticks={ticks}
              allowDataOverflow
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v: number) => formatAxisMoney(v, '€', lang)}
            />
            <ReferenceLine y={0} stroke={CHART.axis} strokeOpacity={0.6} />
            <Tooltip
              content={renderTooltip}
              cursor={{ fill: CHART.cursor, opacity: 0.6 }}
              isAnimationActive={false}
            />
            <Bar dataKey="income" fill={CHART.income} radius={[3, 3, 0, 0]} maxBarSize={14} />
            <Bar dataKey="expenses" fill={CHART.spending} radius={[3, 3, 0, 0]} maxBarSize={14} />
            <Line
              dataKey="netPoint"
              type="linear"
              stroke={CHART.net}
              strokeWidth={2}
              dot={{ r: 3.5, fill: CHART.net, stroke: CHART.surface, strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: CHART.surface, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm" style={{ background: CHART.income }} />
          {t('reports.income')}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm" style={{ background: CHART.spending }} />
          {t('reports.spendingLabel')}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3 rounded" style={{ background: CHART.net }} />
          {t('reports.net')}
        </li>
      </ul>
    </figure>
  )
}
