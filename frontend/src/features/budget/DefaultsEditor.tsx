import { Copy, Lock, LockOpen, Split } from 'lucide-react'
import { useMutationLock } from '@/hooks/useMutationLock'
import { useId, useState } from 'react'
import { useConfirm } from '@/components/confirm'
import { Panel } from '@/components/Cards'
import { CategoryIcon, IconTile } from '@/components/CategoryIcon'
import { EmptyState } from '@/components/EmptyState'
import { FieldError } from '@/components/FormField'
import { ListGroup } from '@/components/ListGroup'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/app/query-client'
import { useLang, useT, type TFunction } from '@/i18n'
import { amountToText, sanitizeAmountTyping } from '@/lib/amount'
import { monthLabelGenitive } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useSaveDefaults, type BudgetPanel, type MonthSnapshot } from './api'
import { CopyMonthSheet } from './CopyMonthSheet'
import {
  applySnapshot,
  defaultsPayload,
  distribute,
  draftFromFormRows,
  liveTotal,
  type DistributeResult,
  type DraftRow,
} from './defaults'

function distributeMessage(t: TFunction, r: DistributeResult): string {
  if (!r.ok) {
    if (r.reason === 'fixedExceed') return t('budget.distFixedExceed', { amount: formatMoney(r.fixedTotal) })
    return t(
      r.reason === 'noTotal'
        ? 'budget.distNoTotal'
        : r.reason === 'fixedCover'
          ? 'budget.distFixedCover'
          : r.reason === 'nothingToSplit'
            ? 'budget.distNothing'
            : 'budget.distNoHistory',
    )
  }
  const cats = t(r.changed === 1 ? 'budget.catCountOne' : 'budget.catCountMany', { count: r.changed })
  const head = r.fixedCount
    ? t('budget.distKeptFixed', {
        fixed: t(r.fixedCount === 1 ? 'budget.fixedCountOne' : 'budget.fixedCountMany', {
          count: r.fixedCount,
        }),
        fixedTotal: formatMoney(r.fixedTotal),
        amount: formatMoney(r.remaining),
        cats,
      })
    : t('budget.distSplit', { amount: formatMoney(r.remaining), cats })
  const tail = r.withoutHistory > 0 ? t('budget.distLeftNoHistory') : t('budget.distLeftOther')
  return `${head} ${tail} ${t('budget.reviewAndSave')}`
}

export interface DefaultsEditorProps {
  data: BudgetPanel
  onClose: () => void
}

