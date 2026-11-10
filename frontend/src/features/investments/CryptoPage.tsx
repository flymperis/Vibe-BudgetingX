import { Construction } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useT } from '@/i18n'

/** Placeholder tab body: replace with the real content (see docs/FRONTEND.md). */
export default function CryptoPage() {
  const t = useT()
  return (
    <EmptyState icon={Construction} title={t('investments.crypto')} description={t('common.comingSoon')} />
  )
}
