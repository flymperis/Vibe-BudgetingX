import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import type { Schema } from '@/api/types'
import { ProgressBar } from '@/components/ProgressBar'
import { useT } from '@/i18n'
import type { BudgetStatus } from '@/lib/budget'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

const STATUS_TEXT: Record<BudgetStatus, string> = {
  ok: 'text-muted-foreground',
  warn: 'text-warning',
  over: 'text-negative',
}

/**
 * The server lists over-budget lines by name; the "Everything else" line is
 * named by vbx.core.budget in English (`name: "Everything else"`), so show
 * the translated label for it (Budget and Summary use `category_id: null`).
 */
const CORE_OTHER_NAME = 'Everything else'
const overName = (name: string, t: ReturnType<typeof useT>) =>
  name === CORE_OTHER_NAME ? t('budget.everythingElse') : name

/** The old Home budget card: spent of budget, left / over, bar, over-budget names. */
export function HomeBudgetCard({ card, month }: { card: Schema<'HomeBudgetCard'>; month: string }) {
  const t = useT()
  const status: BudgetStatus = (['ok', 'warn', 'over'] as const).includes(card.total_status as BudgetStatus)
    ? (card.total_status as BudgetStatus)
    : 'ok'
  return (
    <Link
      to={{ pathname: '/budget', search: `?month=${month}` }}
      className="mt-3.5 block rounded-2xl border bg-card p-4 shadow-card transition-colors outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold">{t('home.budget')}</span>
        <span className="flex items-center gap-1 text-[13px] text-muted-foreground tabular-nums">
          {t('home.budgetOf', {
            spent: formatMoney(card.total_spent),
            budget: formatMoney(card.total_budget),
          })}
          <ChevronRight aria-hidden className="size-4" />
        </span>
      </div>
      <ProgressBar value={card.total_pct} max={100} status={status} label={t('home.budgetUsed')} showIcon />
      <p className={cn('mt-2 text-[13px] font-medium tabular-nums', STATUS_TEXT[status])}>
        {card.total_remaining < 0
          ? t('home.budgetOver', { amount: formatMoney(-card.total_remaining) })
          : t('home.budgetLeft', { amount: formatMoney(card.total_remaining) })}
      </p>
      {card.over.length ? (
        <p className="mt-1 text-xs text-negative">
          {t('home.budgetOverNames', { names: card.over.map((n) => overName(n, t)).join(', ') })}
        </p>
      ) : null}
    </Link>
  )
}
