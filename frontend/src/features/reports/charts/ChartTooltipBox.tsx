import type { ReactNode } from 'react'

/** The floating box of a chart tooltip (theme colours, readable on touch). */
export function ChartTooltipBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-40 rounded-xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      <p className="mb-1 font-semibold">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

/** One "● Label ...... value" line inside a tooltip. */
export function TooltipLine({ color, label, value }: { color?: string; label: string; value: ReactNode }) {
  return (
    <p className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {color ? <span aria-hidden className="size-2 rounded-full" style={{ background: color }} /> : null}
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </p>
  )
}
