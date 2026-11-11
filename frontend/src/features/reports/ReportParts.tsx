import { RefreshCw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'

/** Card around a chart or a block of a report. */
export function ReportCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-2xl border bg-card p-4 shadow-card', className)}>{children}</div>
}

/** Small explanatory text (the old "small-hint" lines). */
export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mb-3 text-[13px] leading-snug text-muted-foreground', className)}>{children}</p>
}

export function ReportError({ onRetry }: { onRetry: () => void }) {
  const t = useT()
  return (
    <EmptyState
      icon={TriangleAlert}
      title={t('errors.loadFailed')}
      action={
        <Button size="touch" onClick={onRetry}>
          <RefreshCw aria-hidden />
          {t('common.retry')}
        </Button>
      }
    />
  )
}

/** Ranking row: name, amount, a share bar and a meta line (spending categories, tag categories). */
export function RankRow({
  name,
  amount,
  barPercent,
  meta,
}: {
  name: ReactNode
  amount: ReactNode
  /** 0-100; negative shares are drawn as an empty bar. */
  barPercent: number
  meta: ReactNode
}) {
  const width = Math.min(100, Math.max(0, barPercent))
  return (
    <li className="px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] font-medium">{name}</span>
        <span className="shrink-0 text-[15px] font-semibold">{amount}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {meta}
      </div>
    </li>
  )
}
