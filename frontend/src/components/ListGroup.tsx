import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, type To } from 'react-router'
import { cn } from '@/lib/utils'
import { Money, type MoneyProps } from './Money'

export interface ListGroupProps {
  children: ReactNode
  /** Small uppercase heading above the group (day headings, sections). */
  header?: ReactNode
  /** Right side of the heading (e.g. the day's total). */
  headerAside?: ReactNode
  label?: string
  className?: string
}

/** A rounded card holding rows separated by hairlines (iOS grouped list). */
export function ListGroup({ children, header, headerAside, label, className }: ListGroupProps) {
  return (
    <section className={className}>
      {header ? (
        <div className="mx-1 mb-2 flex items-center justify-between gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <h3>{header}</h3>
          {headerAside ? <div className="normal-case">{headerAside}</div> : null}
        </div>
      ) : null}
      <ul
        aria-label={label}
        className="divide-y divide-border overflow-hidden rounded-2xl border bg-card shadow-card"
      >
        {children}
      </ul>
    </section>
  )
}

export interface ListRowProps {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Amount on the right, formatted with <Money>. */
  amount?: number | null
  amountProps?: Omit<MoneyProps, 'value'>
  /** Anything else on the right (badge, switch), shown before the amount. */
  trailing?: ReactNode
  /** Show a chevron (defaults to true for links). */
  chevron?: boolean
  onClick?: () => void
  to?: To
  /** Accessible name when the visible title is not enough. */
  label?: string
  className?: string
}

const rowBase =
  'flex w-full min-h-14 items-center gap-3 px-3.5 py-2.5 text-left outline-none transition-colors'
const interactive =
  'cursor-pointer hover:bg-muted/60 active:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

/** One row: icon tile, title, subtitle, trailing amount, optional chevron. Use inside <ListGroup>. */
export function ListRow({
  icon,
  title,
  subtitle,
  amount,
  amountProps,
  trailing,
  chevron,
  onClick,
  to,
  label,
  className,
}: ListRowProps) {
  const showChevron = chevron ?? !!to
  const content = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-snug font-medium">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
      {trailing}
      {amount !== undefined ? (
        <Money
          value={amount}
          tone="positive"
          {...amountProps}
          className={cn('text-[15px] font-semibold', amountProps?.className)}
        />
      ) : null}
      {showChevron ? <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/70" /> : null}
    </>
  )
  return (
    <li>
      {to ? (
        <Link to={to} className={cn(rowBase, interactive, className)} aria-label={label}>
          {content}
        </Link>
      ) : onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={cn(rowBase, interactive, className)}
          aria-label={label}
        >
          {content}
        </button>
      ) : (
        <div className={cn(rowBase, className)}>{content}</div>
      )}
    </li>
  )
}

/** Heading above a card or list, with an optional "see all" link. */
export function SectionHeader({
  title,
  action,
  className,
}: {
  title: ReactNode
  action?: { label: string; to: To }
  className?: string
}) {
  return (
    <div className={cn('mx-0.5 mt-6 mb-2.5 flex items-baseline justify-between', className)}>
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {action ? (
        <Link to={action.to} className="rounded-sm px-1 text-sm font-medium text-primary hover:underline">
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}
