import { Construction } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useT } from '@/i18n'

/** Placeholder tab body: replace with the real content (see docs/FRONTEND.md). */
export default function ReportsOverviewPage() {
  const t = useT()
  return <EmptyState icon={Construction} title={t('reports.overview')} description={t('common.comingSoon')} />
}
