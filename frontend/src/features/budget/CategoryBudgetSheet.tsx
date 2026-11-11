import { useId, useState } from 'react'
import { AmountEntry, AmountKeypad } from '@/components/Amount'
import { DetailRow, FieldError } from '@/components/FormField'
import { Money } from '@/components/Money'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { errorMessage } from '@/app/query-client'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useLang, useT } from '@/i18n'
import { amountToText, parseAmountInput } from '@/lib/amount'
import { monthLabel } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useSaveDefaults, useSaveOverride, type BudgetFormRow, type BudgetLine } from './api'
import { remainingOf, singleDefaultPayload } from './defaults'

export interface CategoryTarget {
  id: number
  name: string
  /** The category's line in this month's budget (null: no budget this month). */
  line: BudgetLine | null
  formRow: BudgetFormRow | null
}

type Mode = 'month' | 'default'

export interface CategoryBudgetSheetProps {
  target: CategoryTarget | null
  month: string
  cleared: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Tap on a category: change its budget for this month only, or its default for every month. */
export function CategoryBudgetSheet({
  target,
  month,
  cleared,
  open,
  onOpenChange,
}: CategoryBudgetSheetProps) {
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={target?.name ?? ''} size="sm">
      {target ? (
        <SheetBody
          key={`${target.id}:${month}`}
          target={target}
          month={month}
          cleared={cleared}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </ResponsiveSheet>
  )
}

function SheetBody({
  target,
  month,
  cleared,
  onDone,
}: {
  target: CategoryTarget
  month: string
  cleared: boolean
  onDone: () => void
}) {
  const t = useT()
  const lang = useLang()
  const isDesktop = useIsDesktop()
  const fixedId = useId()
  const { line, formRow } = target
  const [mode, setMode] = useState<Mode>('month')
  const [monthValue, setMonthValue] = useState(() => amountToText(line?.budget))
  const [defaultValue, setDefaultValue] = useState(() => amountToText(formRow?.default))
  const [fixed, setFixed] = useState(formRow?.fixed ?? false)
  const [localError, setLocalError] = useState<string | null>(null)
  const override = useSaveOverride()
  const defaults = useSaveDefaults()

  const value = mode === 'month' ? monthValue : defaultValue
  const setValue = (v: string) => {
    setLocalError(null)
    if (mode === 'month') setMonthValue(v)
    else setDefaultValue(v)
  }
  const pending = override.isPending || defaults.isPending
  const serverError = mode === 'month' ? override.error : defaults.error
  const monthName = monthLabel(month, lang)
  const rest = line ? remainingOf(line) : null
  const hasOverride = line?.override !== null && line?.override !== undefined

  const save = () => {
    if (mode === 'month') {
      // The old field was `required`: a blank amount would silently drop the override.
      if (parseAmountInput(monthValue) === null) {
        setLocalError(t('budget.enterAmount'))
        return
      }
      override.mutate({ month, category_id: target.id, amount: monthValue }, { onSuccess: onDone })
    } else {
      defaults.mutate(singleDefaultPayload(target.id, defaultValue, fixed), { onSuccess: onDone })
    }
  }

  const clearOverride = () =>
    override.mutate({ month, category_id: target.id, clear: true }, { onSuccess: onDone })

  return (
    <div className="flex flex-col">
      {line ? (
        <div className="mb-1 rounded-2xl bg-muted/60 px-3.5 py-1">
          <p className="pt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {monthName}
          </p>
          <DetailRow label={t('budget.spent')}>
            <Money value={line.spent} tone="none" />
          </DetailRow>
          <DetailRow label={t('budget.budgetThisMonth')}>
            <Money value={line.budget} tone="none" />
          </DetailRow>
          {rest ? (
            <DetailRow label={t(rest.word === 'over' ? 'budget.over' : 'budget.left')}>
              <span className={cn('font-semibold', rest.word === 'over' && 'text-negative')}>
                {formatMoney(rest.amount)}
              </span>
            </DetailRow>
          ) : null}
        </div>
      ) : null}

      <div
        role="radiogroup"
        aria-label={t('budget.applyTo')}
        className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
      >
        {(['month', 'default'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => {
              setMode(m)
              setLocalError(null)
            }}
            className={cn(
              'min-h-11 truncate rounded-lg px-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              mode === m ? 'bg-card shadow-card' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {m === 'month' ? t('budget.thisMonthOnly') : t('budget.everyMonth')}
          </button>
        ))}
      </div>
      <p className="mx-0.5 mt-2 text-xs text-muted-foreground">
        {mode === 'month'
          ? cleared
            ? t('budget.monthHintCleared')
            : t('budget.monthHint')
          : formRow?.default === null || formRow?.default === undefined
            ? t('budget.defaultHintNone')
            : t('budget.defaultHint', { amount: formatMoney(formRow.default) })}
      </p>

      <div className="mt-3">
        <AmountEntry value={value} onChange={setValue} autoFocus />
      </div>

      {formRow && formRow.avg > 0 ? (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>{t('budget.avgHint', { amount: formatMoney(formRow.avg) })}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 rounded-full"
            onClick={() => setValue(amountToText(formRow.avg))}
          >
            {t('budget.useAvg')}
          </Button>
        </div>
      ) : null}

      {mode === 'default' ? (
        <label
          htmlFor={fixedId}
          className="mt-3 flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-2"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t('budget.fixed')}</span>
            <span className="block text-xs text-muted-foreground">{t('budget.fixedHint')}</span>
          </span>
          <Switch id={fixedId} checked={fixed} onCheckedChange={setFixed} />
        </label>
      ) : null}

      <FieldError>{localError ?? (serverError ? errorMessage(serverError) : null)}</FieldError>

      {!isDesktop ? <AmountKeypad value={value} onChange={setValue} className="mt-4" /> : null}

      <div className="mt-4 flex flex-col gap-2">
        <Button size="block" onClick={save} disabled={pending}>
          {t('common.save')}
        </Button>
        {mode === 'month' && hasOverride ? (
          <Button size="block" variant="secondary" onClick={clearOverride} disabled={pending}>
            {cleared ? t('budget.removeOverride') : t('budget.resetToDefault')}
          </Button>
        ) : null}
        {mode === 'default' && formRow?.default !== null && formRow?.default !== undefined ? (
          <Button
            size="block"
            variant="ghost"
            className="text-negative"
            onClick={() => defaults.mutate(singleDefaultPayload(target.id, '', fixed), { onSuccess: onDone })}
            disabled={pending}
          >
            {t('budget.removeDefault')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
