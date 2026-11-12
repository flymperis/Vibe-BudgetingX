import { RefreshCw } from 'lucide-react'
import { errorMessage } from '@/app/query-client'
import { PageHeader } from '@/components/PageHeader'
import { CardSkeleton } from '@/components/skeletons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { useT } from '@/i18n'
import { AiSettingsCard } from './AiSettingsCard'
import { useIntegrations } from './api'
import { TelegramCard } from './TelegramCard'
import { VoiceSettingsCard } from './VoiceSettingsCard'

/** /settings/integrations: local AI (Ollama), voice messages (Whisper) and the Telegram bot. */
export default function IntegrationsPage() {
  const t = useT()
  const q = useIntegrations()
  return (
    <>
      <PageHeader title={t('settings.integrations')} backTo="/settings" />
      {q.isPending ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : q.isError ? (
        <EmptyState
          title={t('errors.loadFailed')}
          description={errorMessage(q.error)}
          action={
            <Button size="touch" onClick={() => void q.refetch()}>
              <RefreshCw aria-hidden />
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0">
          <div className="space-y-4">
            <AiSettingsCard settings={q.data.ai} />
            <VoiceSettingsCard settings={q.data.whisper} />
          </div>
          {/* Remount when the server state changes (linked, code issued) so the forms start from it. */}
          <TelegramCard
            key={`${q.data.telegram.linked}-${q.data.telegram.link?.default_account_id ?? ''}`}
            telegram={q.data.telegram}
          />
        </div>
      )}
    </>
  )
}
