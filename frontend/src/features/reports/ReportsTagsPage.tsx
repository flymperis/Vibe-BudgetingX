import { ChevronLeft, Hash } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { StatCard } from '@/components/Cards'
import { EmptyState } from '@/components/EmptyState'
import { formatPercent } from '@/lib/format'
import { ListGroup, ListRow, SectionHeader } from '@/components/ListGroup'
import { Money } from '@/components/Money'
import { CardSkeleton, ListSkeleton } from '@/components/skeletons'
import { TagText } from '@/components/TagText'
import { useLang, useT, type Lang } from '@/i18n'
import { shortDateLabel } from '@/lib/dates'
import { useTagsReport, type TagsReport } from './api'
import { Hint, RankRow, ReportError } from './ReportParts'

type TagDetail = NonNullable<TagsReport['tag']>

function dateRange(first: string, last: string, lang: Lang) {
  const a = shortDateLabel(first, lang)
  return last !== first ? `${a} → ${shortDateLabel(last, lang)}` : a
}

/**
 * /reports/tags: every #tag with its totals; `?tag=<name>` shows one tag with
 * its spending by category and every entry (TagText links land here).
 */
export default function ReportsTagsPage() {
  const t = useT()
  const [params] = useSearchParams()
  const selected = params.get('tag')?.trim() || null
  const query = useTagsReport(selected)
  const data = query.data

  if (query.isPending)
    return (
      <div role="status" aria-live="polite" className="space-y-4">
        <span className="sr-only">{t('common.loading')}</span>
        {selected ? <CardSkeleton /> : null}
        <ListSkeleton rows={5} />
      </div>
    )
  if (query.isError || !data) return <ReportError onRetry={() => void query.refetch()} />
  if (data.tag) return <TagView tag={data.tag} />
  return <TagList data={data} />
}

function TagList({ data }: { data: TagsReport }) {
  const t = useT()
  const lang = useLang()
  return (
    <>
      <h2 className="sr-only">{t('reports.tags')}</h2>
      {data.selected_tag ? (
        <p role="status" className="mb-3 rounded-xl border bg-card px-3 py-2.5 text-sm">
          {t('reports.tagNotFound', { tag: data.selected_tag })}
        </p>
      ) : null}
      <Hint className="mx-0.5">{t('reports.tagsHint')}</Hint>
      {data.tags.length ? (
        <ListGroup label={t('reports.tags')}>
          {data.tags.map((tag) => (
            <ListRow
              key={tag.key}
              to={{ search: `?tag=${encodeURIComponent(tag.key)}` }}
              icon={
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
                >
                  <Hash className="size-5" />
                </span>
              }
              title={`#${tag.tag}`}
              subtitle={`${t(tag.count === 1 ? 'reports.entriesOne' : 'reports.entriesCount', { count: tag.count })} · ${dateRange(tag.first, tag.last, lang)}`}
              trailing={
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-semibold">
                    <Money value={tag.spent} tone="none" />
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {tag.income ? (
                      <>
                        {t('reports.incomeShort')} <Money value={tag.income} tone="none" />
                      </>
                    ) : (
                      `${t('reports.incomeShort')} —`
                    )}
                  </span>
                </span>
              }
            />
          ))}
        </ListGroup>
      ) : (
        <div className="rounded-2xl border bg-card shadow-card">
          <EmptyState icon={Hash} title={t('reports.noTags')} className="py-8" />
        </div>
      )}
    </>
  )
}

function TagView({ tag }: { tag: TagDetail }) {
  const t = useT()
  const lang = useLang()
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-2xl font-bold tracking-tight">#{tag.tag}</h2>
        <Link
          to={{ search: '' }}
          className="inline-flex h-11 shrink-0 items-center gap-0.5 rounded-xl px-2 text-sm font-medium text-primary hover:bg-muted"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {t('reports.allTags')}
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t('reports.spent')} value={<Money value={tag.spent} tone="none" />} />
        {tag.income ? (
          <>
            <StatCard label={t('reports.income')} value={<Money value={tag.income} tone="none" />} />
            <StatCard label={t('reports.net')} value={<Money value={tag.net} />} />
          </>
        ) : null}
        <StatCard label={t('reports.entries')} value={tag.count} />
        <StatCard
          className="col-span-2 md:col-span-1"
          label={t('reports.dates')}
          value={<span className="text-base">{dateRange(tag.first, tag.last, lang)}</span>}
        />
      </div>

      {tag.categories.length ? (
        <>
          <SectionHeader title={t('reports.byCategory')} />
          <ol
            aria-label={t('reports.byCategory')}
            className="divide-y overflow-hidden rounded-2xl border bg-card shadow-card"
          >
            {tag.categories.map((c) => (
              <RankRow
                key={c.name}
                name={c.name}
                amount={<Money value={c.total} tone="none" />}
                barPercent={Math.max(c.share, 0)}
                meta={
                  <span>
                    {t('reports.shareOfTotal', { share: formatPercent(c.share, lang, { digits: 0 }) })}
                  </span>
                }
              />
            ))}
          </ol>
        </>
      ) : null}

      <SectionHeader title={t('reports.entries')} />
      <ListGroup label={t('reports.entries')}>
        {tag.rows.map((r) => (
          <ListRow
            key={`${r.kind}-${r.id}`}
            title={r.notes ? <TagText text={r.notes} /> : r.category}
            subtitle={`${shortDateLabel(r.day, lang)} · ${r.category} · ${r.account ?? '—'}`}
            amount={r.amount}
            amountProps={{ tone: 'all' }}
          />
        ))}
      </ListGroup>
    </>
  )
}