/** "Monthly budgets": every category's default, Fixed flags, Everything else, Distribute, Copy. */
export function DefaultsEditor({ data, onClose }: DefaultsEditorProps) {
  const t = useT()
  const lang = useLang()
  const confirm = useConfirm()
  const totalId = useId()
  const otherId = useId()
  const save = useSaveDefaults()
  const lock = useMutationLock(save)
  const [rows, setRows] = useState<DraftRow[]>(() => draftFromFormRows(data.form_rows))
  const [other, setOther] = useState(() => amountToText(data.other_amount))
  const [distTotal, setDistTotal] = useState('')
  const [status, setStatus] = useState('')
  const [dirty, setDirty] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)

  const total = liveTotal(rows, other)
  const snapshots = data.month_snapshots

  const update = (id: number, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setDirty(true)
  }

  const runDistribute = () => {
    const result = distribute(rows, distTotal)
    if (result.ok) {
      setRows(result.rows)
      setDirty(true)
    }
    setStatus(distributeMessage(t, result))
  }

  const prefill = (snapshot: MonthSnapshot) => {
    setRows((prev) => applySnapshot(prev, snapshot))
    setDirty(true)
    setCopyOpen(false)
    setStatus(t('budget.prefilledFrom', { month: monthLabelGenitive(snapshot.ym, lang) }))
  }

  const close = async () => {
    if (
      dirty &&
      !(await confirm({
        title: t('budget.discardTitle'),
        confirmLabel: t('budget.discard'),
        destructive: true,
      }))
    )
      return
    onClose()
  }

  const submit = () => {
    if (!lock.take()) return
    save.mutate(defaultsPayload(rows, other), { onSuccess: onClose })
  }

  return (
    <>
      <PageHeader
        title={t('budget.defaultsTitle')}
        eyebrow={t('nav.budget')}
        actions={
          <Button variant="ghost" size="touch" onClick={close}>
            {t('common.cancel')}
          </Button>
        }
      />
      <p className="mx-0.5 -mt-2 mb-4 text-sm text-muted-foreground">{t('budget.defaultsIntro')}</p>

      {rows.length ? (
        <Panel className="mb-4">
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            <Split aria-hidden className="size-4 text-muted-foreground" />
            {t('budget.distributeTitle')}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('budget.distributeHint')}</p>
          <div className="mt-3 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                id={totalId}
                inputMode="decimal"
                autoComplete="off"
                aria-label={t('budget.distributeTotal')}
                placeholder={t('budget.distributeTotal')}
                value={distTotal.replace('.', ',')}
                onChange={(e) => setDistTotal(sanitizeAmountTyping(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runDistribute()
                }}
                className="pr-8 text-right tabular-nums"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-muted-foreground"
              >
                €
              </span>
            </div>
            <Button variant="secondary" size="touch" className="md:h-9" onClick={runDistribute}>
              {t('budget.distribute')}
            </Button>
          </div>
          <Button
            variant="outline"
            size="touch"
            className="mt-3 w-full md:h-9"
            disabled={!snapshots.length}
            onClick={() => setCopyOpen(true)}
          >
            <Copy aria-hidden />
            {t('budget.copyFromMonth')}
          </Button>
          {!snapshots.length ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{t('budget.copyNone')}</p>
          ) : null}
          <p aria-live="polite" className={cn('text-sm', status && 'mt-3 rounded-xl bg-muted/70 px-3 py-2')}>
            {status}
          </p>
        </Panel>
      ) : null}

      {rows.length ? (
        <ListGroup
          header={t('budget.categories')}
          headerAside={t('budget.perMonth')}
          label={t('budget.defaultsTitle')}
        >
          {rows.map((r) => (
            <li
              key={r.id}
              className={cn('flex min-h-16 items-center gap-3 px-3.5 py-2.5', r.fixed && 'bg-primary/5')}
            >
              <CategoryIcon name={r.name} className="max-sm:hidden" />
              <span className="min-w-0 flex-1">
                <label
                  htmlFor={`budget-default-${r.id}`}
                  className="line-clamp-2 text-[15px] leading-snug font-medium"
                >
                  {r.name}
                </label>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {r.avg > 0 ? t('budget.avgShort', { amount: formatMoney(r.avg) }) : t('budget.noHistory')}
                </span>
              </span>
              <div className="relative w-24 shrink-0 sm:w-28">
                <Input
                  id={`budget-default-${r.id}`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="—"
                  value={r.value.replace('.', ',')}
                  onChange={(e) => update(r.id, { value: sanitizeAmountTyping(e.target.value) })}
                  className="pr-7 text-right font-medium tabular-nums"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-sm text-muted-foreground"
                >
                  €
                </span>
              </div>
              <Button
                variant={r.fixed ? 'default' : 'ghost'}
                size="icon-touch"
                aria-pressed={r.fixed}
                aria-label={t('budget.fixedFor', { name: r.name })}
                title={t('budget.fixedHint')}
                onClick={() => update(r.id, { fixed: !r.fixed })}
                className={cn('shrink-0', !r.fixed && 'text-muted-foreground')}
              >
                {r.fixed ? <Lock aria-hidden /> : <LockOpen aria-hidden />}
              </Button>
            </li>
          ))}
        </ListGroup>
      ) : (
        <EmptyState title={t('budget.noCategories')} />
      )}
      {rows.length ? (
        <p className="mx-1 mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock aria-hidden className="size-3.5" />
          {t('budget.fixedLegend')}
        </p>
      ) : null}

      <ListGroup className="mt-5">
        <li className="flex min-h-16 items-center gap-3 px-3.5 py-2.5">
          <IconTile tone="muted" className="max-sm:hidden">
            …
          </IconTile>
          <span className="min-w-0 flex-1">
            <label htmlFor={otherId} className="block text-[15px] leading-snug font-medium">
              {t('budget.everythingElse')}
            </label>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t('budget.everythingElseHint')}
            </span>
          </span>
          <div className="relative w-24 shrink-0 sm:w-28">
            <Input
              id={otherId}
              inputMode="decimal"
              autoComplete="off"
              placeholder="—"
              value={other.replace('.', ',')}
              onChange={(e) => {
                setOther(sanitizeAmountTyping(e.target.value))
                setDirty(true)
              }}
              className="pr-7 text-right font-medium tabular-nums"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-sm text-muted-foreground"
            >
              €
            </span>
          </div>
          <span aria-hidden className="w-10 shrink-0 sm:w-11" />
        </li>
      </ListGroup>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-10 mt-5 rounded-2xl border bg-card/95 p-3 shadow-card backdrop-blur md:bottom-4">
        <div className="mb-2 flex items-baseline justify-between gap-2 px-1" aria-live="polite">
          <span className="text-sm text-muted-foreground">{t('budget.totalMonthly')}</span>
          <Money value={total} tone="none" className="text-lg font-bold" />
        </div>
        <FieldError>{save.error ? errorMessage(save.error) : null}</FieldError>
        <Button size="block" className="mt-1" onClick={submit} disabled={save.isPending}>
          {t('budget.saveBudgets')}
        </Button>
      </div>

      <CopyMonthSheet
        open={copyOpen}
        onOpenChange={setCopyOpen}
        snapshots={snapshots}
        rows={rows}
        otherText={other}
        onPrefill={prefill}
      />
    </>
  )
}
