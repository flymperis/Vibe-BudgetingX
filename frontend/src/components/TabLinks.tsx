import { NavLink } from 'react-router'
import { useMonthSearch } from '@/hooks/useMonth'
import { useT, type MessageKey } from '@/i18n'
import { cn } from '@/lib/utils'

/** Segmented sub-navigation between sibling routes (reports, investments). */
export function TabLinks({
  tabs,
  label,
  className,
}: {
  tabs: readonly { path: string; label: MessageKey }[]
  /** Accessible name of the navigation. */
  label: string
  className?: string
}) {
  const t = useT()
  const search = useMonthSearch()
  return (
    <nav
      aria-label={label}
      className={cn('-mx-[18px] mb-4 no-scrollbar overflow-x-auto px-[18px] md:mx-0 md:px-0', className)}
    >
      <ul className="inline-flex min-w-full gap-1 rounded-xl bg-muted p-1 md:min-w-0">
        {tabs.map((tab) => (
          <li key={tab.path} className="flex-1 md:flex-none">
            <NavLink
              to={{ pathname: tab.path, search }}
              className={({ isActive }) =>
                cn(
                  'flex h-9 items-center justify-center rounded-lg px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors outline-none',
                  'focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {t(tab.label)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
