/**
 * Every section of the app in one place. The sidebar (desktop), the More page
 * (mobile) and the tab bar read from here; routes live in router.tsx.
 */
import {
  ArrowLeftRight,
  BarChart3,
  CalendarRange,
  CircleGauge,
  Home,
  type LucideIcon,
  PiggyBank,
  ReceiptText,
  Repeat,
  Settings,
  Table2,
  TrendingUp,
  Users,
} from 'lucide-react'
import type { MessageKey } from '@/i18n'

export interface NavItem {
  path: string
  label: MessageKey
  icon: LucideIcon
  /** Sub-pages shown under the item in the sidebar. */
  children?: { path: string; label: MessageKey }[]
  /** Short hint on the More page. */
  hint?: MessageKey
}

export const REPORT_TABS = [
  { path: '/reports/overview', label: 'reports.overview' },
  { path: '/reports/spending', label: 'reports.spending' },
  { path: '/reports/tags', label: 'reports.tags' },
  { path: '/reports/investments', label: 'reports.investments' },
] as const satisfies NavItem['children']

export const INVESTMENT_TABS = [
  { path: '/investments/crypto', label: 'investments.crypto' },
  { path: '/investments/stocks', label: 'investments.stocks' },
] as const satisfies NavItem['children']

export const SETTINGS_SECTIONS = [
  { path: '/settings/general', label: 'settings.general' },
  { path: '/settings/accounts', label: 'settings.accounts' },
  { path: '/settings/expense-categories', label: 'settings.expenseCategories' },
  { path: '/settings/income-categories', label: 'settings.incomeCategories' },
  { path: '/settings/export', label: 'settings.exportImport' },
  { path: '/settings/integrations', label: 'settings.integrations' },
] as const satisfies NavItem['children']

/** Sidebar order (same as the old app's side menu). */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'nav.home', icon: Home },
  { path: '/expenses', label: 'nav.expenses', icon: ReceiptText },
  { path: '/income', label: 'nav.income', icon: PiggyBank },
  { path: '/recurring', label: 'nav.recurring', icon: Repeat, hint: 'more.recurringHint' },
  { path: '/transfers', label: 'nav.transfers', icon: ArrowLeftRight, hint: 'more.transfersHint' },
  { path: '/budget', label: 'nav.budget', icon: CircleGauge },
  { path: '/shared', label: 'nav.shared', icon: Users, hint: 'more.sharedHint' },
  { path: '/summary', label: 'nav.summary', icon: Table2 },
  { path: '/yearly', label: 'nav.yearly', icon: CalendarRange },
  { path: '/reports', label: 'nav.reports', icon: BarChart3, children: [...REPORT_TABS] },
  { path: '/investments', label: 'nav.investments', icon: TrendingUp, children: [...INVESTMENT_TABS] },
  { path: '/settings', label: 'nav.settings', icon: Settings, children: [...SETTINGS_SECTIONS] },
]

/** Mobile tab bar: Home, Expenses, (+), Reports, More. */
export const TAB_PATHS = ['/', '/expenses', '/reports'] as const

/** Sections reachable from the More page on mobile (everything not in the tab bar). */
export const MORE_ITEMS = NAV_ITEMS.filter((i) => !(TAB_PATHS as readonly string[]).includes(i.path))
