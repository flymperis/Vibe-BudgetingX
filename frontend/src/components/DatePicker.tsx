import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { el } from 'react-day-picker/locale/el'
import { enGB } from 'react-day-picker/locale/en-GB'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useLang } from '@/i18n'
import { fullDateLabel, parseISODate, toISODate, todayISO } from '@/lib/dates'
import { cn } from '@/lib/utils'

export interface DatePickerProps {
  /** "YYYY-MM-DD" */
  value: string
  onChange: (value: string) => void
  id?: string
  /** Accessible name when there is no <label htmlFor={id}>. */
  label?: string
  className?: string
}

/** Button showing the date; opens a calendar. Value is an ISO day string. */
export function DatePicker({ value, onChange, id, label, className }: DatePickerProps) {
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const selected = parseISODate(value) ?? undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label={label ? `${label}: ${fullDateLabel(value, lang, todayISO())}` : undefined}
          className={cn(
            'flex h-11 w-full items-center gap-2 rounded-xl border border-input bg-card px-3 text-left text-base outline-none md:h-9 md:rounded-lg md:text-sm',
            'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            className,
          )}
        >
          <CalendarDays aria-hidden className="size-4 text-muted-foreground" />
          {fullDateLabel(value, lang, '0000-00-00')}
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
  )
}
