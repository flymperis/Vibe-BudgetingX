import { Outlet } from 'react-router'
import { INVESTMENT_TABS } from '@/app/nav'
import { PageHeader } from '@/components/PageHeader'
import { TabLinks } from '@/components/TabLinks'
import { useT } from '@/i18n'
import { useInvestments } from './api'

/**
 * /investments/*: title + crypto/stocks tabs. Opening the screen asks the
 * server for live prices once (see api.ts); the tabs share that data.
 */
export default function InvestmentsLayout() {
  const t = useT()
  useInvestments({ onOpen: true })
  return (
    <>
      <PageHeader title={t('nav.investments')} />
      <TabLinks tabs={INVESTMENT_TABS} label={t('investments.sections')} />
      <Outlet />
    </>
  )
}
