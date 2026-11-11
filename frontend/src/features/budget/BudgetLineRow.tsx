import { ChevronRight, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { CategoryIcon, IconTile } from '@/components/CategoryIcon'
import { ProgressBar } from '@/components/ProgressBar'
import { useT } from '@/i18n'
import type { BudgetStatus } from '@/lib/budget'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { BudgetLine } from './api'
import { remainingOf } from './defaults'

const STATUS_TEXT: Record<BudgetStatus, string> = {
  ok: 'text-muted-foreground',
  warn: 'text-warning',
  over: 'text-negative',
}

export interface BudgetLineRowProps {
  name: string
  /** Null: a category without a budget this month (cleared month), shown with dashes. */
  line: BudgetLine | null
  /** "Everything else" line: own icon, no edit. */
  isOther?: boolean
  fixed?: boolean
  /** The month has its own amount for this category. */
  overridden?: boolean
  onClick?: () => void
  /** Accessible name of the button ("Αλλαγή budget για ..."). */
  actionLabel?: string
  icon?: ReactNode
}

/** One budget line: name, spent of budget, what is left (or over), bar. Tap to edit. */
export function BudgetLineRow({
  name,
  line,
  isOther,
  fixed,
  overridden,
  onClick,
  actionLabel,
  icon,
}: BudgetLineRowProps) {
  const t = useT()
  const status = (line?.status ?? 'ok') as BudgetStatus
  const rest = line ? remainingOf(line) : null

  const body = (
    <>
      {icon ?? (isOther ? <IconTile tone="muted">…</IconTile> : <CategoryIcon name={name} />)}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] leading-snug font-medium">{name}</span>
          {fixed ? (
            <Lock aria-label={t('budget.fixed')} className="size-3.5 shrink-0 text-muted-foreground" />
          ) : null}
          {overridden ? (
            <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {t('budget.thisMonthOnly')}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 mb-1.5 flex items-baseline justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground tabular-nums">
            {line
              ? `${formatMoney(line.spent, { currency: '' })} / ${formatMoney(line.budget)}`
              : t('budget.noBudgetThisMonth')}
          </span>
          {rest ? (
            <span className={cn('shrink-0 text-sm font-semibold tabular-nums', STATUS_TEXT[status])}>
              {t(rest.word === 'over' ? 'budget.overAmount' : 'budget.leftAmount', {
                amount: formatMoney(rest.amount),
              })}
            </span>
          ) : (
            <span className="shrink-0 text-sm text-muted-foreground">—</span>
          )}
        </span>
        {line ? (
          <ProgressBar value={line.spent} max={line.budget} status={status} label={name} showIcon />
        ) : (
          <span aria-hidden className="block h-2 rounded-full bg-muted" />
        )}
      </span>
      {onClick && actionLabel ? <span className="sr-only">{actionLabel}</span> : null}
      {onClick ? <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/70" /> : null}
    </>
  )

  const base = 'flex w-full min-h-16 items-center gap-3 px-3.5 py-3 text-left outline-none transition-colors'
  return (
    <li>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={cn(
            base,
            'cursor-pointer hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted',
          )}
        >
          {body}
        </button>
      ) : (
        <div className={base}>{body}</div>
      )}
    </li>
  )
}
