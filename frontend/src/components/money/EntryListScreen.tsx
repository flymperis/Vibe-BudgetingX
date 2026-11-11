import { Loader2, PiggyBank, Plus, ReceiptText } from 'lucide-react'
import { AddButton } from '@/components/AddButton'
import { useEffect, useId, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { useQuickAdd } from '@/app/quick-add'
import { useBootstrap, useToday } from '@/bootstrap/bootstrap'
import { CategoryGlyph } from '@/components/CategoryIcon'
import { ChipPicker } from '@/components/ChipPicker'
import { EmptyState } from '@/components/EmptyState'
import { ListGroup } from '@/components/ListGroup'
import { MonthSwitcher } from '@/components/MonthSwitcher'
import { PageHeader } from '@/components/PageHeader'
import { ListSkeleton } from '@/components/skeletons'
import { Button } from '@/components/ui/button'
import { MONTH_PARAM, useMonth } from '@/hooks/useMonth'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useLang, useT } from '@/i18n'
import { currentMonth, monthLabel, relativeDayLabel } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { flattenPages, groupByDay, useEntryList, type EntryKind } from './entries'
import { EntryActionSheets } from './EntryActionSheets'
import { TxnRow } from './TxnRow'
import { useEntryActions } from './use-entry-actions'

/** URL params of the list filters (besides `month`). */
export const ALL_MONTHS_PARAM = 'all'
export const CATEGORY_PARAM = 'category'

/**
 * The Expenses / Income screen: month (or all months) and category filters,
 * rows grouped by day, endless list with "load more", add / edit / delete.
 */
export function EntryListScreen({ kind }: { kind: EntryKind }) {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const boot = useBootstrap()
  const isDesktop = useIsDesktop()
  const quickAdd = useQuickAdd()
  const actions = useEntryActions()
  const catLabel = useId()
  const { month } = useMonth()
  const [params, setParams] = useSearchParams()
  const allMonths = params.get(ALL_MONTHS_PARAM) === '1'
  const categoryParam = Number(params.get(CATEGORY_PARAM)) || null
  const categories = kind === 'expense' ? boot.categories : boot.income_categories
  const categoryId = categories.some((c) => c.id === categoryParam) ? categoryParam : null

  const setParam = (name: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === null) next.delete(name)
        else next.set(name, value)
        return next
      },
      { replace: true },
    )

  const list = useEntryList(kind, { month: allMonths ? null : month, categoryId })
  const rows = flattenPages(list.data)
  const total = list.data?.pages[0]?.total ?? 0
  const groups = groupByDay(rows)

  // Endless scrolling: load the next page when the sentinel comes into view.
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (items) => {
        if (items.some((i) => i.isIntersecting) && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const title = t(kind === 'expense' ? 'nav.expenses' : 'nav.income')
  const addLabel = t(kind === 'expense' ? 'money.newExpense' : 'money.newIncome')

  return (
    <>
      <PageHeader
        title={title}
        eyebrow={allMonths ? t('money.allMonths') : monthLabel(month, lang)}
        actions={<AddButton label={addLabel} onClick={() => quickAdd.open({ kind })} />}
      />

      <div className="mb-2 -ml-2 flex flex-wrap items-center gap-1">
        <MonthSwitcher
          month={month}
          className={cn(allMonths && 'opacity-60')}
          onChange={(m) =>
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                next.delete(ALL_MONTHS_PARAM)
                if (m === currentMonth()) next.delete(MONTH_PARAM)
                else next.set(MONTH_PARAM, m)
                return next
              },
              { replace: true },
            )
          }
        />
        <Button
          variant={allMonths ? 'default' : 'outline'}
          size="touch"
          aria-pressed={allMonths}
          className={cn('mr-0 ml-auto h-9 rounded-full px-3.5 text-[13px] md:ml-2', !allMonths && 'bg-card')}
          onClick={() => setParam(ALL_MONTHS_PARAM, allMonths ? null : '1')}
        >
          {t('money.allMonths')}
        </Button>
      </div>

      {categories.length ? (
        <>
          <span id={catLabel} className="sr-only">
            {t('money.categoryFilter')}
          </span>
          <ChipPicker
            bleed={!isDesktop}
            labelledBy={catLabel}
            label={t('money.categoryFilter')}
            value={categoryId ?? 0}
            onChange={(v) => setParam(CATEGORY_PARAM, v ? String(v) : null)}
            options={[
              { value: 0, label: t('money.allCategories') },
              ...categories.map((c) => ({
                value: c.id,
                label: c.name,
                icon: <CategoryGlyph name={c.name} />,
              })),
            ]}
            className="mb-4"
          />
        </>
      ) : null}

      {list.isPending ? (
        <ListSkeleton rows={6} />
      ) : list.isError ? (
        <EmptyState
          title={t('errors.loadFailed')}
          action={
            <Button size="touch" onClick={() => void list.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={kind === 'expense' ? ReceiptText : PiggyBank}
          title={
            categoryId !== null
              ? t(kind === 'expense' ? 'expenses.emptyFiltered' : 'income.emptyFiltered')
              : !allMonths
                ? t(kind === 'expense' ? 'expenses.emptyMonth' : 'income.emptyMonth', {
                    month: monthLabel(month, lang),
                  })
                : t(kind === 'expense' ? 'expenses.empty' : 'income.empty')
          }
          description={t(kind === 'expense' ? 'expenses.emptyHint' : 'income.emptyHint')}
          action={
            <Button size="touch" onClick={() => quickAdd.open({ kind })}>
              <Plus aria-hidden />
              {addLabel}
            </Button>
          }
        />
      ) : (
        <>
          <p className="mx-1 mb-3 text-xs text-muted-foreground" aria-live="polite">
            {total === 1 ? t('money.countOne') : t('money.count', { count: total })}
          </p>
          <div className="space-y-5">
            {groups.map((g) => (
              <ListGroup key={g.day} header={relativeDayLabel(g.day, lang, today)}>
                {g.entries.map((e) => (
                  <TxnRow key={e.id} entry={e} today={today} onOpen={actions.open} />
                ))}
              </ListGroup>
            ))}
          </div>
          <div ref={sentinel} className="mt-5 flex flex-col items-center gap-2 text-xs text-muted-foreground">
            {rows.length < total ? <span>{t('money.showing', { shown: rows.length, total })}</span> : null}
            {hasNextPage ? (
              <Button
                variant="secondary"
                size="touch"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? <Loader2 aria-hidden className="animate-spin" /> : null}
                {t('money.loadMore')}
              </Button>
            ) : null}
          </div>
        </>
      )}

      <EntryActionSheets {...actions.sheets} />
    </>
  )
}
