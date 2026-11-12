import { useCountTo } from '@/hooks/useCountTo'
import { cn } from '@/lib/utils'
import { formatMoney, type FormatMoneyOptions } from '@/lib/money'

/**
 * A number that counts up / down to its new value (600ms, ease-out cubic)
 * instead of jumping. The first render shows the value as is; with reduced
 * motion every change jumps straight to the new value. Tabular figures keep
 * the width steady while it counts.
 *
 *   <AnimatedNumber value={total} />                       // "1.527,08 €"
 *   <AnimatedNumber value={x} format={(n) => `${n}%`} />
 */
export function AnimatedNumber({
  value,
  format,
  currency,
  signed,
  className,
}: {
  value: number
  /** Formatter for the in-between values (default: formatMoney with `currency` / `signed`). */
  format?: (n: number) => string
  className?: string
} & FormatMoneyOptions) {
  const shown = useCountTo(value)
  const text = format ? format(shown) : formatMoney(shown, { currency, signed })
  return <span className={cn('whitespace-nowrap tabular-nums', className)}>{text}</span>
}
