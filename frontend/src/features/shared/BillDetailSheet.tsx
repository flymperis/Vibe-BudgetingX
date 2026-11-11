import { Pencil, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { errorMessage } from '@/app/query-client'
import { CategoryGlyph } from '@/components/CategoryIcon'
import { ChipPicker } from '@/components/ChipPicker'
import { useConfirm } from '@/components/confirm'
import { DetailRow, FieldError, FieldLabel } from '@/components/FormField'
import { Money } from '@/components/Money'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { TagText } from '@/components/TagText'
import { Button } from '@/components/ui/button'
import { useToday } from '@/bootstrap/bootstrap'
import { useLang, useT } from '@/i18n'
import { fullDateLabel } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useDeleteBill, useRecordBill, useUnrecordBill, type BillActivity, type GroupDetail } from './api'
import { addedByText, effectText, methodLabel, personName } from './labels'
import { Hint } from './SharedParts'

interface IdName {
  id: number
  name: string
}

export interface BillDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bill: BillActivity | null
  group: GroupDetail
  categories: IdName[]
  accounts: IdName[]
  onEdit: (bill: BillActivity) => void
}

export function BillDetailSheet({
  open,
  onOpenChange,
  bill,
  group,
  categories,
  accounts,
  onEdit,
}: BillDetailSheetProps) {
  const t = useT()
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={t('shared.billDetails')}>
      {bill ? (
        <BillDetail
          key={bill.id}
          bill={bill}
          group={group}
          categories={categories}
          accounts={accounts}
          onEdit={() => onEdit(bill)}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </ResponsiveSheet>
  )
}

function inputNote(method: string, value: string, t: ReturnType<typeof useT>): string | null {
  if (!value) return null
  if (method === 'percent') return `${value.replace('.', ',')}%`
  if (method === 'shares')
    return value === '1' ? t('shared.sharesOne') : t('shared.sharesCount', { count: value.replace('.', ',') })
  return null
}

function BillDetail({
  bill,
  group,
  categories,
  accounts,
  onEdit,
  onClose,
}: Omit<BillDetailSheetProps, 'open' | 'onOpenChange' | 'bill' | 'onEdit'> & {
  bill: BillActivity
  onEdit: () => void
  onClose: () => void
}) {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const id = useId()
  const confirm = useConfirm()
  const record = useRecordBill()
  const unrecord = useUnrecordBill()
  const del = useDeleteBill()
  const [categoryId, setCategoryId] = useState<number | null>(
    bill.payload.category_id ?? categories[0]?.id ?? null,
  )
  const [accountId, setAccountId] = useState<number | null>(
    bill.payload.account_id ?? accounts[0]?.id ?? null,
  )
  const busy = record.isPending || unrecord.isPending || del.isPending
  const me = group.me_id
  const needsCategory = bill.my_share > 0
  const effectClass =
    bill.effect > 0 ? 'text-positive' : bill.effect < 0 ? 'text-negative' : 'text-muted-foreground'

  const onDelete = async () => {
    if (
      await confirm({
        title: t('shared.deleteBillConfirm', { name: bill.description }),
        description: t('shared.deleteBillHint'),
        destructive: true,
        confirmLabel: t('common.delete'),
      })
    )
      del.mutate(bill.id, { onSuccess: onClose })
  }

  return (
    <div className="pb-2">
      <div className="mb-3 text-center">
        <TagText text={bill.description} className="block text-[17px] font-semibold break-words" />
        <Money value={bill.amount} tone="none" className="mt-1 block text-[32px] font-bold tracking-tight" />
        <p className={cn('text-sm font-medium', effectClass)}>{effectText(bill, t)}</p>
      </div>

      <div className="rounded-2xl border bg-card px-3.5 shadow-card">
        <DetailRow label={t('shared.date')}>{fullDateLabel(bill.date, lang, today)}</DetailRow>
        <DetailRow label={t('shared.paidBy')}>
          {personName(bill.paid_by_name, bill.payload.paid_by === me, t)}
        </DetailRow>
        <DetailRow label={t('shared.split')}>{methodLabel(bill.split_method, t)}</DetailRow>
        <DetailRow label={t('shared.addedByLabel')}>{addedByText(bill.added_by, t)}</DetailRow>
      </div>

      <ul
        className="mt-3 divide-y overflow-hidden rounded-2xl border bg-card shadow-card"
        aria-label={t('shared.split')}
      >
        {bill.splits.map((s) => {
          const note = inputNote(bill.split_method, s.input_value, t)
          return (
            <li
              key={s.person_id}
              className="flex min-h-11 items-center justify-between gap-3 px-3.5 py-2 text-[15px]"
            >
              <span className="min-w-0 truncate">{personName(s.name, s.person_id === me, t)}</span>
              <span className="shrink-0 tabular-nums">
                {note ? <span className="mr-2 text-xs text-muted-foreground">{note}</span> : null}
                <Money value={s.share} tone="none" className="font-medium" />
              </span>
            </li>
          )
        })}
      </ul>

      {bill.involved ? (
        <section
          className="mt-4 rounded-2xl border bg-card p-3.5 shadow-card"
          aria-labelledby={`${id}-budget`}
        >
          <h3
            id={`${id}-budget`}
            className="flex items-center justify-between gap-2 text-[15px] font-semibold"
          >
            {t('shared.myBudget')}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                bill.recorded && !bill.record_incomplete
                  ? 'bg-positive/15 text-positive'
                  : 'bg-warning/15 text-warning',
              )}
            >
              {bill.record_incomplete
                ? t('shared.partlyInBudget')
                : bill.recorded
                  ? t('shared.inBudget')
                  : t('shared.notInBudget')}
            </span>
          </h3>
          {bill.record_incomplete ? (
            <Hint>{bill.i_paid ? t('shared.partlyPickAccount') : t('shared.partlyPickCategory')}</Hint>
          ) : null}
          {needsCategory ? (
            <>
              <FieldLabel id={`${id}-cat`}>{t('shared.myShareCategory')}</FieldLabel>
              <ChipPicker
                labelledBy={`${id}-cat`}
                label={t('shared.myShareCategory')}
                value={categoryId}
                onChange={setCategoryId}
                options={categories.map((c) => ({
                  value: c.id,
                  label: c.name,
                  icon: <CategoryGlyph name={c.name} />,
                }))}
              />
            </>
          ) : null}
          {bill.i_paid ? (
            <>
              <FieldLabel id={`${id}-acc`}>{t('shared.paidFrom')}</FieldLabel>
              {accounts.length ? (
                <ChipPicker
                  labelledBy={`${id}-acc`}
                  label={t('shared.paidFrom')}
                  value={accountId}
                  onChange={setAccountId}
                  options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                />
              ) : (
                <Hint className="mt-0">{t('shared.noOwnAccounts')}</Hint>
              )}
            </>
          ) : null}
          <FieldError>{record.isError ? errorMessage(record.error) : null}</FieldError>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              size="touch"
              disabled={busy}
              onClick={() =>
                record.mutate({
                  id: bill.id,
                  category_id: needsCategory ? categoryId : null,
                  account_id: bill.i_paid ? accountId : null,
                })
              }
            >
              {bill.recorded ? t('shared.updateBudget') : t('shared.addToBudget')}
            </Button>
            {bill.recorded ? (
              <Button size="touch" variant="outline" disabled={busy} onClick={() => unrecord.mutate(bill.id)}>
                {t('shared.removeFromBudget')}
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button size="touch" variant="secondary" disabled={busy} onClick={onEdit}>
          <Pencil aria-hidden />
          {t('common.edit')}
        </Button>
        <Button size="touch" variant="destructive" disabled={busy} onClick={() => void onDelete()}>
          <Trash2 aria-hidden />
          {t('common.delete')}
        </Button>
      </div>
    </div>
  )
}
