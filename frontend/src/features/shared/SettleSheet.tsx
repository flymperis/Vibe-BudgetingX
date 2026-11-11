import { useId, useState } from 'react'
import { errorMessage } from '@/app/query-client'
import { AmountInput } from '@/components/Amount'
import { ChipPicker } from '@/components/ChipPicker'
import { DatePicker } from '@/components/DatePicker'
import { FieldError, FieldLabel } from '@/components/FormField'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useT } from '@/i18n'
import { useAddPayment, type GroupDetail } from './api'
import { buildSettlementBody, initialSettleState, type SettleFormState, type SettlePrefill } from './forms'
import { personName } from './labels'
import { Hint } from './SharedParts'
import { toCents } from './split'

interface IdName {
  id: number
  name: string
}

export interface SettleSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: GroupDetail
  prefill: SettlePrefill | null
  accounts: IdName[]
}

/** Record a payment between two members ("Settle up"). */
export function SettleSheet({ open, onOpenChange, group, prefill, accounts }: SettleSheetProps) {
  const t = useT()
  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSession((s) => s + 1)
  }
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={t('shared.settleUp')}>
      {session > 0 ? (
        <SettleForm
          key={session}
          group={group}
          prefill={prefill}
          accounts={accounts}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </ResponsiveSheet>
  )
}

export function SettleForm({
  group,
  prefill,
  accounts,
  onDone,
}: Omit<SettleSheetProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const t = useT()
  const id = useId()
  const isDesktop = useIsDesktop()
  const add = useAddPayment()
  const [state, setState] = useState<SettleFormState>(() =>
    initialSettleState(
      group,
      accounts.map((a) => a.id),
      prefill,
    ),
  )
  const set = <K extends keyof SettleFormState>(key: K, value: SettleFormState[K]) => {
    if (add.isError) add.reset()
    setState((s) => ({ ...s, [key]: value }))
  }
  const me = group.me_id
  const iPay = me !== null && state.fromId === me
  const iReceive = me !== null && state.toId === me
  const people = group.members.map((m) => ({ value: m.id, label: personName(m.name, m.is_me, t) }))
  const canSave = toCents(state.amount) > 0 && state.fromId !== null && state.toId !== null && !add.isPending

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave)
          add.mutate({ groupId: group.id, body: buildSettlementBody(state, me) }, { onSuccess: onDone })
      }}
      className="min-w-0 pb-1"
    >
      <FieldLabel htmlFor={`${id}-amount`} className="mt-1">
        {t('common.amount')}
      </FieldLabel>
      <AmountInput id={`${id}-amount`} value={state.amount} onChange={(v) => set('amount', v)} />

      <FieldLabel id={`${id}-from`}>{t('shared.whoPaid')}</FieldLabel>
      <ChipPicker
        labelledBy={`${id}-from`}
        label={t('shared.whoPaid')}
        bleed={!isDesktop}
        value={state.fromId}
        onChange={(v) => set('fromId', v)}
        options={people}
      />
      <FieldLabel id={`${id}-to`}>{t('shared.paidTo')}</FieldLabel>
      <ChipPicker
        labelledBy={`${id}-to`}
        label={t('shared.paidTo')}
        bleed={!isDesktop}
        value={state.toId}
        onChange={(v) => set('toId', v)}
        options={people}
      />

      <div className="grid gap-x-4 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${id}-date`}>{t('shared.date')}</FieldLabel>
          <DatePicker id={`${id}-date`} value={state.paidOn} onChange={(v) => set('paidOn', v)} />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-note`}>{t('shared.note')}</FieldLabel>
          <Input
            id={`${id}-note`}
            maxLength={60}
            autoComplete="off"
            placeholder={t('shared.notePlaceholder')}
            value={state.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>
      </div>

      {iPay || iReceive ? (
        <div className="mt-4 rounded-2xl border bg-card p-3.5 shadow-card">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
            <span className="text-[15px] font-medium">{t('shared.recordInAccounts')}</span>
            <Switch checked={state.record} onCheckedChange={(v) => set('record', v)} />
          </label>
          {state.record ? (
            <>
              <FieldLabel id={`${id}-acc`} className="mt-2">
                {iPay ? t('shared.paidFrom') : t('shared.receivedInto')}
              </FieldLabel>
              {accounts.length ? (
                <ChipPicker
                  labelledBy={`${id}-acc`}
                  label={iPay ? t('shared.paidFrom') : t('shared.receivedInto')}
                  value={state.accountId}
                  onChange={(v) => set('accountId', v)}
                  options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                />
              ) : (
                <Hint className="mt-0">{t('shared.noOwnAccounts')}</Hint>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      <FieldError>{add.isError ? errorMessage(add.error) : null}</FieldError>
      <Button type="submit" size="block" className="mt-5" disabled={!canSave}>
        {t('shared.recordPayment')}
      </Button>
    </form>
  )
}
