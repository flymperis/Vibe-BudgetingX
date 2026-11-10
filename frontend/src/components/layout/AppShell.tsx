import { lazy, Suspense, useMemo, useState } from 'react'
import { Outlet, useNavigation } from 'react-router'
import { QuickAddContext } from '@/app/quick-add'
import { PageSkeleton } from '@/components/skeletons'
import { useT } from '@/i18n'
import { BottomTabBar } from './BottomTabBar'
import { Sidebar } from './Sidebar'

// Loaded on first use only; owned by the expenses feature.
const QuickAddExpense = lazy(() => import('@/features/expenses/QuickAddExpense'))

/**
 * Authenticated layout.
 *  - mobile (< md): the document scrolls; translucent tab bar fixed at the bottom
 *  - desktop: sticky sidebar on the left, content column on the right
 * Screens render inside <Outlet/>; they never add their own outer padding.
 */
export function AppShell() {
  const t = useT()
  const navigation = useNavigation()
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddMounted, setQuickAddMounted] = useState(false)
  const quickAdd = useMemo(
    () => ({
      open: () => {
        setQuickAddMounted(true)
        setQuickAddOpen(true)
      },
    }),
    [],
  )

  return (
    <QuickAddContext value={quickAdd}>
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-[calc(env(safe-area-inset-top)+8px)] focus:left-3"
      >
        {t('nav.skip')}
      </a>
      {navigation.state === 'loading' ? (
        <div
          role="progressbar"
          aria-label={t('nav.loading')}
          className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-primary"
        />
      ) : null}
      <div className="min-h-dvh md:flex">
        <Sidebar className="hidden md:flex" />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          <div className="mx-auto w-full max-w-lg px-[18px] pt-[calc(env(safe-area-inset-top)+18px)] pb-[calc(env(safe-area-inset-bottom)+6.5rem)] md:max-w-3xl md:px-8 md:pt-10 md:pb-12">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
        <BottomTabBar className="md:hidden" />
      </div>
      {quickAddMounted ? (
        <Suspense fallback={null}>
          <QuickAddExpense open={quickAddOpen} onOpenChange={setQuickAddOpen} />
        </Suspense>
      ) : null}
    </QuickAddContext>
  )
}
