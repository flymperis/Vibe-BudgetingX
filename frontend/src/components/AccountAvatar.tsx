import { useState } from 'react'
import type { Schema } from '@/api/types'
import { cn } from '@/lib/utils'

type BankBadge = Schema<'BankBadge'>

const SIZES = {
  xs: 'size-5 rounded-md text-[9px]',
  sm: 'size-8 rounded-[10px] text-[11px]',
  md: 'size-10 rounded-xl text-[13px]',
} as const

export interface AccountAvatarProps {
  name: string
  /** Bank detected by the server from the account name (old `detect_bank`). */
  bank?: BankBadge | null
  size?: keyof typeof SIZES
  /** Without a known bank: show the first letter (true) or nothing (false), as the old macro. */
  fallback?: boolean
  className?: string
}

/**
 * Square account avatar as in the old app: the bank's logo, else its
 * brand-coloured short label, else the first letter of the name.
 * The brand colours come from the server (data, not theme colours).
 */
export function AccountAvatar({ name, bank, size = 'md', fallback = true, className }: AccountAvatarProps) {
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
        className={cn(base, bank.label.length > 2 && 'tracking-tight')}
        style={{ backgroundColor: bank.bg, color: bank.fg }}
      >
        <span className={cn(bank.label.length > 2 && size !== 'md' && 'text-[0.8em]')}>{bank.label}</span>
      </span>
    )
  }
  if (!fallback) return null
  return (
    <span aria-hidden className={cn(base, 'bg-muted text-foreground')}>
      {(name || '?').charAt(0).toLocaleUpperCase()}
    </span>
  )
}
