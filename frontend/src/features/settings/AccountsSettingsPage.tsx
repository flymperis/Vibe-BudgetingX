import { Info, Landmark, Plus } from 'lucide-react'
import { LoadError } from '@/components/LoadError'
import { AddButton } from '@/components/AddButton'
import { EmptyState } from '@/components/EmptyState'
import { AccountBalancesList, BalanceScopeHint } from '@/components/AccountBalancesList'
import { useAccounts, type Account } from '@/api/accounts'
import { PageHeader } from '@/components/PageHeader'
import { useSheet } from '@/hooks/useSheet'
import { ListSkeleton } from '@/components/skeletons'
import { Button } from '@/components/ui/button'
import { useMonth } from '@/hooks/useMonth'
import { useT } from '@/i18n'
import { AccountSheet } from './AccountSheet'

/** /settings/accounts: banks, cash and credit cards (old Settings → Banks). */
export default function AccountsSettingsPage() {
  const t = useT()
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
        actions={<AddButton label={t('settings.addAccount')} onClick={() => open(null)} />}
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

      {accounts.isError && !accounts.data ? (
        <LoadError onRetry={() => void accounts.refetch()} />
      ) : accounts.isPending ? (
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
          <AccountBalancesList
            accounts={data.items}
            totals={data.totals}
            hasCards={data.has_cards}
            onSelect={(a) => open(a)}
          />
          <BalanceScopeHint throughToday={data.through_today} asOf={data.balance_as_of} className="mt-2" />
          <p className="mx-1 mt-1 text-xs text-muted-foreground">{t('settings.tapToEdit')}</p>
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
