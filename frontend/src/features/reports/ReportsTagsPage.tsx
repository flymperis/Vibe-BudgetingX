import { Hash } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { EmptyState } from '@/components/EmptyState'
import { useT } from '@/i18n'

/**
 * Placeholder tab body: replace with the real content (see docs/FRONTEND.md).
 * `?tag=<name>` selects one tag; <TagText> links here.
 */
export default function ReportsTagsPage() {
  const t = useT()
  const [params] = useSearchParams()
  const tag = params.get('tag')
  return (
    <EmptyState
      icon={Hash}
      title={tag ? `#${tag}` : t('reports.tags')}
      description={t('common.comingSoon')}
    />
  )
}
