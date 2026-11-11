import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The "add" action in a screen's PageHeader: a round "+" on phones, a labelled
 * pill from md up. One pattern for every list screen (expenses, income,
 * recurring, transfers, accounts, categories, shared groups).
 */
export function AddButton({
  label,
  onClick,
  className,
}: {
  /** What it adds ("Νέο έξοδο"); also the accessible name on phones. */
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <Button
      size="touch"
      onClick={onClick}
      aria-label={label}
      className={cn('size-11 rounded-full p-0 md:w-auto md:px-4', className)}
    >
      <Plus aria-hidden />
      <span className="hidden md:inline">{label}</span>
    </Button>
  )
}
