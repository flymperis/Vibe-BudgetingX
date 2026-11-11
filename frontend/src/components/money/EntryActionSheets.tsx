import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useBootstrap, useToday } from '@/bootstrap/bootstrap'
import { CategoryIcon } from '@/components/CategoryIcon'
import { useConfirm } from '@/components/confirm'
import { DetailRow } from '@/components/FormField'
import { Money } from '@/components/Money'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { TagText } from '@/components/TagText'
import { Button } from '@/components/ui/button'
import { useLang, useT } from '@/i18n'
import { fullDateLabel, relativeDayLabel } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { AccountAvatar } from '@/components/AccountAvatar'
import { useDeleteEntry, type Entry } from './entries'
import { EntrySheet } from './EntrySheet'

export interface EntryActionSheetsProps {
  entry: Entry | null
  detailOpen: boolean
  setDetailOpen: (open: boolean) => void
  editOpen: boolean
  setEditOpen: (open: boolean) => void
}

/** Detail sheet of an entry (amount, notes with tag links, fields) with Edit and Delete. */
export function EntryActionSheets({
  entry,
  detailOpen,
  setDetailOpen,
  editOpen,
  setEditOpen,
}: EntryActionSheetsProps) {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const boot = useBootstrap()
  const confirm = useConfirm()
  const del = useDeleteEntry()
  const [pendingDelete, setPendingDelete] = useState(false)
  const bank = entry ? boot.accounts.find((a) => a.id === entry.account_id)?.bank : null

  const onDelete = async () => {
    if (!entry) return
    const ok = await confirm({
      title: t(entry.kind === 'expense' ? 'money.deleteExpense' : 'money.deleteIncome'),
      description: t('money.deleteDescription', {
        amount: formatMoney(entry.amount),
        category: entry.category_name,
        day: fullDateLabel(entry.date, lang, today),
      }),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    setPendingDelete(true)
    del.mutate(
      { kind: entry.kind, id: entry.id },
      {
        onSuccess: () => {
          toast.success(t('common.deleted'))
          setDetailOpen(false)
        },
        onSettled: () => setPendingDelete(false),
      },
    )
  }

  return (
    <>
      <ResponsiveSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={entry ? entry.notes || entry.category_name : ''}
        hideTitle
        size="sm"
        footer={
          <>
            <Button
              size="block"
              onClick={() => {
                setDetailOpen(false)
                // Let the detail sheet slide away before the form comes up.
                window.setTimeout(() => setEditOpen(true), 180)
              }}
            >
              <Pencil aria-hidden />
              {t('common.edit')}
            </Button>
            <Button
              size="block"
              variant="secondary"
              className="text-negative"
              disabled={pendingDelete}
              onClick={() => void onDelete()}
            >
              <Trash2 aria-hidden />
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {entry ? (
          <div>
            <div className="mt-1 mb-4 flex flex-col items-center text-center">
              <CategoryIcon name={entry.category_name} size="lg" className="mb-2.5" />
              <Money value={entry.amount} tone="positive" className="text-[32px] font-bold tracking-tight" />
              {entry.notes ? (
                <p className="mt-1 max-w-full break-words text-muted-foreground">
                  <TagText text={entry.notes} />
                </p>
              ) : null}
            </div>
            <DetailRow label={t('common.category')}>{entry.category_name}</DetailRow>
            <DetailRow label={t('common.account')}>
              <span className="inline-flex items-center gap-1.5">
                <AccountAvatar name={entry.account_name} bank={bank} size="xs" fallback={false} />
                {entry.account_name}
              </span>
            </DetailRow>
            <DetailRow label={t('common.day')}>
              {relativeDayLabel(entry.date, lang, today)}
              {relativeDayLabel(entry.date, lang, today) !== fullDateLabel(entry.date, lang, today)
                ? ` · ${fullDateLabel(entry.date, lang, today)}`
                : null}
            </DetailRow>
          </div>
        ) : null}
      </ResponsiveSheet>
      <EntrySheet open={editOpen} onOpenChange={setEditOpen} entry={entry} />
    </>
  )
}
