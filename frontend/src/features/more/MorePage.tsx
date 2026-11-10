import { LogOut } from 'lucide-react'
import { MORE_ITEMS } from '@/app/nav'
import { useLogout, useSession } from '@/auth/session'
import { Panel } from '@/components/Cards'
import { IconTile } from '@/components/CategoryIcon'
import { ListGroup, ListRow } from '@/components/ListGroup'
import { PageHeader } from '@/components/PageHeader'
import { LanguageSwitch, ModeSwitch, ThemeSwatches } from '@/components/Preferences'
import { useMonthSearch } from '@/hooks/useMonth'
import { useT } from '@/i18n'

/** Mobile "More" tab: every section that is not in the tab bar, plus appearance. */
export default function MorePage() {
  const t = useT()
  const search = useMonthSearch()
  const session = useSession()
  const logout = useLogout()
  return (
    <>
      <PageHeader
        title={t('nav.more')}
        eyebrow={session.data?.user ? t('auth.hello', { name: session.data.user.username }) : undefined}
      />
      <Panel className="mb-5 space-y-4">
        <h2 className="text-[13px] text-muted-foreground">{t('settings.appearance')}</h2>
        <ThemeSwatches />
        <div className="flex flex-wrap gap-2">
          <ModeSwitch />
          <LanguageSwitch />
        </div>
      </Panel>
      <ListGroup label={t('more.subtitle')}>
        {MORE_ITEMS.map((item) => (
          <ListRow
            key={item.path}
            to={{ pathname: item.path, search }}
            icon={<IconTile icon={item.icon} />}
            title={t(item.label)}
            subtitle={item.hint ? t(item.hint) : undefined}
          />
        ))}
      </ListGroup>
      <ListGroup className="mt-5">
        <ListRow
          onClick={() => logout.mutate()}
          icon={<IconTile icon={LogOut} tone="rose" />}
          title={<span className="text-negative">{t('auth.logout')}</span>}
        />
      </ListGroup>
    </>
  )
}
