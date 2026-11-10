/**
 * All routes. Every screen is a lazy route (own JS chunk): add one with
 *   { path: 'things', lazy: page(() => import('@/features/things/ThingsPage')) }
 * The page module must `export default` its component.
 */
import type { ComponentType } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { PublicOnly, RequireAuth } from '@/auth/guards'
import { FullScreenSkeleton } from '@/components/skeletons'
import { AuthenticatedApp, Root } from './layouts'

type PageModule = { default: ComponentType }

/** Lazy route helper: loads the module when the route is first visited. */
export function page(load: () => Promise<PageModule>): RouteObject['lazy'] {
  return async () => ({ Component: (await load()).default })
}

const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: 'dev/components', lazy: page(() => import('@/dev/ComponentsPage')) }]
  : []

export const routes: RouteObject[] = [
  {
    element: <Root />,
    hydrateFallbackElement: <FullScreenSkeleton />,
    children: [
      {
        element: <PublicOnly />,
        children: [
          { path: 'login', lazy: page(() => import('@/auth/LoginPage')) },
          { path: 'register', lazy: page(() => import('@/auth/RegisterPage')) },
        ],
      },
      ...devRoutes,
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AuthenticatedApp />,
            children: [
              { index: true, lazy: page(() => import('@/features/home/HomePage')) },
              { path: 'expenses', lazy: page(() => import('@/features/expenses/ExpensesPage')) },
              { path: 'income', lazy: page(() => import('@/features/income/IncomePage')) },
              { path: 'recurring', lazy: page(() => import('@/features/recurring/RecurringPage')) },
              { path: 'transfers', lazy: page(() => import('@/features/transfers/TransfersPage')) },
              { path: 'budget', lazy: page(() => import('@/features/budget/BudgetPage')) },
              { path: 'shared', lazy: page(() => import('@/features/shared/SharedPage')) },
              { path: 'yearly', lazy: page(() => import('@/features/yearly/YearlyPage')) },
              { path: 'summary', lazy: page(() => import('@/features/summary/SummaryPage')) },
              {
                path: 'reports',
                lazy: page(() => import('@/features/reports/ReportsLayout')),
                children: [
                  { index: true, element: <Navigate to="overview" replace /> },
                  { path: 'overview', lazy: page(() => import('@/features/reports/ReportsOverviewPage')) },
                  { path: 'spending', lazy: page(() => import('@/features/reports/ReportsSpendingPage')) },
                  { path: 'tags', lazy: page(() => import('@/features/reports/ReportsTagsPage')) },
                  {
                    path: 'investments',
                    lazy: page(() => import('@/features/reports/ReportsInvestmentsPage')),
                  },
                ],
              },
              {
                path: 'investments',
                lazy: page(() => import('@/features/investments/InvestmentsLayout')),
                children: [
                  { index: true, element: <Navigate to="crypto" replace /> },
                  { path: 'crypto', lazy: page(() => import('@/features/investments/CryptoPage')) },
                  { path: 'stocks', lazy: page(() => import('@/features/investments/StocksPage')) },
                ],
              },
              {
                path: 'settings',
                children: [
                  { index: true, lazy: page(() => import('@/features/settings/SettingsIndexPage')) },
                  { path: 'general', lazy: page(() => import('@/features/settings/GeneralSettingsPage')) },
                  { path: 'accounts', lazy: page(() => import('@/features/settings/AccountsSettingsPage')) },
                  {
                    path: 'expense-categories',
                    lazy: page(() => import('@/features/settings/ExpenseCategoriesPage')),
                  },
                  {
                    path: 'income-categories',
                    lazy: page(() => import('@/features/settings/IncomeCategoriesPage')),
                  },
                  { path: 'export', lazy: page(() => import('@/features/settings/ExportImportPage')) },
                  { path: 'integrations', lazy: page(() => import('@/features/settings/IntegrationsPage')) },
                ],
              },
              { path: 'more', lazy: page(() => import('@/features/more/MorePage')) },
              { path: '*', lazy: page(() => import('@/features/NotFoundPage')) },
            ],
          },
        ],
      },
    ],
  },
]

export function createAppRouter() {
  return createBrowserRouter(routes)
}
