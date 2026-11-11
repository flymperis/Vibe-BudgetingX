import { CircleGauge, Eraser, ListChecks, PencilLine, PowerOff, RotateCcw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { HeroCard } from '@/components/Cards'
import { CategoryIcon, IconTile } from '@/components/CategoryIcon'
import { useConfirm } from '@/components/confirm'
import { EmptyState } from '@/components/EmptyState'
import { ListGroup, ListRow, SectionHeader } from '@/components/ListGroup'
import { MonthSwitcher } from '@/components/MonthSwitcher'
import { PageHeader } from '@/components/PageHeader'
import { CardSkeleton, ListSkeleton } from '@/components/skeletons'
import { Button } from '@/components/ui/button'
import { useMonth } from '@/hooks/useMonth'
import { useLang, useT } from '@/i18n'
import { monthLabel } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  useBudget,
  useClearMonth,
  useRestoreMonth,
  useToggleBudget,
  type BudgetPanel,
  type BudgetSummary,
} from './api'
import { BudgetLineRow } from './BudgetLineRow'
import { CategoryBudgetSheet, type CategoryTarget } from './CategoryBudgetSheet'
import { clampPct } from './defaults'
import { DefaultsEditor } from './DefaultsEditor'

const EDIT_PARAM = 'edit'

export default function BudgetPage() {
  const t = useT()
  const { month } = useMonth()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const query = useBudget(month)
  const editing = params.get(EDIT_PARAM) === 'defaults'

  const openEditor = () => {
    const next = new URLSearchParams(params)
    next.set(EDIT_PARAM, 'defaults')
    void navigate({ search: `?${next.toString()}` }, { state: { budgetEditor: true } })
    window.scrollTo?.({ top: 0 })
  }
  const closeEditor = () => {
    if ((location.state as { budgetEditor?: boolean } | null)?.budgetEditor) void navigate(-1)
    else
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete(EDIT_PARAM)
          return next
        },
        { replace: true },
      )
  }

  if (query.isPending) {
    return (
      <>
        <PageHeader title={t('nav.budget')} />
        <div role="status" aria-live="polite" className="space-y-4">
          <span className="sr-only">{t('common.loading')}</span>
          <CardSkeleton className="h-40" />
          <ListSkeleton rows={5} />
        </div>
      </>
    )
  }
  if (query.isError) {
    return (
      <>
        <PageHeader title={t('nav.budget')} />
        <EmptyState
          icon={CircleGauge}
          title={t('errors.loadFailed')}
          action={
            <Button size="touch" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      </>
    )
  }

  const data = query.data
  if (editing && data.enabled) return <DefaultsEditor key={month} data={data} onClose={closeEditor} />

  return (
    <>
      <PageHeader title={t('nav.budget')} />
      {data.enabled && data.summary ? <MonthSwitcher className="mb-3 -ml-2" /> : null}
      {data.enabled && data.summary ? (
        <BudgetOn data={data} summary={data.summary} month={month} onEditDefaults={openEditor} />
      ) : (
        <BudgetOff />
      )}
    </>
  )
}

function BudgetOff() {
  const t = useT()
  const toggle = useToggleBudget()
  return (
    <EmptyState
      icon={CircleGauge}
      title={t('budget.offTitle')}
      description={t('budget.offDescription')}
      action={
        <Button size="touch" onClick={() => toggle.mutate({ enabled: true })} disabled={toggle.isPending}>
          {t('budget.enable')}
        </Button>
      }
    />
  )
}

