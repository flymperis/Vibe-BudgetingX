/**
 * Amount entry, as in the mockup.
 *
 * Value model (both platforms): a canonical string, see src/lib/amount.ts
 * ("" | "12" | "12." | "12.5"). Convert with parseAmountInput(value) on save.
 *
 * Mobile: <AmountDisplay> at the top of the sheet + <AmountKeypad> at the bottom.
 * Desktop: <AmountInput>, a normal text input with the same value model.
 * <AmountEntry> picks display or input for you; render the keypad only when
 * `!isDesktop`.
 */
import { Delete } from 'lucide-react'
import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useT } from '@/i18n'
import { displayAmountText, keypadPress, sanitizeAmountTyping, type KeypadKey } from '@/lib/amount'
import { cn } from '@/lib/utils'

export interface AmountValueProps {
  value: string
  onChange: (value: string) => void
}

/** Big read-only amount ("12,5 €"); announces changes politely. */
export function AmountDisplay({
  value,
  currency = '€',
  sign,
  className,
}: {
  value: string
  currency?: string
  /** Optional sign to show in front ("-" for expenses, "+" for income). */
  sign?: '-' | '+'
  className?: string
}) {
  const t = useT()
  return (
    <output
      aria-live="polite"
      aria-label={t('common.amount')}
      className={cn(
        'block text-center text-[44px] leading-tight font-bold tracking-tight tabular-nums',
        !value && 'text-muted-foreground',
        className,
      )}
    >
      {/* Re-keyed on every change so the small "bump" keyframe plays again. */}
      <span key={value} className={cn('inline-block', value && 'animate-amount-bump')}>
        {sign && value ? sign : null}
        {displayAmountText(value)}
      </span>
      <span className="ml-1.5 font-medium text-muted-foreground">{currency}</span>
    </output>
  )
}

const KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'decimal', '0', 'backspace']

/** 3×4 numeric keypad (mobile). Edits the canonical amount string. */
export function AmountKeypad({ value, onChange, className }: AmountValueProps & { className?: string }) {
  const t = useT()
  return (
    <div role="group" aria-label={t('amount.keypad')} className={cn('grid grid-cols-3 gap-2', className)}>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          data-vaul-no-drag
          aria-label={
            key === 'backspace' ? t('amount.backspace') : key === 'decimal' ? t('amount.decimal') : undefined
          }
          onClick={() => {
            const next = keypadPress(value, key)
            if (next !== value) onChange(next)
            if (navigator.vibrate) navigator.vibrate(5)
          }}
          className={cn(
            'grid h-12 place-items-center rounded-xl bg-muted text-xl font-medium select-none',
            'transition-[background-color,scale] duration-120 ease-out active:scale-[.92] active:bg-border',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {key === 'backspace' ? <Delete aria-hidden className="size-6" /> : key === 'decimal' ? ',' : key}
        </button>
      ))}
    </div>
  )
}

/** Desktop amount field: accepts "12,50" or "12.50", shows a comma. */
export function AmountInput({
  value,
  onChange,
  id,
  currency = '€',
  invalid,
  autoFocus,
  className,
}: AmountValueProps & {
  id?: string
  currency?: string
  invalid?: boolean
  autoFocus?: boolean
  className?: string
}) {
  const t = useT()
  const fallbackId = useId()
  return (
    <div className={cn('relative', className)}>
      <Input
        id={id ?? fallbackId}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label={id ? undefined : t('common.amount')}
        aria-invalid={invalid || undefined}
        placeholder="0,00"
        value={value.replace('.', ',')}
        onChange={(e) => onChange(sanitizeAmountTyping(e.target.value))}
        className="h-12 pr-10 text-right text-2xl font-semibold tabular-nums md:h-12 md:pr-10 md:text-2xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-lg text-muted-foreground"
      >
        {currency}
      </span>
    </div>
  )
}

/** Display on mobile (pair with <AmountKeypad>), input on desktop. */
export function AmountEntry(
  props: AmountValueProps & { currency?: string; sign?: '-' | '+'; autoFocus?: boolean },
) {
  const isDesktop = useIsDesktop()
  return isDesktop ? (
    <AmountInput
      value={props.value}
      onChange={props.onChange}
      currency={props.currency}
      autoFocus={props.autoFocus}
    />
  ) : (
    <AmountDisplay value={props.value} currency={props.currency} sign={props.sign} />
  )
}
