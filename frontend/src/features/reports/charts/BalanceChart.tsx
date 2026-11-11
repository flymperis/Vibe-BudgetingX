import { useId } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { formatAxisMoney, monthNominative } from '@/components/insights/format'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useLang, useT } from '@/i18n'
import { monthShortName } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import type { BalanceChartData } from '../api'
import { ChartTooltipBox, TooltipLine } from './ChartTooltipBox'
import { AXIS_TICK, CHART, monthKey } from './theme'

interface Row {
  month: string
  short: string
  value: number
  change: number
}

export interface BalanceChartProps {
  chart: BalanceChartData
  year: number
  currency?: '€' | '$'
  /** Value before the year (drawn as a dashed line; January's Δ is against it). */
  baseline?: number | null
  caption: string
}

/**
 * Month-end values for a year (bank balance, crypto or stock portfolio) with
 * the y range the API computed (old balance_line_chart_spec): ticks at y_min,
 * y_mid and y_max. Tooltip: the value and its change (Δ) from the month before.
 */
export default function BalanceChart({ chart, year, currency = '€', baseline, caption }: BalanceChartProps) {
  const t = useT()
  const lang = useLang()
  const isDesktop = useIsDesktop()
  const gradientId = useId().replace(/:/g, '')
  const rows: Row[] = chart.points.map((p) => ({
    month: monthNominative(year, p.month_num, lang),
    short: monthShortName(monthKey(year, p.month_num), lang),
    value: p.value,
    change: p.change,
  }))
  const hasRange = chart.y_min !== null && chart.y_max !== null && chart.y_min !== undefined && chart.y_max !== undefined
  const domain: [number, number] = hasRange ? [chart.y_min as number, chart.y_max as number] : [0, 1]
  const ticks = hasRange
    ? [chart.y_min, chart.y_mid, chart.y_max].filter((v): v is number => typeof v === 'number')
    : undefined

  const renderTooltip = ({ active, payload }: TooltipContentProps<ValueType, NameType>) => {
    const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined
    if (!row) return null
    return (
      <ChartTooltipBox title={row.month}>
        <TooltipLine color={CHART.line} label={t('reports.value')} value={formatMoney(row.value, { currency })} />
        <TooltipLine
          label={t('reports.change')}
          value={
            <span className={row.change > 0 ? 'amount-pos' : row.change < 0 ? 'amount-neg' : ''}>
              {formatMoney(row.change, { currency, signed: true })}
            </span>
          }
        />
      </ChartTooltipBox>
    )
  }

  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="h-56 w-full [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none md:h-64" role="img" aria-label={caption}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 10, right: 6, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.line} stopOpacity={0.22} />
                <stop offset="100%" stopColor={CHART.line} stopOpacity={0.02} />
              </linearGradient>
            </defs>
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
              width={56}
              tickFormatter={(v: number) => formatAxisMoney(v, currency, lang)}
            />
            {baseline !== null && baseline !== undefined ? (
              <ReferenceLine
                y={baseline}
                stroke={CHART.baseline}
                strokeDasharray="5 4"
                ifOverflow="hidden"
              />
            ) : null}
            <Tooltip
              content={renderTooltip}
              cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }}
              isAnimationActive={false}
            />
            <Area
              dataKey="value"
              type="linear"
              stroke={CHART.line}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              baseValue={domain[0]}
              dot={{ r: 3, fill: CHART.line, stroke: CHART.surface, strokeWidth: 2 }}
              activeDot={{ r: 5.5, fill: CHART.line, stroke: CHART.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {baseline !== null && baseline !== undefined ? (
        <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden className="w-4 border-t-2 border-dashed border-muted-foreground" />
          {t('reports.baseline', { year: year - 1, value: formatMoney(baseline, { currency }) })}
        </p>
      ) : null}
    </figure>
  )
}
