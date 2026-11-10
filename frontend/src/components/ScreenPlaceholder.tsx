import { Construction } from 'lucide-react'
import type { ReactNode } from 'react'
import type { To } from 'react-router'
import { useT } from '@/i18n'
import { EmptyState } from './EmptyState'
import { MonthSwitcher } from './MonthSwitcher'
import { PageHeader } from './PageHeader'

/**
 * Temporary body of a screen that has not been built yet. Replace the whole
 * page component when implementing the screen.
 */
export function ScreenPlaceholder({
  title,
  withMonth = false,
  backTo,
  children,
}: {
  title: string
  withMonth?: boolean
  backTo?: To
  children?: ReactNode
}) {
  const t = useT()
  return (
    <>
      <PageHeader title={title} backTo={backTo} />
      {withMonth ? <MonthSwitcher className="mb-2 -ml-2" /> : null}
      {children}
      <EmptyState icon={Construction} title={title} description={t('common.comingSoon')} />
    </>
  )
}
