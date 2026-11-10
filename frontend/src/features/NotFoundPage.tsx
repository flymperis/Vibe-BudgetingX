import { MapPinOff } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useT } from '@/i18n'

export default function NotFoundPage() {
  const t = useT()
  useDocumentTitle(t('common.notFound'))
  return (
    <EmptyState
      icon={MapPinOff}
      title={t('common.notFound')}
      action={
        <Button asChild size="touch">
          <Link to="/">{t('common.goHome')}</Link>
        </Button>
      }
    />
  )
}
