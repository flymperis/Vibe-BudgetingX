import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ToggleChipOption {
  value: number
  label: ReactNode
}

/**
 * Multi-select chips (checkbox semantics), wrapping onto several lines.
 * For a single choice use `ChipPicker`.
 */
export function ToggleChips({
  options,
  selected,
  onToggle,
  labelledBy,
}: {
  options: ToggleChipOption[]
  selected: number[]
  onToggle: (value: number) => void
  labelledBy?: string
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onToggle(o.value)}
            className={cn(
              'inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-colors outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              on
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card hover:bg-muted',
            )}
          >
            {on ? <Check aria-hidden className="-ml-1 size-4" /> : null}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
