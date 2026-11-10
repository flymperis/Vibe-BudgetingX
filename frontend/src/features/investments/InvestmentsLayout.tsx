import { Outlet } from 'react-router'
import { INVESTMENT_TABS } from '@/app/nav'
import { PageHeader } from '@/components/PageHeader'
import { TabLinks } from '@/components/TabLinks'
import { useT } from '@/i18n'

/** /investments/*: title + crypto/stocks tabs. */
export default function InvestmentsLayout() {
  const t = useT()
  return (
    <>
      <PageHeader title={t('nav.investments')} />
      <TabLinks tabs={INVESTMENT_TABS} label={t('investments.sections')} />
      <Outlet />
    </>
  )
}
