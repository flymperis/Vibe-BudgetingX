import { Check, CornerDownLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'
import { sanitizeAmountTyping } from '@/lib/amount'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Member } from './api'
import { personName } from './labels'
import { Avatar } from './SharedParts'
import { centsToInput, evenValues, type SplitMethod, type SplitResult, type SplitStatus } from './split'

const SUFFIX: Record<SplitMethod, string> = { equal: '', exact: '€', percent: '%', shares: '×' }

/** "12,345" -> "12.34"-style canonical numbers for every method (2 decimals at most). */
const clean = (text: string) => sanitizeAmountTyping(text)

export interface SplitEditorProps {
  method: SplitMethod
  members: Member[]
  included: Record<number, boolean>
  values: Record<number, string>
  totalCents: number
  result: SplitResult
  onInclude: (id: number, on: boolean) => void
  onValues: (values: Record<number, string>) => void
}

/** Who takes part and how much: one row per member, live shares and a status line. */
export function SplitEditor({
  method,
  members,
  included,
  values,
  totalCents,
  result,
  onInclude,
  onValues,
}: SplitEditorProps) {
  const t = useT()
  const left = result.status.kind === 'left' ? result.status.cents : 0
  const showEven = method === 'percent' || method === 'shares'

  return (
    <div>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-card">
        {members.map((m) => {
          const name = personName(m.name, m.is_me, t)
          const share = result.shares[m.id] ?? 0
          const shareText = share > 0 ? formatMoney(share / 100) : null
          if (method === 'equal') {
            const on = !!included[m.id]
            return (
              <li key={m.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => onInclude(m.id, !on)}
                  className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                    )}
                  >
                    {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                  </span>
                  <Avatar name={name} me={m.is_me} className="size-8 text-[13px]" />
                  <span className={cn('min-w-0 flex-1 truncate text-[15px]', !on && 'text-muted-foreground')}>
                    {name}
                  </span>
                  <span className="text-[15px] font-medium tabular-nums">
                    {on && shareText ? shareText : ''}
                  </span>
                </button>
              </li>
            )
          }
          const inputId = `split-${m.id}`
          return (
            <li key={m.id} className="flex min-h-14 items-center gap-3 px-3.5 py-2">
              <Avatar name={name} me={m.is_me} className="size-8 text-[13px]" />
              <label htmlFor={inputId} className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{name}</span>
                {method !== 'exact' ? (
                  <span className="block text-xs text-muted-foreground tabular-nums">{shareText ?? '—'}</span>
                ) : null}
              </label>
              {method === 'exact' && left > 0 && !values[m.id] ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-touch"
                  aria-label={t('shared.fillRestFor', { name })}
                  title={t('shared.fillRestFor', { name })}
                  onClick={() =>
                    onValues({ ...values, [m.id]: centsToInput((result.shares[m.id] ?? 0) + left) })
                  }
                >
                  <CornerDownLeft aria-hidden className="text-muted-foreground" />
                </Button>
              ) : null}
              <div className="relative w-28 shrink-0">
                <input
                  id={inputId}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label={t('shared.partOf', { name })}
                  placeholder={method === 'shares' ? '0' : '0'}
                  value={(values[m.id] ?? '').replace('.', ',')}
                  onChange={(e) => onValues({ ...values, [m.id]: clean(e.target.value) })}
                  className="h-11 w-full rounded-xl border border-input bg-background pr-7 pl-3 text-right text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:rounded-lg md:text-sm dark:bg-input/30"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-2.5 grid place-items-center text-sm text-muted-foreground"
                >
                  {SUFFIX[method]}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mx-0.5 mt-2 flex min-h-9 items-center justify-between gap-3">
        <p
          aria-live="polite"
          className={cn(
            'text-[13px] font-medium',
            result.ok
              ? 'text-muted-foreground'
              : totalCents > 0 || result.status.kind === 'pickOne'
                ? 'text-negative'
                : 'text-muted-foreground',
          )}
        >
          {statusText(result.status, t)}
        </p>
        {showEven ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 rounded-full px-3"
            onClick={() => {
              const even = evenValues(method, members.length)
              const next: Record<number, string> = {}
              members.forEach((m, i) => (next[m.id] = even[i]))
              onValues(next)
            }}
          >
            {t('shared.splitEvenly')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function statusText(status: SplitStatus, t: ReturnType<typeof useT>): string {
  switch (status.kind) {
    case 'each':
      return t('shared.status.each', { amount: formatMoney(status.cents / 100) })
    case 'pickOne':
      return t('shared.status.pickOne')
    case 'addsUp':
      return t('shared.status.addsUp')
    case 'left':
      return t('shared.status.left', { amount: formatMoney(status.cents / 100) })
    case 'tooMuch':
      return t('shared.status.tooMuch', { amount: formatMoney(status.cents / 100) })
    case 'percentOk':
      return t('shared.status.percentOk')
    case 'percentTotal':
      return t('shared.status.percentTotal', { total: String(status.total).replace('.', ',') })
    case 'sharesTotal':
      return t('shared.status.sharesTotal', { total: String(status.total).replace('.', ',') })
    case 'giveShare':
      return t('shared.status.giveShare')
    default:
      return ''
  }
}
