/**
 * SAMPLE Home: a static version of the approved mockup built from the real
 * building blocks, with made-up data. The home feature replaces this file.
 */
import { FlaskConical, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSession } from '@/auth/session'
import { useToday } from '@/bootstrap/bootstrap'
import { BudgetRow } from '@/components/BudgetRow'
import { HeroCard, Panel } from '@/components/Cards'
import { CategoryIcon } from '@/components/CategoryIcon'
import { useConfirm } from '@/components/confirm'
import { DetailRow } from '@/components/FormField'
import { ListGroup, ListRow, SectionHeader } from '@/components/ListGroup'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { ProgressBar } from '@/components/ProgressBar'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { TagText } from '@/components/TagText'
import { Button } from '@/components/ui/button'
import { SAMPLE_CATEGORIES, SAMPLE_TOTALS, sampleTransactions, type SampleTxn } from '@/dev/sample-data'
import { useMonth } from '@/hooks/useMonth'
import { useLang, useT } from '@/i18n'
import { monthLabel, relativeDayLabel } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

export default function HomePage() {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const { month } = useMonth()
  const session = useSession()
  const confirm = useConfirm()
  const [selected, setSelected] = useState<SampleTxn | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const txns = sampleTransactions(today)
  const spent = -SAMPLE_TOTALS.expenses
  const initial = session.data?.user?.username?.charAt(0) ?? 'Φ'
  const topCategories = [...SAMPLE_CATEGORIES].sort((a, b) => b.spent - a.spent).slice(0, 4)

  const openDetail = (txn: SampleTxn) => {
    setSelected(txn)
    setDetailOpen(true)
  }

  return (
    <>
      <PageHeader
        title={t('nav.home')}
        eyebrow={monthLabel(month, lang)}
        actions={
          <span
            aria-hidden
            className="grid size-10 place-items-center rounded-full bg-primary text-base font-semibold text-primary-foreground uppercase"
          >
            {initial}
          </span>
        }
      />

      <p className="mb-3 flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <FlaskConical aria-hidden className="size-4 shrink-0" />
        {t('home.sampleNotice')}
      </p>

      <HeroCard
        label={t('home.totalBalance')}
        amount={SAMPLE_TOTALS.balance}
        pills={[
          { label: t('home.monthIncome'), value: SAMPLE_TOTALS.income },
          { label: t('home.monthExpenses'), value: SAMPLE_TOTALS.expenses },
        ]}
      />

      <Panel className="mt-3.5">
        <div className="mb-2 flex justify-between gap-2 text-[13px] text-muted-foreground">
          <span>{t('home.monthBudget')}</span>
          <span className="tabular-nums">
            {t('progress.label', { spent: formatMoney(spent), budget: formatMoney(SAMPLE_TOTALS.budget) })}
          </span>
        </div>
        <ProgressBar value={spent} max={SAMPLE_TOTALS.budget} label={t('home.monthBudget')} />
      </Panel>

      <SectionHeader
        title={t('home.categories')}
        action={{ label: t('home.allCategories'), to: '/reports/spending' }}
      />
      <Panel className="py-2">
        {topCategories.map((c) => (
          <BudgetRow key={c.name} name={c.name} spent={c.spent} budget={c.budget} />
        ))}
      </Panel>

      <SectionHeader title={t('home.recent')} action={{ label: t('common.seeAll'), to: '/expenses' }} />
      <ListGroup label={t('home.recent')}>
        {txns.slice(0, 5).map((txn) => (
          <ListRow
            key={txn.id}
            onClick={() => openDetail(txn)}
            icon={<CategoryIcon name={txn.category} />}
            title={<TagText text={txn.notes || txn.category} asText />}
            subtitle={`${txn.category} · ${txn.account}`}
            amount={txn.amount}
          />
        ))}
      </ListGroup>

      <ResponsiveSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={selected?.notes || selected?.category || ''}
        hideTitle
        size="sm"
        footer={
          <>
            <Button size="block" onClick={() => toast(t('common.sampleData'))}>
              <Pencil aria-hidden />
              {t('common.edit')}
            </Button>
            <Button
              size="block"
              variant="secondary"
              className="text-negative"
              onClick={async () => {
                const ok = await confirm({
                  title: t('common.delete'),
                  destructive: true,
                  confirmLabel: t('common.delete'),
                })
                if (ok) {
                  setDetailOpen(false)
                  toast.success(t('common.sampleData'))
                }
              }}
            >
              <Trash2 aria-hidden />
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {selected ? (
          <div>
            <div className="mt-1 mb-4 flex flex-col items-center text-center">
              <CategoryIcon name={selected.category} size="lg" className="mb-2.5" />
              <Money
                value={selected.amount}
                tone="positive"
                className="text-[32px] font-bold tracking-tight"
              />
              <p className="mt-1 text-muted-foreground">
                <TagText text={selected.notes} />
              </p>
            </div>
            <DetailRow label={t('common.category')}>{selected.category}</DetailRow>
            <DetailRow label={t('common.account')}>{selected.account}</DetailRow>
            <DetailRow label={t('common.day')}>{relativeDayLabel(selected.day, lang, today)}</DetailRow>
          </div>
        ) : null}
      </ResponsiveSheet>
    </>
  )
}
