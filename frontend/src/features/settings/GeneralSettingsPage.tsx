import { LogOut } from 'lucide-react'
import { useLogout } from '@/auth/session'
import { Panel } from '@/components/Cards'
import { PageHeader } from '@/components/PageHeader'
import { LanguageSwitch, ModeSwitch, ThemeSwatches } from '@/components/Preferences'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'

/**
 * /settings/general: appearance and language are per-device (localStorage),
 * so this part is complete. Server-side general settings get added here.
 */
export default function GeneralSettingsPage() {
  const t = useT()
  const logout = useLogout()
  return (
    <>
      <PageHeader title={t('settings.general')} backTo="/settings" />
      <Panel className="space-y-5">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t('settings.appearance')}</h2>
          <ThemeSwatches />
          <ModeSwitch />
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t('settings.language')}</h2>
          <LanguageSwitch />
        </section>
      </Panel>
      <Button
        variant="destructive"
        size="block"
        className="mt-6"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
      >
        <LogOut aria-hidden />
        {t('auth.logout')}
      </Button>
    </>
  )
}
