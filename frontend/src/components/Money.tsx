import { cn } from '@/lib/utils'
import { amountClass, formatMoney, type Currency } from '@/lib/money'

export interface MoneyProps {
  value: unknown
  currency?: Currency
  /** Print "+" on positive amounts (negative amounts always show "-"). */
  signed?: boolean
  /**
   * Colouring: "all" colours positive and negative, "positive" only positive
   * (lists of expenses: the sign already says it), "none" keeps the text colour.
   */
  tone?: 'all' | 'positive' | 'none'
  className?: string
}

/** A formatted amount. Always tabular figures; the sign is always in the text. */
export function Money({ value, currency = '€', signed, tone = 'all', className }: MoneyProps) {
  const cls = amountClass(value)
  const colour = tone === 'none' ? '' : tone === 'positive' ? (cls === 'amount-pos' ? cls : '') : cls
  return (
    <span className={cn('whitespace-nowrap tabular-nums', colour, className)}>
      {formatMoney(value, { currency, signed })}
    </span>
  )
}
