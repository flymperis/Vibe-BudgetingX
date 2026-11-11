import { LogOut, UserRound } from 'lucide-react'
import { useLogout } from '@/auth/session'
import { useBootstrap } from '@/bootstrap/bootstrap'
import { IconTile } from '@/components/CategoryIcon'
import { Panel } from '@/components/Cards'
import { PageHeader } from '@/components/PageHeader'
import { LanguageSwitch, ModeSwitch, ThemeSwatches } from '@/components/Preferences'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'

/**
 * /settings/general: appearance and language are per-device (localStorage);
 * the signed-in user and "Log out" (old header) live here too.
 */
export default function GeneralSettingsPage() {
  const t = useT()
  const logout = useLogout()
  const { user } = useBootstrap()
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
      <Panel className="mt-4 flex items-center gap-3">
        <IconTile icon={UserRound} />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t('settings.signedInAs')}</p>
          <p className="truncate text-[15px] font-semibold">{user.username}</p>
        </div>
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
