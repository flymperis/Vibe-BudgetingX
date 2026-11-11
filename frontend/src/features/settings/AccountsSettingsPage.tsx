import { Info, Landmark, Plus } from 'lucide-react'
import { useToday } from '@/bootstrap/bootstrap'
import { EmptyState } from '@/components/EmptyState'
import { AccountBalancesList } from '@/components/manage/AccountBalancesList'
import { useAccounts, type Account } from '@/components/manage/accounts-api'
import { PageHeader } from '@/components/PageHeader'
import { useSheet } from '@/components/manage/useSheet'
import { ListSkeleton } from '@/components/skeletons'
import { Button } from '@/components/ui/button'
import { useMonth } from '@/hooks/useMonth'
import { useLang, useT } from '@/i18n'
import { fullDateLabel } from '@/lib/dates'
import { AccountSheet } from './AccountSheet'

/** /settings/accounts: banks, cash and credit cards (old Settings → Banks). */
export default function AccountsSettingsPage() {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const { month } = useMonth()
  const accounts = useAccounts(month)
  const sheet = useSheet<Account | null>()
  const open = sheet.show
  const data = accounts.data

  return (
    <>
      <PageHeader
        title={t('settings.accounts')}
        backTo="/settings"
        actions={
          <Button
            size="icon-touch"
            className="rounded-full"
            aria-label={t('settings.addAccount')}
            onClick={() => open(null)}
          >
            <Plus aria-hidden />
          </Button>
        }
      />
      <details className="mb-4 rounded-2xl border bg-card px-3.5 py-2.5 text-sm shadow-card">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
          <Info aria-hidden className="size-4 text-muted-foreground" />
          {t('settings.howItWorks')}
        </summary>
        <div className="mt-2 space-y-1.5 text-muted-foreground">
          <p>{t('settings.accountsHelp')}</p>
          <p>{t('settings.cardsHelp')}</p>
        </div>
      </details>

      {accounts.isPending ? (
        <ListSkeleton rows={4} />
      ) : !data?.items.length ? (
        <EmptyState
          icon={Landmark}
          title={t('settings.noAccounts')}
          description={t('settings.noAccountsHint')}
          action={
            <Button size="touch" onClick={() => open(null)}>
              <Plus aria-hidden />
              {t('settings.addAccount')}
            </Button>
          }
        />
      ) : (
        <>
          <p className="mx-1 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {data.through_today
              ? t('settings.balancesToday')
              : t('settings.balancesAsOf', { date: fullDateLabel(data.balance_as_of, lang, today) })}
          </p>
          <AccountBalancesList data={data} onSelect={(a) => open(a)} />
          <p className="mt-2 px-1 text-xs text-muted-foreground">{t('settings.tapToEdit')}</p>
        </>
      )}

      {sheet.state ? (
        <AccountSheet
          key={sheet.state.key}
          open={sheet.state.open}
          onOpenChange={sheet.onOpenChange}
          account={sheet.state.item}
        />
      ) : null}
    </>
  )
}
