import { ArrowRight, Equal, Scale } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useToday } from '@/bootstrap/bootstrap'
import { AccountAvatar } from '@/components/AccountAvatar'
import { useConfirm } from '@/components/confirm'
import { DatePicker } from '@/components/DatePicker'
import { EmptyState } from '@/components/EmptyState'
import { FieldError, FieldLabel } from '@/components/FormField'
import { ListGroup, ListRow, SectionHeader } from '@/components/ListGroup'
import { LoadError } from '@/components/LoadError'
import { PageHeader } from '@/components/PageHeader'
import { ListSkeleton } from '@/components/skeletons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLang, useT } from '@/i18n'
import { fullDateLabel } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import {
  type ReconcileAccount,
  type ReconcilePlan,
  useApplyReconciliation,
  usePreviewReconciliation,
  useReconcileStart,
} from './api'
import { buildBalances, invalidRows, recordedValue, sanitizeBalanceTyping } from './reconcile'

/**
 * /reconciliation: type the real balance of each account and card, preview the
 * transfers and "balancing input" entries (category Other) that make the app
 * match, then apply them.
 */
export default function ReconciliationPage() {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const confirm = useConfirm()
  const [date, setDate] = useState(today)
  const [inputs, setInputs] = useState<Record<number, string>>({})
  const [plan, setPlan] = useState<{ key: string; data: ReconcilePlan } | null>(null)

  const start = useReconcileStart(date)
  const preview = usePreviewReconciliation()
  const apply = useApplyReconciliation()

  const rows = useMemo(() => start.data?.accounts ?? [], [start.data])
  const balances = useMemo(() => buildBalances(rows, inputs), [rows, inputs])
  const invalid = invalidRows(rows, inputs)
  const requestKey = JSON.stringify({ date, balances })
  // A preview is only shown while it still matches what is typed.
  const shownPlan = plan && plan.key === requestKey && !start.isPlaceholderData ? plan.data : null

  const setInput = (id: number, text: string) => setInputs((prev) => ({ ...prev, [id]: text }))

  const runPreview = () => {
    const key = requestKey
    preview.mutate({ date, balances }, { onSuccess: (data) => setPlan({ key, data }) })
  }

  const runApply = async () => {
    if (!shownPlan) return
    const ok = await confirm({
      title: t('reconcile.confirmTitle'),
      description: t('reconcile.confirmBody', {
        transfers: shownPlan.transfers.length,
        adjustments: shownPlan.adjustments.length,
        date: fullDateLabel(shownPlan.date, lang, today),
      }),
      confirmLabel: t('reconcile.apply'),
    })
    if (!ok) return
    await apply.mutateAsync({ date, balances })
    setInputs({})
    setPlan(null)
  }

  const banks = rows.filter((r) => !r.is_credit_card)
  const cards = rows.filter((r) => r.is_credit_card)

  return (
    <>
      <PageHeader title={t('nav.reconciliation')} />
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">{t('reconcile.intro')}</p>

      <div className="max-w-xs">
        <FieldLabel htmlFor="reconcile-date" className="mt-0">
          {t('reconcile.date')}
        </FieldLabel>
        <DatePicker id="reconcile-date" value={date} onChange={setDate} label={t('reconcile.date')} />
      </div>

      {start.isError && !start.data ? (
        <LoadError onRetry={() => void start.refetch()} />
      ) : start.isPending ? (
        <ListSkeleton rows={4} className="mt-6" />
      ) : !rows.length ? (
        <EmptyState
          icon={Scale}
          title={t('reconcile.empty')}
          action={
            <Button asChild size="touch">
              <Link to="/settings/accounts">{t('settings.accounts')}</Link>
            </Button>
          }
        />
      ) : (
        <div className="md:grid md:grid-cols-2 md:gap-6">
          <section>
            {banks.length ? (
              <>
                <SectionHeader title={t('reconcile.accounts')} />
                <BalanceInputs rows={banks} inputs={inputs} invalid={invalid} onChange={setInput} />
              </>
            ) : null}
            {cards.length ? (
              <>
                <SectionHeader title={t('reconcile.cards')} />
                <BalanceInputs rows={cards} inputs={inputs} invalid={invalid} onChange={setInput} />
              </>
            ) : null}
            <p className="mx-1 mt-2 text-xs text-muted-foreground">{t('reconcile.blankHint')}</p>
            <FieldError>{invalid.length ? t('reconcile.invalid') : null}</FieldError>
            <Button
              size="block"
              className="mt-4"
              onClick={runPreview}
              disabled={!balances.length || invalid.length > 0 || preview.isPending}
            >
              {t('reconcile.preview')}
            </Button>
          </section>

          <section>
            {shownPlan ? (
              <PlanView plan={shownPlan} onApply={() => void runApply()} applying={apply.isPending} />
            ) : null}
          </section>
        </div>
      )}
    </>
  )
}