function BudgetOn({
  data,
  summary,
  month,
  onEditDefaults,
}: {
  data: BudgetPanel
  summary: BudgetSummary
  month: string
  onEditDefaults: () => void
}) {
  const t = useT()
  const lang = useLang()
  const confirm = useConfirm()
  const toggle = useToggleBudget()
  const clearMonth = useClearMonth()
  const restore = useRestoreMonth()
  const [target, setTarget] = useState<CategoryTarget | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const monthName = monthLabel(month, lang)
  const cleared = summary.cleared
  const clearedEmpty = cleared && summary.rows.length === 0
  const fixedIds = new Set(data.form_rows.filter((r) => r.fixed).map((r) => r.id))
  const status = summary.total_status as 'ok' | 'warn' | 'over'

  const openCategory = (id: number, name: string) => {
    setTarget({
      id,
      name,
      line: summary.rows.find((r) => r.category_id === id) ?? null,
      formRow: data.form_rows.find((r) => r.id === id) ?? null,
    })
    setSheetOpen(true)
  }

  const doClear = async () => {
    const ok = await confirm({
      title: t('budget.clearConfirmTitle', { month: monthName }),
      description: t('budget.clearConfirmText'),
      confirmLabel: t('budget.clearMonth'),
      destructive: true,
    })
    if (ok) clearMonth.mutate({ month })
  }

  const restoreButton = (
    <Button
      variant="secondary"
      size="touch"
      className="mt-4 w-full border-0 bg-white/15 text-hero-foreground hover:bg-white/25"
      onClick={() => restore.mutate({ month })}
      disabled={restore.isPending}
    >
      <RotateCcw aria-hidden />
      {t('budget.restore')}
    </Button>
  )

  return (
    <>
      {clearedEmpty ? (
        <HeroCard label={t('budget.noBudgetFor', { month: monthName })} amount={data.cleared_total_spent}>
          <p className="-mt-3 text-[13px] opacity-80">{t('budget.spentThisMonth')}</p>
          {restoreButton}
        </HeroCard>
      ) : (
        <HeroCard
          label={t('budget.leftToSpend', { month: monthName })}
          amount={summary.total_remaining}
          pills={[
            { label: t('budget.budget'), value: summary.total_budget },
            { label: t('budget.spent'), value: summary.total_spent },
          ]}
        >
          <div
            role="progressbar"
            aria-label={t('budget.used')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(clampPct(summary.total_pct))}
            aria-valuetext={`${Math.round(summary.total_pct)}% · ${t(`progress.${status}`)}`}
            className="mt-4 h-2 overflow-hidden rounded-full bg-white/20"
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500',
                status === 'over' ? 'bg-negative' : status === 'warn' ? 'bg-warning' : 'bg-hero-foreground',
              )}
              style={{ width: `${clampPct(summary.total_pct)}%` }}
            />
          </div>
          <p className="mt-2 text-xs opacity-80">
            {t('budget.usedPct', { pct: Math.round(summary.total_pct) })}
            {status !== 'ok' ? ` · ${t(`progress.${status}`)}` : ''}
          </p>
          {cleared ? (
            <>
              <p className="mt-3 text-[13px] opacity-90">{t('budget.clearedNote')}</p>
              {restoreButton}
            </>
          ) : null}
        </HeroCard>
      )}

      {summary.over.length ? (
        <div
          role="status"
          className="mt-3.5 flex gap-3 rounded-2xl border border-negative/30 bg-negative/5 px-3.5 py-3"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-negative" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">
              {t(summary.over.length === 1 ? 'budget.overTitleOne' : 'budget.overTitleMany', {
                count: summary.over.length,
              })}
            </p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {summary.over.map((o) => (
                <li key={o.category_id ?? 'other'} className="flex justify-between gap-3">
                  <span className="truncate">
                    {o.category_id == null ? t('budget.everythingElse') : o.name}
                  </span>
                  <span className="shrink-0 font-medium text-negative tabular-nums">
                    {t('budget.overAmount', { amount: formatMoney(-o.remaining) })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="mx-0.5 mt-6 mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold">{t('budget.categories')}</h2>
        <Button variant="ghost" size="touch" className="-mr-2 text-primary" onClick={onEditDefaults}>
          <PencilLine aria-hidden />
          {t('budget.monthlyBudgets')}
        </Button>
      </div>

      {cleared ? (
        data.form_rows.length ? (
          <ListGroup label={t('budget.categories')}>
            {data.form_rows.map((row) => {
              const line = summary.rows.find((r) => r.category_id === row.id) ?? null
              return (
                <BudgetLineRow
                  key={row.id}
                  name={row.name}
                  line={line}
                  fixed={row.fixed}
                  overridden={line?.override != null}
                  onClick={() => openCategory(row.id, row.name)}
                  actionLabel={t('budget.changeFor', { name: row.name, month: monthName })}
                />
              )
            })}
          </ListGroup>
        ) : (
          <EmptyState title={t('budget.noCategories')} />
        )
      ) : summary.rows.length || summary.other ? (
        <ListGroup label={t('budget.categories')}>
          {summary.rows.map((line) => (
            <BudgetLineRow
              key={line.category_id}
              name={line.name}
              line={line}
              fixed={line.category_id != null && fixedIds.has(line.category_id)}
              overridden={line.override != null}
              onClick={() => openCategory(line.category_id!, line.name)}
              actionLabel={t('budget.changeFor', { name: line.name, month: monthName })}
            />
          ))}
          {summary.other ? (
            <BudgetLineRow
              name={t('budget.everythingElse')}
              line={summary.other}
              isOther
              onClick={onEditDefaults}
              actionLabel={t('budget.monthlyBudgets')}
            />
          ) : null}
        </ListGroup>
      ) : (
        <EmptyState
          icon={ListChecks}
          title={t('budget.noBudgetsYet')}
          description={t('budget.noBudgetsYetHint')}
          className="rounded-2xl border bg-card py-8 shadow-card"
          action={
            <Button size="touch" onClick={onEditDefaults}>
              {t('budget.setBudgets')}
            </Button>
          }
        />
      )}

      {!cleared && summary.unbudgeted.length ? (
        <>
          <SectionHeader title={summary.other ? t('budget.coveredByOther') : t('budget.notBudgeted')} />
          <ListGroup label={summary.other ? t('budget.coveredByOther') : t('budget.notBudgeted')}>
            {summary.unbudgeted.map((u) => (
              <ListRow
                key={u.category_id}
                icon={<CategoryIcon name={u.name} />}
                title={u.name}
                subtitle={t('budget.tapToBudget')}
                amount={u.spent}
                amountProps={{ tone: 'none' }}
                onClick={() => openCategory(u.category_id, u.name)}
                chevron
              />
            ))}
          </ListGroup>
        </>
      ) : null}

      <SectionHeader title={t('budget.manage')} />
      <ListGroup label={t('budget.manage')}>
        <ListRow
          icon={<IconTile icon={PencilLine} tone="primary" />}
          title={t('budget.monthlyBudgets')}
          subtitle={t('budget.monthlyBudgetsHint', { amount: formatMoney(data.defaults_total) })}
          onClick={onEditDefaults}
          chevron
        />
        {data.can_clear_month ? (
          <ListRow
            icon={<IconTile icon={Eraser} />}
            title={t('budget.clearMonth')}
            subtitle={t('budget.clearMonthHint', { month: monthName })}
            onClick={() => void doClear()}
          />
        ) : null}
        <ListRow
          icon={<IconTile icon={PowerOff} />}
          title={t('budget.disable')}
          subtitle={t('budget.disableHint')}
          onClick={() => toggle.mutate({ enabled: false })}
        />
      </ListGroup>

      <CategoryBudgetSheet
        target={target}
        month={month}
        cleared={cleared}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  )
}
