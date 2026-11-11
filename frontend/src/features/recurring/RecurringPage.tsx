import { ChevronRight, Info, Pause, Plus, Repeat } from 'lucide-react'
import { useToday } from '@/bootstrap/bootstrap'
import { CategoryIcon } from '@/components/CategoryIcon'
import { EmptyState } from '@/components/EmptyState'
import { ListGroup } from '@/components/ListGroup'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { useSheet } from '@/components/manage/useSheet'
import { ListSkeleton } from '@/components/skeletons'
import { TagText } from '@/components/TagText'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useLang, useT } from '@/i18n'
import { fullDateLabel } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useRecurringRules } from './api'
import { RecurringSheet } from './RecurringSheet'
import { durationLabel, scheduleLabel, type RecurringRule } from './recurringForm'

/** /recurring: rules list (expenses and income) with add / edit / pause / delete. */
export default function RecurringPage() {
  const t = useT()
  const rules = useRecurringRules()
  const sheet = useSheet<RecurringRule | null>()
  const open = sheet.show

  const items = rules.data?.items ?? []
  const expenses = items.filter((r) => r.entry_type === 'expense')
  const income = items.filter((r) => r.entry_type !== 'expense')

  return (
    <>
      <PageHeader
        title={t('nav.recurring')}
        actions={
          <Button
            size="icon-touch"
            className="rounded-full"
            aria-label={t('recurring.newTitle')}
            onClick={() => open(null)}
          >
            <Plus aria-hidden />
          </Button>
        }
      />
      <details className="group mb-4 rounded-2xl border bg-card px-3.5 py-2.5 text-sm shadow-card">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
          <Info aria-hidden className="size-4 text-muted-foreground" />
          {t('recurring.howItWorks')}
        </summary>
        <p className="mt-2 text-muted-foreground">{t('recurring.intro')}</p>
      </details>

      {rules.isPending ? (
        <ListSkeleton rows={4} />
      ) : !items.length ? (
        <EmptyState
          icon={Repeat}
          title={t('recurring.empty')}
          description={t('recurring.emptyHint')}
          action={
            <Button size="touch" onClick={() => open(null)}>
              <Plus aria-hidden />
              {t('recurring.newTitle')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-6 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
          {expenses.length ? (
            <ListGroup header={t('recurring.expenses')} label={t('recurring.expenses')}>
              {expenses.map((r) => (
                <RuleRow key={r.id} rule={r} onOpen={() => open(r)} />
              ))}
            </ListGroup>
          ) : null}
          {income.length ? (
            <ListGroup header={t('recurring.incomeHeader')} label={t('recurring.incomeHeader')}>
              {income.map((r) => (
                <RuleRow key={r.id} rule={r} onOpen={() => open(r)} />
              ))}
            </ListGroup>
          ) : null}
        </div>
      )}

      {sheet.state ? (
        <RecurringSheet
          key={sheet.state.key}
          open={sheet.state.open}
          onOpenChange={sheet.onOpenChange}
          rule={sheet.state.item}
        />
      ) : null}
    </>
  )
}

function RuleRow({ rule: r, onOpen }: { rule: RecurringRule; onOpen: () => void }) {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const category = r.category_name ?? '—'
  const when = r.start_date
    ? t('recurring.fromDate', { date: fullDateLabel(r.start_date, lang, today) })
    : t('recurring.onDay', { day: r.day_of_month })
  const parts = [
    scheduleLabel(t, r.interval_unit, r.interval_count),
    when,
    durationLabel(t, r.months_to_run),
    r.account_name,
  ]
  const amount = r.entry_type === 'expense' ? -r.amount : r.amount
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('recurring.rowLabel', { name: r.notes || category })}
        className="flex min-h-14 w-full cursor-pointer items-start gap-3 px-3.5 py-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted"
      >
        <CategoryIcon name={category} className={cn(!r.enabled && 'opacity-50')} />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span
              className={cn(
                'min-w-0 text-[15px] leading-snug font-medium break-words',
                !r.enabled && 'text-muted-foreground',
              )}
            >
              {r.notes ? <TagText text={r.notes} asText /> : category}
            </span>
            <Money
              value={amount}
              signed={r.entry_type !== 'expense'}
              tone="positive"
              className={cn('shrink-0 text-[15px] font-semibold', !r.enabled && 'opacity-60')}
            />
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {(r.notes ? [category, ...parts] : parts).join(' · ')}
          </span>
          {!r.enabled ? (
            <Badge variant="secondary" className="mt-1.5">
              <Pause aria-hidden />
              {t('recurring.paused')}
            </Badge>
          ) : null}
        </span>
        <ChevronRight aria-hidden className="mt-3 size-4 shrink-0 text-muted-foreground/70" />
      </button>
    </li>
  )
}
