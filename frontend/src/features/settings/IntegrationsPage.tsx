import { ScreenPlaceholder } from '@/components/ScreenPlaceholder'
import { useT } from '@/i18n'

/** Placeholder: replace with the real screen (see docs/FRONTEND.md). */
export default function IntegrationsPage() {
  const t = useT()
  return <ScreenPlaceholder title={t('settings.integrations')} backTo="/settings" />
}
