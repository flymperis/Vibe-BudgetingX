/** Small building blocks of the Shared screens. */
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { initial } from './labels'

/** Round initial (people). */
export function Avatar({ name, me = false, className }: { name: string; me?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full text-[15px] font-semibold',
        me ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        className,
      )}
    >
      {initial(name)}
    </span>
  )
}

/** Small pill next to a name (@login, invited, shared…). */
export function Tag({
  children,
  tone = 'muted',
}: {
  children: ReactNode
  tone?: 'muted' | 'warn' | 'primary'
}) {
  return (
    <span
      className={cn(
        'ml-1.5 inline-flex h-5 max-w-full shrink-0 items-center truncate rounded-full px-2 align-middle text-[11px] font-medium',
        tone === 'warn' && 'bg-warning/15 text-warning',
        tone === 'primary' && 'bg-primary/10 text-primary',
        tone === 'muted' && 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

export interface ToggleChipOption {
  value: number
  label: ReactNode
}

/** Multi-select chips (checkbox semantics), wrapping onto several lines. */
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

/** Muted explanatory line. */
export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mx-0.5 mt-2 text-[13px] text-muted-foreground', className)}>{children}</p>
}