function BalanceInputs({
  rows,
  inputs,
  invalid,
  onChange,
}: {
  rows: ReconcileAccount[]
  inputs: Record<number, string>
  invalid: number[]
  onChange: (id: number, text: string) => void
}) {
  const t = useT()
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border bg-card shadow-card">
      {rows.map((row) => {
        const recorded = recordedValue(row)
        const recordedText = formatMoney(recorded)
        return (
          <li key={row.account_id} className="flex min-h-16 items-center gap-3 px-3.5 py-2.5">
            <AccountAvatar name={row.name} bank={row.bank} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] leading-snug font-medium">{row.name}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                <span className="sr-only">
                  {t(row.is_credit_card ? 'reconcile.recordedOwed' : 'reconcile.recorded', {
                    amount: recordedText,
                  })}
                </span>
                <span aria-hidden>{recordedText}</span>
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('reconcile.useRecorded')}
              title={t('reconcile.useRecorded')}
              onClick={() => onChange(row.account_id, String(recorded).replace('.', ','))}
            >
              <Equal aria-hidden />
            </Button>
            <div className="relative w-32 shrink-0">
              <Input
                inputMode="decimal"
                autoComplete="off"
                aria-label={t(row.is_credit_card ? 'reconcile.owedLabel' : 'reconcile.actualLabel', {
                  name: row.name,
                })}
                aria-invalid={invalid.includes(row.account_id) || undefined}
                placeholder={String(recorded).replace('.', ',')}
                value={inputs[row.account_id] ?? ''}
                onChange={(e) => onChange(row.account_id, sanitizeBalanceTyping(e.target.value))}
                className="pr-7 text-right tabular-nums md:pr-7"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-sm text-muted-foreground"
              >
                €
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function PlanView({
  plan,
  onApply,
  applying,
}: {
  plan: ReconcilePlan
  onApply: () => void
  applying: boolean
}) {
  const t = useT()
  const nothing = !plan.transfers.length && !plan.adjustments.length
  return (
    <div aria-live="polite">
      <SectionHeader title={t('reconcile.previewTitle')} />
      <ListGroup header={t('reconcile.differences')} label={t('reconcile.differences')}>
        {plan.accounts.map((a) => (
          <ListRow
            key={a.account_id}
            title={a.name}
            subtitle={`${formatMoney(a.system_balance)} → ${formatMoney(a.actual_balance)}`}
            amount={a.difference}
            amountProps={{ tone: 'all', signed: true }}
          />
        ))}
      </ListGroup>

      {nothing ? <p className="mx-1 mt-4 text-sm text-muted-foreground">{t('reconcile.allMatch')}</p> : null}

      {plan.transfers.length ? (
        <ListGroup header={t('reconcile.transfers')} label={t('reconcile.transfers')} className="mt-5">
          {plan.transfers.map((tr, i) => (
            <ListRow
              key={i}
              title={
                <>
                  {tr.from_account_name}
                  <ArrowRight
                    aria-hidden
                    className="mx-1 inline size-3.5 align-[-2px] text-muted-foreground"
                  />
                  {tr.to_account_name}
                </>
              }
              subtitle={plan.transfer_notes}
              amount={tr.amount}
              amountProps={{ tone: 'none' }}
            />
          ))}
        </ListGroup>
      ) : null}

      {plan.adjustments.length ? (
        <ListGroup header={t('reconcile.adjustments')} label={t('reconcile.adjustments')} className="mt-5">
          {plan.adjustments.map((a, i) => (
            <ListRow
              key={i}
              title={t(a.kind === 'income' ? 'reconcile.incomeOn' : 'reconcile.expenseOn', {
                name: a.account_name,
              })}
              subtitle={`${a.category_name} · ${plan.notes}`}
              amount={a.kind === 'income' ? a.amount : -a.amount}
              amountProps={{ tone: 'all', signed: true }}
            />
          ))}
        </ListGroup>
      ) : null}

      {!nothing ? (
        <Button size="block" className="mt-5" onClick={onApply} disabled={applying}>
          {t('reconcile.apply')}
        </Button>
      ) : null}
    </div>
  )
}
