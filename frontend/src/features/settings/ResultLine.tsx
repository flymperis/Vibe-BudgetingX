import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Inline `{ok, message}` of a "Test" button (connection tests), green or red. */
export function ResultLine({ ok, message, className }: { ok: boolean; message: string; className?: string }) {
  const Icon = ok ? CheckCircle2 : XCircle
  return (
    <p
      role="status"
      className={cn(
        'mt-3 flex gap-2 rounded-xl p-3 text-sm break-words',
        ok ? 'bg-positive/10 text-foreground' : 'bg-negative/10 text-foreground',
        className,
      )}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', ok ? 'text-positive' : 'text-negative')} />
      <span className="min-w-0">{message}</span>
    </p>
  )
}
