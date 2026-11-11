import { CloudOff } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'

/** A screen's data did not load (server down, 5xx): say so and offer a retry. The toast says why. */
export function LoadError({ onRetry, className }: { onRetry: () => void; className?: string }) {
  const t = useT()
  return (
    <EmptyState
      icon={CloudOff}
      title={t('errors.loadFailed')}
      className={className}
      action={
        <Button size="touch" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      }
    />
  )
}
