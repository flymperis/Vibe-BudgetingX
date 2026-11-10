import { Outlet } from 'react-router'
import { REPORT_TABS } from '@/app/nav'
import { PageHeader } from '@/components/PageHeader'
import { TabLinks } from '@/components/TabLinks'
import { useT } from '@/i18n'

/** /reports/*: title + sub-tabs; each tab is its own lazy route. */
export default function ReportsLayout() {
  const t = useT()
  return (
    <>
      <PageHeader title={t('nav.reports')} />
      <TabLinks tabs={REPORT_TABS} label={t('reports.sections')} />
      <Outlet />
    </>
  )
}
