import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Small uppercase label above a control (as in the mockup's sheets).
 * For inputs pass `htmlFor`; for chip pickers give the label an `id` and pass
 * it to the picker's `labelledBy`.
 */
export function FieldLabel({
  children,
  htmlFor,
  id,
  className,
}: {
  children: ReactNode
  htmlFor?: string
  id?: string
  className?: string
}) {
  const cls = cn(
    'mx-0.5 mt-4 mb-2 block text-xs font-semibold tracking-wide text-muted-foreground uppercase',
    className,
  )
  return htmlFor ? (
    <label htmlFor={htmlFor} id={id} className={cls}>
      {children}
    </label>
  ) : (
    <div id={id} className={cls}>
      {children}
    </div>
  )
}

/** Inline validation / server `detail` message under a field or form. */
export function FieldError({ children, id }: { children?: ReactNode; id?: string }) {
  if (!children) return null
  return (
    <p id={id} role="alert" className="mt-2 text-sm font-medium text-negative">
      {children}
    </p>
  )
}

/** Key/value line in detail sheets ("Κατηγορία ..... Καφές"). */
export function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 text-[15px] last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  )
}
