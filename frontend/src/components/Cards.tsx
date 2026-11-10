import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Money } from './Money'

/** Plain app card (rounded, hairline border, soft shadow in light mode). */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl border bg-card p-4 shadow-card', className)}>{children}</div>
}

export interface HeroPill {
  label: string
  value: number | null | undefined
  signed?: boolean
}

export interface HeroCardProps {
  label: string
  amount: number | null | undefined
  pills?: HeroPill[]
  /** Extra content under the pills. */
  children?: ReactNode
  className?: string
}

/** The big balance card on top of Home (theme-coloured). */
export function HeroCard({ label, amount, pills, children, className }: HeroCardProps) {
  return (
    <div className={cn('rounded-3xl bg-hero p-5 text-hero-foreground', className)}>
      <p className="text-[13px] opacity-80">{label}</p>
      <p className="mt-1 mb-4 text-[34px] leading-tight font-bold tracking-tight">
        <Money value={amount} tone="none" />
      </p>
      {pills?.length ? (
        <div className="flex gap-2.5">
          {pills.map((p) => (
            <div key={p.label} className="min-w-0 flex-1 rounded-xl bg-white/15 px-3 py-2.5">
              <p className="truncate text-[11px] opacity-80">{p.label}</p>
              <p className="truncate text-[15px] font-semibold">
                <Money value={p.value} signed={p.signed} tone="none" />
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  )
}

export interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  className?: string
}

/** Small figure card for dashboards (label, big value, hint). */
export function StatCard({ label, value, hint, icon: Icon, className }: StatCardProps) {
  return (
    <div className={cn('rounded-2xl border bg-card p-4 shadow-card', className)}>
      <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
        <span className="truncate">{label}</span>
        {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      </div>
      <div className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  )
}
