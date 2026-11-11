import { Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { errorMessage } from '@/app/query-client'
import { ChipPicker } from '@/components/ChipPicker'
import { useConfirm } from '@/components/confirm'
import { DetailRow, FieldError, FieldLabel } from '@/components/FormField'
import { Money } from '@/components/Money'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { useToday } from '@/bootstrap/bootstrap'
import { useLang, useT } from '@/i18n'
import { fullDateLabel } from '@/lib/dates'
import { cn } from '@/lib/utils'
import {
  useDeletePayment,
  useRecordPayment,
  useUnrecordPayment,
  type GroupDetail,
  type PaymentActivity,
} from './api'
import { addedByText, paymentNames } from './labels'
import { Hint } from './SharedParts'

interface IdName {
  id: number
  name: string
}

export interface PaymentDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payment: PaymentActivity | null
  group: GroupDetail
  accounts: IdName[]
}

export function PaymentDetailSheet({ open, onOpenChange, payment, accounts }: PaymentDetailSheetProps) {
  const t = useT()
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={t('shared.paymentDetails')}>
      {payment ? (
        <PaymentDetail
          key={payment.id}
          payment={payment}
          accounts={accounts}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </ResponsiveSheet>
  )
}

function PaymentDetail({
  payment,
  accounts,
  onClose,
}: {
  payment: PaymentActivity
  accounts: IdName[]
  onClose: () => void
}) {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const id = useId()
  const confirm = useConfirm()
  const record = useRecordPayment()
  const unrecord = useUnrecordPayment()
  const del = useDeletePayment()
  const [accountId, setAccountId] = useState<number | null>(accounts[0]?.id ?? null)
  const busy = record.isPending || unrecord.isPending || del.isPending
  const { from, to } = paymentNames(payment, t)
  const accountLabel = payment.i_paid ? t('shared.paidFrom') : t('shared.receivedInto')

  const onDelete = async () => {
    if (
      await confirm({
        title: t('shared.deletePaymentConfirm'),
        destructive: true,
        confirmLabel: t('common.delete'),
      })
    )
      del.mutate(payment.id, { onSuccess: onClose })
  }

  return (
    <div className="min-w-0 pb-2">
      <div className="mb-3 text-center">
        <p className="text-[17px] font-semibold">{t('shared.paymentTitle', { from, to })}</p>
        <Money
          value={payment.amount}
          tone="none"
          className="mt-1 block text-[32px] font-bold tracking-tight"
        />
      </div>
      <div className="rounded-2xl border bg-card px-3.5 shadow-card">
        <DetailRow label={t('shared.date')}>{fullDateLabel(payment.date, lang, today)}</DetailRow>
        {payment.notes ? <DetailRow label={t('shared.note')}>{payment.notes}</DetailRow> : null}
        <DetailRow label={t('shared.addedByLabel')}>{addedByText(payment.added_by, t)}</DetailRow>
      </div>

      {payment.involved ? (
        <section
          className="mt-4 rounded-2xl border bg-card p-3.5 shadow-card"
          aria-labelledby={`${id}-acc-h`}
        >
          <h3
            id={`${id}-acc-h`}
            className="flex items-center justify-between gap-2 text-[15px] font-semibold"
          >
            {t('shared.myAccounts')}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                payment.recorded ? 'bg-positive/15 text-positive' : 'bg-warning/15 text-warning',
              )}
            >
              {payment.recorded ? t('shared.inAccounts') : t('shared.notInAccounts')}
            </span>
          </h3>
          {payment.recorded ? (
            <Button
              size="touch"
              variant="outline"
              className="mt-4 w-full"
              disabled={busy}
              onClick={() => unrecord.mutate(payment.id)}
            >
              {t('shared.removeFromAccounts')}
            </Button>
          ) : (
            <>
              <FieldLabel id={`${id}-acc`}>{accountLabel}</FieldLabel>
              {accounts.length ? (
                <ChipPicker
                  labelledBy={`${id}-acc`}
                  label={accountLabel}
                  value={accountId}
                  onChange={setAccountId}
                  options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                />
              ) : (
                <Hint className="mt-0">{t('shared.noOwnAccounts')}</Hint>
              )}
              <FieldError>{record.isError ? errorMessage(record.error) : null}</FieldError>
              <Button
                size="touch"
                className="mt-4 h-auto min-h-11 w-full py-2 whitespace-normal"
                disabled={busy || !accounts.length}
                onClick={() => record.mutate({ id: payment.id, account_id: accountId })}
              >
                {payment.i_paid ? t('shared.recordAsPaid') : t('shared.recordAsReceived')}
              </Button>
            </>
          )}
        </section>
      ) : null}

      <Button
        size="touch"
        variant="destructive"
        className="mt-5 w-full"
        disabled={busy}
        onClick={() => void onDelete()}
      >
        <Trash2 aria-hidden />
        {t('shared.deletePayment')}
      </Button>
    </div>
  )
}
