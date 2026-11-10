import { LogOut, Plus } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { NAV_ITEMS } from '@/app/nav'
import { useQuickAdd } from '@/app/quick-add'
import { useLogout, useSession } from '@/auth/session'
import { Button } from '@/components/ui/button'
import { useMonthSearch } from '@/hooks/useMonth'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'

const itemClass = (active: boolean) =>
  cn(
    'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors outline-none',
    'focus-visible:ring-2 focus-visible:ring-ring',
    active
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
  )

export function AppLogo({ className }: { className?: string }) {
  return (
    <img src="/favicon.svg" alt="" width={32} height={32} className={cn('size-8 rounded-lg', className)} />
  )
}

/** Desktop navigation: every section, sub-pages of the active one. */
export function Sidebar({ className }: { className?: string }) {
  const t = useT()
  const { pathname } = useLocation()
  const search = useMonthSearch()
  const quickAdd = useQuickAdd()
  const session = useSession()
  const logout = useLogout()
  const username = session.data?.user?.username

  return (
    <aside
      className={cn(
        'sticky top-0 h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        className,
      )}
    >
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <AppLogo />
        <span className="text-[15px] font-semibold tracking-tight">{t('app.name')}</span>
      </div>
      <div className="px-3 pb-3">
        <Button className="h-10 w-full rounded-xl" onClick={quickAdd.open}>
          <Plus aria-hidden />
          {t('quickAdd.newExpense')}
        </Button>
      </div>
      <nav aria-label={t('nav.main')} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const inSection =
              item.path !== '/' && (pathname === item.path || pathname.startsWith(`${item.path}/`))
            return (
              <li key={item.path}>
                <NavLink
                  to={{ pathname: item.path, search }}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    itemClass(isActive && !(item.children && pathname !== item.path))
                  }
                >
                  <Icon aria-hidden className="size-[18px]" />
                  {t(item.label)}
                </NavLink>
                {item.children && inSection ? (
                  <ul className="mt-0.5 mb-1 ml-[22px] space-y-0.5 border-l border-sidebar-border pl-2.5">
                    {item.children.map((child) => (
                      <li key={child.path}>
                        <NavLink
                          to={{ pathname: child.path, search }}
                          className={({ isActive }) => cn(itemClass(isActive), 'h-8 text-[13px]')}
                        >
                          {t(child.label)}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="flex items-center gap-2 border-t border-sidebar-border px-4 py-3">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground uppercase"
        >
          {username?.charAt(0) ?? '·'}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{username}</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('auth.logout')}
          title={t('auth.logout')}
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut aria-hidden />
        </Button>
      </div>
    </aside>
  )
}
