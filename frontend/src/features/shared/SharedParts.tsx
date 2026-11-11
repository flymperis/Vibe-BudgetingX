/** Small building blocks of the Shared screens. */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

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

/** Muted explanatory line. */
export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mx-0.5 mt-2 text-[13px] text-muted-foreground', className)}>{children}</p>
}
