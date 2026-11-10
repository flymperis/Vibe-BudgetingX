import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ChipOption<T extends string | number> {
  value: T
  label: ReactNode
  /** Leading icon or emoji. */
  icon?: ReactNode
  disabled?: boolean
}

export interface ChipPickerProps<T extends string | number> {
  options: ChipOption<T>[]
  value: T | null | undefined
  onChange: (value: T) => void
  /** Accessible name of the group (the visible field label). */
  label: string
  /** Id of a visible label element (preferred over `label` when one exists). */
  labelledBy?: string
  /** Let the row scroll to the screen edges inside padded containers. */
  bleed?: boolean
  className?: string
}

/**
 * Single-select chips in one horizontally scrollable row (category, account,
 * day pickers). Keyboard: arrows move and select, like a radio group.
 */
export function ChipPicker<T extends string | number>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  bleed = false,
  className,
}: ChipPickerProps<T>) {
  const rowRef = useRef<HTMLDivElement>(null)
  const selectedIndex = options.findIndex((o) => o.value === value)

  // Keep the selected chip visible (e.g. when a form opens with a value preset).
  useEffect(() => {
    const el = rowRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [value])

  const focusAndPick = (index: number) => {
    const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0)
    if (!enabled.length) return
    const pos = enabled.indexOf(index)
    const target = pos >= 0 ? index : enabled[0]
    onChange(options[target].value)
    rowRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[target]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0)
    const current = enabled.indexOf(selectedIndex >= 0 ? selectedIndex : enabled[0])
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(current + 1) % enabled.length]
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = enabled[(current - 1 + enabled.length) % enabled.length]
    else if (e.key === 'Home') next = enabled[0]
    else if (e.key === 'End') next = enabled[enabled.length - 1]
    if (next !== null && next !== undefined) {
      e.preventDefault()
      focusAndPick(next)
    }
  }

  return (
    <div
      ref={rowRef}
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className={cn(
        'no-scrollbar flex gap-2 overflow-x-auto py-0.5',
        bleed && '-mx-[18px] scroll-px-[18px] px-[18px]',
        className,
      )}
    >
      {options.map((o, i) => {
        const checked = o.value === value
        const focusable = checked || (selectedIndex < 0 && i === 0)
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={o.disabled}
            tabIndex={focusable ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              'disabled:opacity-50',
              checked
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-muted',
            )}
          >
            {o.icon ? (
              <span aria-hidden className="-ml-0.5 inline-flex [&_svg]:size-4">
                {o.icon}
              </span>
            ) : null}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
