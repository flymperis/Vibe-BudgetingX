import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, type To } from 'react-router'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  title: string
  /** Small line above the title (e.g. the month). */
  eyebrow?: ReactNode
  /** Right side: buttons, avatar. */
  actions?: ReactNode
  /** Shows a back link (sub-pages on mobile). */
  backTo?: To
  className?: string
}

/** Large-title header of a screen (iOS style). Renders the page's <h1>. */
export function PageHeader({ title, eyebrow, actions, backTo, className }: PageHeaderProps) {
  const t = useT()
  useDocumentTitle(title)
  return (
    <header className={cn('mb-4 flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {backTo ? (
          <Link
            to={backTo}
            className="mb-1 -ml-1.5 inline-flex h-8 items-center gap-0.5 rounded-md pr-2 text-sm font-medium text-primary"
          >
            <ChevronLeft aria-hidden className="size-5" />
            {t('common.back')}
          </Link>
        ) : null}
        {eyebrow ? <div className="text-[13px] text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="truncate text-[30px] leading-tight font-bold tracking-tight">{title}</h1>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
