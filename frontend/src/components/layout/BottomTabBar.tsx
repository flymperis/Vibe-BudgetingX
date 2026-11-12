import { BarChart3, Ellipsis, Home, Plus, ReceiptText, type LucideIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { MORE_ITEMS } from '@/app/nav'
import { useQuickAdd } from '@/app/quick-add'
import { useMonthSearch } from '@/hooks/useMonth'
import { useT, type MessageKey } from '@/i18n'
import { cn } from '@/lib/utils'
import { directionBetween, setNavDirection } from '@/lib/view-transition'

interface Tab {
  to: string
  label: MessageKey
  icon: LucideIcon
  end?: boolean
  /** Extra path prefixes that light this tab up. */
  alsoActive?: string[]
}

const LEFT: Tab[] = [
  { to: '/', label: 'nav.home', icon: Home, end: true },
  { to: '/expenses', label: 'nav.expenses', icon: ReceiptText },
]
const RIGHT: Tab[] = [
  { to: '/reports', label: 'nav.reports', icon: BarChart3 },
  { to: '/more', label: 'nav.more', icon: Ellipsis, alsoActive: MORE_ITEMS.map((i) => i.path) },
]

const TABS = [...LEFT, ...RIGHT]

const isOn = (tab: Tab, pathname: string) =>
  tab.end
    ? pathname === tab.to
    : [tab.to, ...(tab.alsoActive ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`))

function TabLink({ tab }: { tab: Tab }) {
  const t = useT()
  const search = useMonthSearch()
  const { pathname } = useLocation()
  const extra = tab.alsoActive?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false
  const Icon = tab.icon
  return (
    <NavLink
      to={{ pathname: tab.to, search }}
      end={tab.end}
      viewTransition
      onClick={() =>
        setNavDirection(
          directionBetween(
            TABS.findIndex((x) => isOn(x, pathname)),
            TABS.indexOf(tab),
          ),
        )
      }
      className={({ isActive }) =>
        cn(
          'flex h-12 max-w-20 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10.5px] font-medium transition-colors outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring',
          isActive || extra ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )
      }
      aria-current={extra ? 'page' : undefined}
    >
      <Icon aria-hidden className="size-6" strokeWidth={1.8} />
      <span className="max-w-full truncate">{t(tab.label)}</span>
    </NavLink>
  )
}

/** Mobile bottom navigation: translucent, blurred, above the home indicator. */
export function BottomTabBar({ className }: { className?: string }) {
  const t = useT()
  const quickAdd = useQuickAdd()
  return (
    <nav
      aria-label={t('nav.main')}
      className={cn(
        // vt-tabbar: stays put during page view transitions.
        'vt-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-border/80',
        'bg-card/80 backdrop-blur-xl backdrop-saturate-150 supports-[not(backdrop-filter:blur(1px))]:bg-card',
        'pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
        className,
      )}
    >
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around gap-1 px-2">
        {LEFT.map((tab) => (
          <TabLink key={tab.to} tab={tab} />
        ))}
        <button
          type="button"
          onClick={quickAdd.open}
          aria-label={t('nav.add')}
          className={cn(
            'grid size-[54px] shrink-0 -translate-y-1 place-items-center rounded-[18px] bg-primary text-primary-foreground',
            'shadow-[0_6px_20px_color-mix(in_srgb,var(--primary)_40%,transparent)] transition-transform active:scale-92',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          )}
        >
          <Plus aria-hidden className="size-7" strokeWidth={2.4} />
        </button>
        {RIGHT.map((tab) => (
          <TabLink key={tab.to} tab={tab} />
        ))}
      </div>
    </nav>
  )
}
