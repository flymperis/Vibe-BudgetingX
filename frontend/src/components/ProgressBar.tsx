import { AlertTriangle, CircleAlert } from 'lucide-react'
import { budgetPercent, budgetStatus, type BudgetStatus } from '@/lib/budget'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

export interface ProgressBarProps {
  value: number
  max: number
  /** Overrides the computed status (default: old budget rule, warn at 80%, over above 100%). */
  status?: BudgetStatus
  /** Accessible name, e.g. "Σούπερ μάρκετ". */
  label?: string
  /** Show a small warning icon next to the bar for warn/over (meaning without colour). */
  showIcon?: boolean
  className?: string
}

const FILL: Record<BudgetStatus, string> = {
  ok: 'bg-primary',
  warn: 'bg-warning',
  over: 'bg-negative',
}

export function ProgressBar({ value, max, status, label, showIcon = false, className }: ProgressBarProps) {
  const t = useT()
  const s = status ?? budgetStatus(value, max)
  const pct = budgetPercent(value, max)
  const statusText = t(s === 'ok' ? 'progress.ok' : s === 'warn' ? 'progress.warn' : 'progress.over')
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={`${Math.round((max > 0 ? value / max : 0) * 100)}% · ${statusText}`}
        data-status={s}
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 ease-out', FILL[s])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showIcon && s !== 'ok' ? (
        s === 'over' ? (
          <CircleAlert aria-hidden className="size-4 shrink-0 text-negative" />
        ) : (
          <AlertTriangle aria-hidden className="size-4 shrink-0 text-warning" />
        )
      ) : null}
    </div>
  )
}
