import { useId, useMemo, useState } from 'react'
import { errorMessage } from '@/app/query-client'
import { AmountInput } from '@/components/Amount'
import { CategoryGlyph } from '@/components/CategoryIcon'
import { ChipPicker } from '@/components/ChipPicker'
import { DatePicker } from '@/components/DatePicker'
import { FieldError, FieldLabel } from '@/components/FormField'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useT } from '@/i18n'
import { formatMoney } from '@/lib/money'
import { useSaveBill, type BillActivity, type GroupDetail } from './api'
import { buildBillBody, initialBillState, type BillFormState } from './forms'
import { methodLabel, personName } from './labels'
import { Hint } from './SharedParts'
import { SplitEditor } from './SplitEditor'
import { evaluateSplit, SPLIT_METHODS, toCents, type SplitMethod } from './split'

interface IdName {
  id: number
  name: string
}

export interface BillSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: GroupDetail
  /** null = new bill. */
  bill: BillActivity | null
  categories: IdName[]
  accounts: IdName[]
}

/** Add or edit a shared bill. */
export function BillSheet({ open, onOpenChange, group, bill, categories, accounts }: BillSheetProps) {
  const t = useT()
  // A fresh form for every opening.
  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSession((s) => s + 1)
  }
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={bill ? t('shared.editBill') : t('shared.newBill')}
      size="lg"
    >
      {session > 0 ? (
        <BillForm
          key={session}
          group={group}
          bill={bill}
          categories={categories}
          accounts={accounts}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </ResponsiveSheet>
  )
}

