import { useState } from 'react'
import type { Schema } from '@/api/types'
import { cn } from '@/lib/utils'

type Bank = Schema<'BankBadge'>

const SIZES = {
  sm: 'size-5 rounded-md text-[9px]',
  md: 'size-10 rounded-xl text-[13px]',
} as const

/**
 * Square avatar of an account (old `account_avatar` macro): the bank's logo or
 * its brand-coloured badge when the name matches a known bank, else the first
 * letter (or nothing when `fallback` is false).
 */
export function AccountAvatar({
  name,
  bank,
  size = 'md',
  fallback = true,
  className,
}: {
  name: string
  bank?: Bank | null
  size?: keyof typeof SIZES
  fallback?: boolean
  className?: string
}) {
  const [logoFailed, setLogoFailed] = useState(false)
  const base = cn('grid shrink-0 place-items-center overflow-hidden font-bold', SIZES[size], className)
  if (bank?.logo && !logoFailed) {
    return (
      <span aria-hidden title={bank.name} className={cn(base, 'border bg-white')}>
        <img
          src={bank.logo}
          alt=""
          loading="lazy"
          className="size-full object-contain p-0.5"
          onError={() => setLogoFailed(true)}
        />
      </span>
    )
  }
  if (bank) {
    return (
      <span
        aria-hidden
        title={bank.name}
        className={cn(base, bank.label.length > 2 && 'text-[10px] tracking-tight')}
        // Brand colours come from the server's bank table, not the theme.
        style={{ background: bank.bg, color: bank.fg }}
      >
        {bank.label}
      </span>
    )
  }
  if (!fallback) return null
  return (
    <span aria-hidden className={cn(base, 'bg-muted text-foreground uppercase')}>
      {(name || '?').charAt(0)}
    </span>
  )
}
