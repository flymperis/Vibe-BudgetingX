import type { LucideIcon } from 'lucide-react'
import { createElement, type ReactNode } from 'react'
import { categoryVisual, TONE_CLASSES, type Tone } from '@/lib/category-icon'
import { cn } from '@/lib/utils'

const SIZES = {
  sm: 'size-8 rounded-[10px] [&_svg]:size-4',
  md: 'size-10 rounded-xl [&_svg]:size-5',
  lg: 'size-14 rounded-2xl [&_svg]:size-7',
} as const

export type TileSize = keyof typeof SIZES

export interface IconTileProps {
  icon?: LucideIcon
  /** Any content instead of an icon (emoji, initials). */
  children?: ReactNode
  tone?: Tone | 'muted' | 'primary'
  size?: TileSize
  className?: string
}

/** Rounded square with an icon, used at the start of list rows. */
export function IconTile({ icon: Icon, children, tone = 'muted', size = 'md', className }: IconTileProps) {
  const toneClass =
    tone === 'muted'
      ? 'bg-muted text-foreground'
      : tone === 'primary'
        ? 'bg-primary text-primary-foreground'
        : TONE_CLASSES[tone]
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center text-[19px]', SIZES[size], toneClass, className)}
    >
      {Icon ? <Icon strokeWidth={2} /> : children}
    </span>
  )
}

/** Icon + pastel colour picked deterministically from a category name. */
export function CategoryIcon({
  name,
  size = 'md',
  className,
}: {
  name: string
  size?: TileSize
  className?: string
}) {
  const visual = categoryVisual(name)
  return <IconTile icon={visual.icon} tone={visual.tone} size={size} className={className} />
}

/** Just the category's icon, no tile (chips, compact lists). */
export function CategoryGlyph({ name, className }: { name: string; className?: string }) {
  return createElement(categoryVisual(name).icon, { 'aria-hidden': true, className })
}