export function BillForm({
  group,
  bill,
  categories,
  accounts,
  onDone,
}: Omit<BillSheetProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const t = useT()
  const id = useId()
  const isDesktop = useIsDesktop()
  const save = useSaveBill()
  const [state, setState] = useState<BillFormState>(() =>
    initialBillState(group, {
      payload: bill?.payload ?? null,
      categoryIds: categories.map((c) => c.id),
      accountIds: accounts.map((a) => a.id),
    }),
  )
  // Each method keeps its own typed values (amounts are not percentages).
  const [stash, setStash] = useState<Partial<Record<SplitMethod, Record<number, string>>>>({})
  const changeMethod = (method: SplitMethod) => {
    if (method === state.method) return
    if (save.isError) save.reset()
    setStash((s) => ({ ...s, [state.method]: state.values }))
    const blank: Record<number, string> = {}
    group.members.forEach((m) => (blank[m.id] = ''))
    setState((s) => ({ ...s, method, values: stash[method] ?? blank }))
  }
  const set = <K extends keyof BillFormState>(key: K, value: BillFormState[K]) => {
    if (save.isError) save.reset()
    setState((s) => ({ ...s, [key]: value }))
  }

  const memberIds = group.members.map((m) => m.id)
  const totalCents = toCents(state.amount)
  const result = useMemo(
    () =>
      evaluateSplit(
        state.method,
        totalCents,
        group.members.map((m) => ({
          id: m.id,
          included: !!state.included[m.id],
          value: state.values[m.id] ?? '',
        })),
      ),
    [state.method, state.included, state.values, totalCents, group.members],
  )
  const me = group.me_id
  const myShare = me !== null ? (result.shares[me] ?? 0) : 0
  const iPaid = me !== null && state.paidBy === me
  const involved = iPaid || myShare > 0
  const canSave = totalCents > 0 && result.ok && state.paidBy !== null && !save.isPending

  const submit = () => {
    if (!canSave) return
    save.mutate(
      { groupId: group.id, billId: bill?.id, body: buildBillBody(state, memberIds) },
      { onSuccess: onDone },
    )
  }

  let hint: string | null = null
  if (!involved) hint = t('shared.hint.notPart')
  else if (state.record) {
    if (iPaid) {
      const lent = totalCents - myShare
      hint =
        (myShare
          ? t('shared.hint.paidShare', { share: formatMoney(myShare / 100) })
          : t('shared.hint.paidNothing')) +
        (lent > 0 ? t('shared.hint.lent', { lent: formatMoney(lent / 100) }) : '.')
    } else {
      hint = t('shared.hint.owed', { share: formatMoney(myShare / 100) })
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="min-w-0 pb-1"
    >
      <FieldLabel htmlFor={`${id}-amount`} className="mt-1">
        {t('common.amount')}
      </FieldLabel>
      <AmountInput
        id={`${id}-amount`}
        value={state.amount}
        onChange={(v) => set('amount', v)}
        autoFocus={isDesktop && !bill}
      />

      <FieldLabel htmlFor={`${id}-desc`}>{t('shared.description')}</FieldLabel>
      <Input
        id={`${id}-desc`}
        maxLength={60}
        autoComplete="off"
        placeholder={t('shared.descriptionPlaceholder')}
        value={state.description}
        onChange={(e) => set('description', e.target.value)}
      />

      <div className="grid gap-x-4 md:grid-cols-2">
        <div className="min-w-0">
          <FieldLabel id={`${id}-paid`}>{t('shared.paidBy')}</FieldLabel>
          <ChipPicker
            labelledBy={`${id}-paid`}
            label={t('shared.paidBy')}
            bleed={!isDesktop}
            value={state.paidBy}
            onChange={(v) => set('paidBy', v)}
            options={group.members.map((m) => ({ value: m.id, label: personName(m.name, m.is_me, t) }))}
          />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-date`}>{t('shared.date')}</FieldLabel>
          <DatePicker id={`${id}-date`} value={state.spentOn} onChange={(v) => set('spentOn', v)} />
        </div>
      </div>

      <FieldLabel id={`${id}-method`}>{t('shared.splitHow')}</FieldLabel>
      <ChipPicker
        labelledBy={`${id}-method`}
        label={t('shared.splitHow')}
        bleed={!isDesktop}
        value={state.method}
        onChange={changeMethod}
        options={SPLIT_METHODS.map((m) => ({ value: m, label: methodLabel(m, t) }))}
        className="mb-3"
      />
      <SplitEditor
        method={state.method}
        members={group.members}
        included={state.included}
        values={state.values}
        totalCents={totalCents}
        result={result}
        onInclude={(pid, on) => set('included', { ...state.included, [pid]: on })}
        onValues={(values) => set('values', values)}
      />

      <div className="mt-4 rounded-2xl border bg-card p-3.5 shadow-card">
        {involved ? (
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
            <span className="text-[15px] font-medium">{t('shared.recordMine')}</span>
            <Switch checked={state.record} onCheckedChange={(v) => set('record', v)} />
          </label>
        ) : null}
        {involved && state.record ? (
          <>
            {myShare > 0 ? (
              <>
                <FieldLabel id={`${id}-cat`} className="mt-2">
                  {t('shared.myShareCategory')}
                </FieldLabel>
                <ChipPicker
                  labelledBy={`${id}-cat`}
                  label={t('shared.myShareCategory')}
                  value={state.categoryId}
                  onChange={(v) => set('categoryId', v)}
                  options={categories.map((c) => ({
                    value: c.id,
                    label: c.name,
                    icon: <CategoryGlyph name={c.name} />,
                  }))}
                />
              </>
            ) : null}
            {iPaid ? (
              <>
                <FieldLabel id={`${id}-acc`} className="mt-3">
                  {t('shared.paidFrom')}
                </FieldLabel>
                {accounts.length ? (
                  <ChipPicker
                    labelledBy={`${id}-acc`}
                    label={t('shared.paidFrom')}
                    value={state.accountId}
                    onChange={(v) => set('accountId', v)}
                    options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                  />
                ) : (
                  <Hint className="mt-0">{t('shared.noOwnAccounts')}</Hint>
                )}
              </>
            ) : null}
          </>
        ) : null}
        {hint ? <Hint className={involved ? undefined : 'mt-0'}>{hint}</Hint> : null}
      </div>

      <FieldError>{save.isError ? errorMessage(save.error) : null}</FieldError>
      <Button type="submit" size="block" className="mt-5" disabled={!canSave}>
        {t('common.save')}
      </Button>
    </form>
  )
}
