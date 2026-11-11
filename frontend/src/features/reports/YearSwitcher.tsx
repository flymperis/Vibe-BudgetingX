import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { MAX_YEAR, MIN_YEAR } from './year'

const YEARS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MAX_YEAR - i)

/** ‹ 2026 › with a list of every year (2000–2100) behind the label. */
export function YearSwitcher({
  year,
  onChange,
  className,
}: {
  year: number
  onChange: (year: number) => void
  className?: string
}) {
  const t = useT()
  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <Button
        variant="ghost"
        size="icon-touch"
        onClick={() => onChange(year - 1)}
        disabled={year <= MIN_YEAR}
        aria-label={t('reports.previousYear')}
      >
        <ChevronLeft aria-hidden />
      </Button>
      <Select value={String(year)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger
          aria-label={t('reports.pickYear')}
          className="h-11! min-w-24 justify-center rounded-xl border-0 bg-transparent px-3 text-base font-semibold tabular-nums shadow-none hover:bg-muted dark:bg-transparent [&>svg]:hidden"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {YEARS.map((y) => (
            <SelectItem key={y} value={String(y)} className="tabular-nums">
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon-touch"
        onClick={() => onChange(year + 1)}
        disabled={year >= MAX_YEAR}
        aria-label={t('reports.nextYear')}
      >
        <ChevronRight aria-hidden />
      </Button>
    </div>
  )
}
