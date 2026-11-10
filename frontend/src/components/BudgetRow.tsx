import { formatMoney } from '@/lib/money'
import { CategoryIcon } from './CategoryIcon'
import { ProgressBar } from './ProgressBar'

/** Category icon + name + "spent / budget" + bar (Home, Budget, Reports). */
export function BudgetRow({ name, spent, budget }: { name: string; spent: number; budget: number }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <CategoryIcon name={name} />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatMoney(spent)} / {formatMoney(budget)}
          </span>
        </div>
        <ProgressBar value={spent} max={budget} label={name} showIcon />
      </div>
    </div>
  )
}
