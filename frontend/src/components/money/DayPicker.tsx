import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { el } from 'react-day-picker/locale/el'
import { enGB } from 'react-day-picker/locale/en-GB'
import { ChipPicker } from '@/components/ChipPicker'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useLang, useT } from '@/i18n'
import { fullDateLabel, parseISODate, relativeDayLabel, toISODate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { recentDays } from './entry-form'

/**
 * Day of an entry: chips for today and the three days before, plus a calendar
 * button for any other date (the chosen date then shows as a chip).
 */
export function DayPicker({
  value,
  onChange,
  today,
  labelledBy,
  bleed,
}: {
  value: string
  onChange: (day: string) => void
  today: string
  labelledBy: string
  bleed?: boolean
}) {
  const t = useT()
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const days = recentDays(today)
  const options = days.map((d) => ({ value: d, label: relativeDayLabel(d, lang, today) }))
  if (value && !days.includes(value)) options.push({ value, label: fullDateLabel(value, lang, today) })
  const selected = parseISODate(value) ?? undefined

  return (
    <div className={cn('flex items-center gap-2', bleed && '-mr-[18px]')}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-vaul-no-drag
            aria-label={t('money.pickDate')}
            className="grid size-11 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring md:size-9"
          >
            <CalendarDays aria-hidden className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto rounded-2xl p-1" align="start">
          <Calendar
            mode="single"
            locale={lang === 'el' ? el : enGB}
            weekStartsOn={1}
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              if (d) onChange(toISODate(d))
              setOpen(false)
            }}
            className="[--cell-size:--spacing(10)] md:[--cell-size:--spacing(8)]"
          />
        </PopoverContent>
      </Popover>
      <ChipPicker
        labelledBy={labelledBy}
        label={t('common.day')}
        value={value}
        onChange={onChange}
        options={options}
        className={cn('min-w-0 flex-1', bleed && 'pr-[18px]')}
      />
    </div>
  )
}
