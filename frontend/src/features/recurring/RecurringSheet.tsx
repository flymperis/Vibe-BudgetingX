import { Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { errorMessage } from '@/app/query-client'
import { useBootstrap, useToday } from '@/bootstrap/bootstrap'
import { AmountInput } from '@/components/Amount'
import { CategoryGlyph } from '@/components/CategoryIcon'
import { ChipPicker } from '@/components/ChipPicker'
import { useConfirm } from '@/components/confirm'
import { DatePicker } from '@/components/DatePicker'
import { FieldError, FieldLabel } from '@/components/FormField'
import { AccountAvatar } from '@/components/manage/AccountAvatar'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useT } from '@/i18n'
import { useDeleteRecurring, useSaveRecurring } from './api'
import {
  buildRecurringBody,
  emptyRecurringForm,
  INTERVAL_UNITS,
  MAX_INTERVAL,
  recurringFormFromRule,
  validateRecurring,
  type EntryType,
  type RecurringForm,
  type RecurringRule,
} from './recurringForm'

export interface RecurringSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = new rule. Mount with a fresh `key` for each rule. */
  rule: RecurringRule | null
}

export function RecurringSheet({ open, onOpenChange, rule }: RecurringSheetProps) {
  const t = useT()
  const boot = useBootstrap()
  const today = useToday()
  const isDesktop = useIsDesktop()
  const confirm = useConfirm()
  const save = useSaveRecurring()
  const del = useDeleteRecurring()
  const ids = {
    type: useId(),
    cat: useId(),
    amount: useId(),
    acc: useId(),
    every: useId(),
    unit: useId(),
    start: useId(),
    day: useId(),
    indef: useId(),
    times: useId(),
    notes: useId(),
    enabled: useId(),
  }
  const isNew = rule === null
  const [form, setForm] = useState<RecurringForm>(() =>
    rule
      ? recurringFormFromRule(rule)
      : emptyRecurringForm(today, boot.categories[0]?.id ?? null, boot.accounts[0]?.id ?? null),
  )
  const [problem, setProblem] = useState<string | null>(null)
  const set = (patch: Partial<RecurringForm>) => {
    setProblem(null)
    save.reset()
    setForm((f) => ({ ...f, ...patch }))
  }

  const categories = form.type === 'expense' ? boot.categories : boot.income_categories
  const setType = (type: EntryType) => {
    if (type === form.type) return
    const list = type === 'expense' ? boot.categories : boot.income_categories
    set({ type, categoryId: list[0]?.id ?? null })
  }

  const submit = () => {
    const issue = validateRecurring(form, isNew)
    if (issue) {
      setProblem(t(issue))
      return
    }
    save.mutate(
      { id: rule?.id ?? null, body: buildRecurringBody(form) },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  const remove = async () => {
    if (!rule) return
    const ok = await confirm({
      title: t('recurring.deleteTitle'),
      description: t('recurring.deleteText'),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (ok) del.mutate(rule.id, { onSuccess: () => onOpenChange(false) })
  }

  const unitLabel = (u: (typeof INTERVAL_UNITS)[number]) =>
    t(Number(form.intervalCount) > 1 ? `recurring.unitMany.${u}` : `recurring.unitOne.${u}`)

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? t('recurring.newTitle') : t('recurring.editTitle')}
      footer={
        <>
          <Button size="block" onClick={submit} disabled={save.isPending}>
            {isNew ? t('recurring.add') : t('common.save')}
          </Button>
          {!isNew ? (
            <Button variant="destructive" size="block" onClick={remove} disabled={del.isPending}>
              <Trash2 aria-hidden />
              {t('recurring.delete')}
            </Button>
          ) : null}
        </>
      }
    >
      <FieldLabel id={ids.type} className="mt-1">
        {t('recurring.type')}
      </FieldLabel>
      <ChipPicker
        labelledBy={ids.type}
        label={t('recurring.type')}
        value={form.type}
        onChange={setType}
        options={[
          { value: 'expense', label: t('recurring.expense') },
          { value: 'income', label: t('recurring.income') },
        ]}
      />

      <FieldLabel id={ids.cat}>{t('common.category')}</FieldLabel>
      {categories.length ? (
        <ChipPicker
          labelledBy={ids.cat}
          label={t('common.category')}
          bleed={!isDesktop}
          value={form.categoryId}
          onChange={(categoryId) => set({ categoryId })}
          options={categories.map((c) => ({
            value: c.id,
            label: c.name,
            icon: <CategoryGlyph name={c.name} />,
          }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t('recurring.noCategories')}</p>
      )}

      <FieldLabel htmlFor={ids.amount}>{t('recurring.amount')}</FieldLabel>
      <AmountInput id={ids.amount} value={form.amount} onChange={(amount) => set({ amount })} />

      <FieldLabel id={ids.acc}>{t('common.account')}</FieldLabel>
      <ChipPicker
        labelledBy={ids.acc}
        label={t('common.account')}
        bleed={!isDesktop}
        value={form.accountId}
        onChange={(accountId) => set({ accountId })}
        options={boot.accounts.map((a) => ({
          value: a.id,
          label: a.name,
          icon: <AccountAvatar name={a.name} bank={a.bank} size="xs" />,
        }))}
      />

      <FieldLabel htmlFor={ids.every}>{t('recurring.repeatEvery')}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={ids.every}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_INTERVAL}
          value={form.intervalCount}
          onChange={(e) => set({ intervalCount: e.target.value })}
          className="w-20 text-center"
        />
        <ChipPicker
          label={t('recurring.repeatUnit')}
          value={form.intervalUnit}
          onChange={(intervalUnit) => set({ intervalUnit })}
          options={INTERVAL_UNITS.map((u) => ({ value: u, label: unitLabel(u) }))}
        />
      </div>

      <div className="grid gap-x-3 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor={ids.start}>{t('recurring.firstDate')}</FieldLabel>
          {form.startDate ? (
            <DatePicker id={ids.start} value={form.startDate} onChange={(startDate) => set({ startDate })} />
          ) : (
            <Button
              id={ids.start}
              variant="outline"
              className="h-11 w-full justify-start rounded-xl md:h-9 md:rounded-lg"
              onClick={() => set({ startDate: today })}
            >
              {t('recurring.setFirstDate')}
            </Button>
          )}
        </div>
        {!form.startDate ? (
          <div>
            <FieldLabel htmlFor={ids.day}>{t('recurring.dayOfMonth')}</FieldLabel>
            <Input
              id={ids.day}
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              value={form.dayOfMonth}
              onChange={(e) => set({ dayOfMonth: e.target.value })}
            />
          </div>
        ) : null}
      </div>
      {!form.startDate ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{t('recurring.legacyHint')}</p>
      ) : null}

      <div className="mt-4 flex min-h-11 items-center justify-between gap-3">
        <label htmlFor={ids.indef} className="text-[15px] font-medium">
          {t('recurring.indefinitelyToggle')}
        </label>
        <Switch
          id={ids.indef}
          checked={form.indefinitely}
          onCheckedChange={(indefinitely) => set({ indefinitely })}
        />
      </div>
      {!form.indefinitely ? (
        <>
          <FieldLabel htmlFor={ids.times} className="mt-2">
            {t('recurring.howManyTimes')}
          </FieldLabel>
          <Input
            id={ids.times}
            type="number"
            inputMode="numeric"
            min={1}
            placeholder={t('recurring.timesPlaceholder')}
            value={form.times}
            onChange={(e) => set({ times: e.target.value })}
          />
        </>
      ) : null}

      <FieldLabel htmlFor={ids.notes}>{t('recurring.notesOptional')}</FieldLabel>
      <Input
        id={ids.notes}
        value={form.notes}
        placeholder={t('recurring.notesPlaceholder')}
        onChange={(e) => set({ notes: e.target.value })}
      />

      {!isNew ? (
        <div className="mt-4 flex min-h-11 items-center justify-between gap-3">
          <label htmlFor={ids.enabled} className="min-w-0">
            <span className="block text-[15px] font-medium">{t('recurring.active')}</span>
            <span className="block text-xs text-muted-foreground">{t('recurring.activeHint')}</span>
          </label>
          <Switch id={ids.enabled} checked={form.enabled} onCheckedChange={(enabled) => set({ enabled })} />
        </div>
      ) : null}

      <FieldError>{problem ?? (save.error ? errorMessage(save.error) : null)}</FieldError>
    </ResponsiveSheet>
  )
}
