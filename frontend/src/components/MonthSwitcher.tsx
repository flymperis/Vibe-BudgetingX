import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMonth } from '@/hooks/useMonth'
import { useLang, useT } from '@/i18n'
import { currentMonth, monthFromParts, monthLabel, monthShortName } from '@/lib/dates'
import { cn } from '@/lib/utils'

export interface MonthSwitcherProps {
  /** Controlled use; defaults to the URL month from useMonth(). */
  month?: string
  onChange?: (month: string) => void
  className?: string
}

/** ‹ Νοέμβριος 2026 › with a month/year picker behind the label. */
export function MonthSwitcher({ month: controlled, onChange, className }: MonthSwitcherProps) {
  const url = useMonth()
  const month = controlled ?? url.month
  const setMonth = onChange ?? url.setMonth
  const t = useT()
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => Number(month.slice(0, 4)))

  const shift = (delta: number) => {
    const y = Number(month.slice(0, 4))
    const m = Number(month.slice(5, 7)) - 1 + delta
    setMonth(monthFromParts(y + Math.floor(m / 12), ((m % 12) + 12) % 12))
  }
  const today = currentMonth()

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <Button variant="ghost" size="icon-touch" onClick={() => shift(-1)} aria-label={t('month.previous')}>
        <ChevronLeft aria-hidden />
      </Button>
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) setYear(Number(month.slice(0, 4)))
          setOpen(o)
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="touch"
            className="min-w-36 px-3 text-base font-semibold"
            aria-label={`${t('month.pick')}: ${monthLabel(month, lang)}`}
          >
            {monthLabel(month, lang)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 rounded-2xl p-3" align="center">
          <div className="mb-2 flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setYear((y) => y - 1)}
              aria-label={t('month.previousYear')}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <span className="text-sm font-semibold tabular-nums" aria-live="polite">
              {year}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setYear((y) => y + 1)}
              aria-label={t('month.nextYear')}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => {
              const value = monthFromParts(year, i)
              const selected = value === month
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  aria-label={monthLabel(value, lang)}
                  onClick={() => {
                    setMonth(value)
                    setOpen(false)
                  }}
                  className={cn(
                    'h-10 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                    !selected && value === today && 'ring-1 ring-primary/50',
                  )}
                >
                  {monthShortName(value, lang)}
                </button>
              )
            })}
          </div>
          {month !== today ? (
            <Button
              variant="secondary"
              className="mt-2 h-9 w-full"
              onClick={() => {
                setMonth(today)
                setOpen(false)
              }}
            >
              {t('month.current')}
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="icon-touch" onClick={() => shift(1)} aria-label={t('month.next')}>
        <ChevronRight aria-hidden />
      </Button>
    </div>
  )
}
