import { ArrowLeftRight, ArrowRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useToday } from '@/bootstrap/bootstrap'
import { useConfirm } from '@/components/confirm'
import { EmptyState } from '@/components/EmptyState'
import { DetailRow } from '@/components/FormField'
import { SectionHeader } from '@/components/ListGroup'
import { AccountAvatar } from '@/components/manage/AccountAvatar'
import { AccountBalancesList } from '@/components/manage/AccountBalancesList'
import { useAccounts, type Account } from '@/components/manage/accounts-api'
import { Money } from '@/components/Money'
import { MonthSwitcher } from '@/components/MonthSwitcher'
import { PageHeader } from '@/components/PageHeader'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { CardSkeleton, ListSkeleton } from '@/components/skeletons'
import { TagText } from '@/components/TagText'
import { Button } from '@/components/ui/button'
import { useMonth } from '@/hooks/useMonth'
import { useLang, useT } from '@/i18n'
import { fullDateLabel, relativeDayLabel } from '@/lib/dates'
import { useDeleteTransfer, useTransfers, type Transfer } from './api'
import { TransferSheet } from './TransferSheet'

/** /transfers: new transfer (incl. "Pay card" via ?pay_card=), balances, last transfers. */
export default function TransfersPage() {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const { month } = useMonth()
  const [params, setParams] = useSearchParams()
  const payCardRaw = params.get('pay_card')
  const payCard = payCardRaw && /^\d+$/.test(payCardRaw) ? Number(payCardRaw) : null

  const accounts = useAccounts(month)
  const transfers = useTransfers(month, payCard)
  const [sheetKey, setSheetKey] = useState(0)
  const [manualOpen, setManualOpen] = useState(false)
  const [detail, setDetail] = useState<Transfer | null>(null)

  const items = accounts.data?.items ?? []
  const canTransfer = items.length >= 2
  const payingAccount = payCard !== null ? items.find((a) => a.id === payCard) : undefined
  const sheetOpen = manualOpen || payCard !== null
  // Wait for the pay-card defaults before showing the pre-filled form.
  const defaultsReady = !!transfers.data && !transfers.isPlaceholderData

  const openNew = () => {
    setSheetKey((k) => k + 1)
    setManualOpen(true)
  }
  const closeSheet = (open: boolean) => {
    if (open) return
    setManualOpen(false)
    if (payCard !== null) {
      const next = new URLSearchParams(params)
      next.delete('pay_card')
      setParams(next, { replace: true })
    }
  }
  const pay = (a: Account) => {
    setSheetKey((k) => k + 1)
    const next = new URLSearchParams(params)
    next.set('pay_card', String(a.id))
    setParams(next)
  }

  const asOf = accounts.data?.balance_as_of
  return (
    <>
      <PageHeader
        title={t('nav.transfers')}
        actions={
          canTransfer ? (
            <Button
              size="icon-touch"
              className="rounded-full"
              aria-label={t('transfers.newTitle')}
              onClick={openNew}
            >
              <Plus aria-hidden />
            </Button>
          ) : null
        }
      />
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">{t('transfers.intro')}</p>
      <MonthSwitcher className="mb-3 -ml-2" />

      {accounts.isPending ? (
        <CardSkeleton />
      ) : !canTransfer ? (
        <EmptyState
          icon={ArrowLeftRight}
          title={t('transfers.needTwoTitle')}
          description={t('transfers.needTwo')}
          action={
            <Button asChild size="touch">
              <Link to="/settings/accounts">{t('settings.accounts')}</Link>
            </Button>
          }
        />
      ) : (
        <Button size="block" onClick={openNew} className="md:w-auto md:px-6">
          <ArrowLeftRight aria-hidden />
          {t('transfers.newTitle')}
        </Button>
      )}

      <div className="md:grid md:grid-cols-2 md:gap-6">
        {items.length ? (
          <section>
            <SectionHeader title={t('manage.balances')} />
            {asOf ? (
              <p className="-mt-1 mb-2.5 text-xs text-muted-foreground">
                {accounts.data?.through_today
                  ? t('transfers.scopeToday')
                  : t('transfers.scopeMonth', { date: fullDateLabel(asOf, lang, today) })}
              </p>
            ) : null}
            {accounts.data ? <AccountBalancesList data={accounts.data} onPay={pay} /> : null}
          </section>
        ) : null}

        <section>
          <SectionHeader title={t('transfers.logTitle', { n: transfers.data?.limit ?? 10 })} />
          {transfers.isPending ? (
            <ListSkeleton rows={3} />
          ) : !transfers.data?.items.length ? (
            <div className="rounded-2xl border bg-card shadow-card">
              <EmptyState icon={ArrowLeftRight} title={t('transfers.empty')} className="py-8" />
            </div>
          ) : (
            <ul
              aria-label={t('transfers.logLabel')}
              className="divide-y divide-border overflow-hidden rounded-2xl border bg-card shadow-card"
            >
              {transfers.data.items.map((tr) => (
                <TransferRow key={tr.id} transfer={tr} accounts={items} onOpen={() => setDetail(tr)} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {canTransfer && sheetOpen && defaultsReady && transfers.data ? (
        <TransferSheet
          key={`${sheetKey}-${payCard ?? ''}`}
          open
          onOpenChange={closeSheet}
          accounts={items}
          defaults={transfers.data.defaults}
          payingCard={payingAccount?.name ?? null}
        />
      ) : null}
      <TransferDetailSheet transfer={detail} accounts={items} onClose={() => setDetail(null)} />
    </>
  )
}

function TransferRow({
  transfer: tr,
  accounts,
  onOpen,
}: {
  transfer: Transfer
  accounts: Account[]
  onOpen: () => void
}) {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const bankOf = (id: number) => accounts.find((a) => a.id === id)?.bank
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('transfers.rowLabel', {
          from: tr.from_account_name,
          to: tr.to_account_name,
          date: relativeDayLabel(tr.transferred_at, lang, today),
        })}
        className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted"
      >
        <span className="relative size-10 shrink-0">
          <AccountAvatar
            name={tr.from_account_name}
            bank={bankOf(tr.from_account_id)}
            size="sm"
            className="absolute top-0 left-0 size-[26px] rounded-lg text-[10px]"
          />
          <AccountAvatar
            name={tr.to_account_name}
            bank={bankOf(tr.to_account_id)}
            size="sm"
            className="absolute right-0 bottom-0 size-[26px] rounded-lg text-[10px] ring-2 ring-card"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[15px] leading-snug font-medium break-words">
            {tr.from_account_name}
            <ArrowRight aria-hidden className="mx-1 inline size-3.5 align-[-2px] text-muted-foreground" />
            {tr.to_account_name}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {relativeDayLabel(tr.transferred_at, lang, today)}
            {tr.notes ? (
              <>
                {' · '}
                <TagText text={tr.notes} asText />
              </>
            ) : null}
          </span>
        </span>
        <Money value={tr.amount} tone="none" className="text-[15px] font-semibold" />
      </button>
    </li>
  )
}

function TransferDetailSheet({
  transfer,
  accounts,
  onClose,
}: {
  transfer: Transfer | null
  accounts: Account[]
  onClose: () => void
}) {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const confirm = useConfirm()
  const del = useDeleteTransfer()
  // Keep the last transfer on screen while the sheet animates closed.
  const [shown, setShown] = useState<Transfer | null>(transfer)
  if (transfer && transfer !== shown) setShown(transfer)
  const tr = transfer ?? shown
  const bankOf = (id: number) => accounts.find((a) => a.id === id)?.bank

  const remove = async () => {
    if (!tr) return
    const ok = await confirm({
      title: t('transfers.deleteTitle'),
      description: t('transfers.deleteText'),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (ok) del.mutate(tr.id, { onSuccess: onClose })
  }
  return (
    <ResponsiveSheet
      open={!!transfer}
      onOpenChange={(o) => !o && onClose()}
      title={t('transfers.detailTitle')}
      footer={
        <Button variant="destructive" size="block" onClick={remove} disabled={del.isPending}>
          <Trash2 aria-hidden />
          {t('transfers.delete')}
        </Button>
      }
    >
      {tr ? (
        <>
          <p className="mb-2 text-center text-[34px] font-bold tracking-tight">
            <Money value={tr.amount} tone="none" />
          </p>
          <DetailRow label={t('transfers.from')}>
            <span className="inline-flex items-center gap-2">
              <AccountAvatar name={tr.from_account_name} bank={bankOf(tr.from_account_id)} size="xs" />
              {tr.from_account_name}
            </span>
          </DetailRow>
          <DetailRow label={t('transfers.to')}>
            <span className="inline-flex items-center gap-2">
              <AccountAvatar name={tr.to_account_name} bank={bankOf(tr.to_account_id)} size="xs" />
              {tr.to_account_name}
            </span>
          </DetailRow>
          <DetailRow label={t('transfers.date')}>{fullDateLabel(tr.transferred_at, lang, today)}</DetailRow>
          {tr.notes ? (
            <DetailRow label={t('common.notes')}>
              <TagText text={tr.notes} />
            </DetailRow>
          ) : null}
        </>
      ) : null}
    </ResponsiveSheet>
  )
}
