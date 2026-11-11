import { CategoryIcon } from '@/components/CategoryIcon'
import { Money } from '@/components/Money'
import { TagText } from '@/components/TagText'
import { useLang, useT } from '@/i18n'
import { relativeDayLabel } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import type { Entry } from './entries'

/**
 * One expense / income row (inside a <ListGroup>). The whole row opens the
 * entry; #tags in the notes stay real links to their report. The row button
 * is stretched under the content so the links are not nested in it.
 */
export function TxnRow({
  entry,
  today,
  showDay = false,
  onOpen,
}: {
  entry: Entry
  today: string
  /** Put the day in the subtitle (lists not grouped by day). */
  showDay?: boolean
  onOpen: (entry: Entry) => void
}) {
  const t = useT()
  const lang = useLang()
  const day = relativeDayLabel(entry.date, lang, today)
  const title = entry.notes || entry.category_name
  const subtitle = [entry.notes ? entry.category_name : null, entry.account_name, showDay ? day : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => onOpen(entry)}
        aria-label={t('money.rowLabel', { title, amount: formatMoney(entry.amount), day })}
        className="absolute inset-0 size-full cursor-pointer transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted"
      />
      <div className="pointer-events-none relative flex min-h-14 items-center gap-3 px-3.5 py-2.5">
        <CategoryIcon name={entry.category_name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-snug font-medium">
            {entry.notes ? (
              <TagText
                text={entry.notes}
                className="[&_a]:pointer-events-auto [&_a]:relative [&_a]:z-10 [&_a]:py-2"
              />
            ) : (
              entry.category_name
            )}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <Money value={entry.amount} tone="positive" className="text-[15px] font-semibold" />
      </div>
    </li>
  )
}
