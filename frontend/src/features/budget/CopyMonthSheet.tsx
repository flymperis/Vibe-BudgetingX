import { useId, useState } from 'react'
import { ChipPicker } from '@/components/ChipPicker'
import { FieldLabel } from '@/components/FormField'
import { Money } from '@/components/Money'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useLang, useT } from '@/i18n'
import { monthLabel } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import type { MonthSnapshot } from './api'
import { copyPreview, type DraftRow } from './defaults'

export interface CopyMonthSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  snapshots: MonthSnapshot[]
  rows: DraftRow[]
  otherText: string
  /** Prefill the (unsaved) editor from this month. */
  onPrefill: (snapshot: MonthSnapshot) => void
}

/** "Copy budget from another month": preview, then prefill the form (nothing is saved here). */
export function CopyMonthSheet({
  open,
  onOpenChange,
  snapshots,
  rows,
  otherText,
  onPrefill,
}: CopyMonthSheetProps) {
  const t = useT()
  const lang = useLang()
  const isDesktop = useIsDesktop()
  const labelId = useId()
  const [ym, setYm] = useState<string | null>(null)
  const snapshot = snapshots.find((s) => s.ym === ym) ?? snapshots[0]
  const preview = snapshot ? copyPreview(rows, snapshot, otherText) : null

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('budget.copyTitle')}
      description={t('budget.copyDescription')}
      footer={
        <Button size="block" disabled={!snapshot} onClick={() => snapshot && onPrefill(snapshot)}>
          {t('budget.prefill')}
        </Button>
      }
    >
      {snapshot && preview ? (
        <>
          <FieldLabel id={labelId} className="mt-1">
            {t('budget.copyMonth')}
          </FieldLabel>
          <ChipPicker
            labelledBy={labelId}
            label={t('budget.copyMonth')}
            bleed={!isDesktop}
            value={snapshot.ym}
            onChange={setYm}
            options={snapshots.map((s) => ({ value: s.ym, label: monthLabel(s.ym, lang) }))}
          />
          <ul className="mt-4 divide-y rounded-2xl border" aria-label={t('budget.copyPreview')}>
            {preview.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                <span className="min-w-0 truncate">{item.name}</span>
                <span
                  className={
                    item.kind === 'amount'
                      ? 'shrink-0 font-semibold tabular-nums'
                      : 'shrink-0 text-muted-foreground'
                  }
                >
                  {item.kind === 'fixed'
                    ? t('budget.copyKeptFixed', { amount: formatMoney(item.amount) })
                    : item.kind === 'amount'
                      ? formatMoney(item.amount)
                      : t('budget.copyUnchanged')}
                </span>
              </li>
            ))}
          </ul>
          <p className="mx-0.5 mt-3 flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{t('budget.copyTotal')}</span>
            <Money value={preview.total} tone="none" className="font-semibold" />
          </p>
        </>
      ) : null}
    </ResponsiveSheet>
  )
}
