import { ArrowDownUp } from 'lucide-react'
import { useId, useState } from 'react'
import { errorMessage } from '@/app/query-client'
import { AmountEntry, AmountKeypad } from '@/components/Amount'
import { ChipPicker } from '@/components/ChipPicker'
import { DatePicker } from '@/components/DatePicker'
import { FieldError, FieldLabel } from '@/components/FormField'
import { AccountAvatar } from '@/components/manage/AccountAvatar'
import type { Account } from '@/components/manage/accounts-api'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useT } from '@/i18n'
import { formatMoney } from '@/lib/money'
import { useCreateTransfer, type TransferDefaults } from './api'
import {
  buildTransferBody,
  sameAccount,
  swapAccounts,
  transferFormFromDefaults,
  validateTransfer,
  type TransferForm,
} from './transferForm'

export interface TransferSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: Account[]
  defaults: TransferDefaults
  /** Title variant for the "Pay card" pre-fill. */
  payingCard?: string | null
}

/** New transfer (old Transfer panel form). Mount with a fresh `key` each time it opens. */
export function TransferSheet({ open, onOpenChange, accounts, defaults, payingCard }: TransferSheetProps) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const ids = { from: useId(), to: useId(), date: useId(), notes: useId(), amount: useId() }
  const [form, setForm] = useState<TransferForm>(() => transferFormFromDefaults(defaults))
  const [problem, setProblem] = useState<string | null>(null)
  const create = useCreateTransfer()
  const set = (patch: Partial<TransferForm>) => {
    setProblem(null)
    create.reset()
    setForm((f) => ({ ...f, ...patch }))
  }

  const options = accounts.map((a) => ({
    value: a.id,
    icon: <AccountAvatar name={a.name} bank={a.bank} size="xs" />,
    label: (
      <span className="flex items-baseline gap-1.5">
        <span>{a.name}</span>
        <span className="text-[11px] tabular-nums opacity-75">{formatMoney(a.current_balance)}</span>
      </span>
    ),
  }))
  const same = sameAccount(form)

  const save = () => {
    const issue = validateTransfer(form)
    if (issue) {
      setProblem(t(issue))
      return
    }
    create.mutate(buildTransferBody(form), { onSuccess: () => onOpenChange(false) })
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={payingCard ? t('transfers.payTitle', { name: payingCard }) : t('transfers.newTitle')}
      footer={
        <Button size="block" onClick={save} disabled={same || create.isPending}>
          {t('transfers.record')}
        </Button>
      }
    >
      <AmountEntry value={form.amount} onChange={(amount) => set({ amount })} autoFocus={isDesktop} />

      <FieldLabel id={ids.from}>{t('transfers.from')}</FieldLabel>
      <ChipPicker
        labelledBy={ids.from}
        label={t('transfers.from')}
        bleed={!isDesktop}
        value={form.fromId}
        onChange={(fromId) => set({ fromId })}
        options={options}
      />
      <div className="mt-3 -mb-1 flex justify-center">
        <Button
          variant="outline"
          size="icon-touch"
          className="rounded-full"
          aria-label={t('transfers.swap')}
          onClick={() => set(swapAccounts(form))}
        >
          <ArrowDownUp aria-hidden />
        </Button>
      </div>
      <FieldLabel id={ids.to} className="mt-0">
        {t('transfers.to')}
      </FieldLabel>
      <ChipPicker
        labelledBy={ids.to}
        label={t('transfers.to')}
        bleed={!isDesktop}
        value={form.toId}
        onChange={(toId) => set({ toId })}
        options={options}
      />
      {same ? (
        <p role="status" className="mt-2 text-sm font-medium text-warning">
          {t('transfers.sameAccount')}
        </p>
      ) : null}

      <div className="grid gap-x-3 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor={ids.date}>{t('transfers.date')}</FieldLabel>
          <DatePicker id={ids.date} value={form.date} onChange={(date) => set({ date })} />
        </div>
        <div>
          <FieldLabel htmlFor={ids.notes}>{t('common.notes')}</FieldLabel>
          <Textarea
            id={ids.notes}
            rows={1}
            value={form.notes}
            placeholder={t('common.notes')}
            onChange={(e) => set({ notes: e.target.value })}
            className="min-h-11 rounded-xl bg-card md:min-h-9 md:rounded-lg"
          />
        </div>
      </div>
      <FieldError>{problem ?? (create.error ? errorMessage(create.error) : null)}</FieldError>
      {!isDesktop ? (
        <AmountKeypad value={form.amount} onChange={(amount) => set({ amount })} className="mt-4" />
      ) : null}
    </ResponsiveSheet>
  )
}
