import { RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useT } from '@/i18n'
import { errorMessage } from '@/app/query-client'
import { cn } from '@/lib/utils'

/** Placeholder for a ListGroup while it loads. */
export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('divide-y overflow-hidden rounded-2xl border bg-card shadow-card', className)}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3.5 py-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

/** Placeholder for a card. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('space-y-3 rounded-2xl border bg-card p-4 shadow-card', className)}>
      <Skeleton className="h-3.5 w-1/3" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-2 w-full" />
    </div>
  )
}

/** Placeholder for a whole screen (used as the route-level loading state). */
export function PageSkeleton() {
  const t = useT()
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="space-y-2 pt-1">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-40" />
      </div>
      <Skeleton className="h-36 w-full rounded-3xl" />
      <CardSkeleton />
      <ListSkeleton />
    </div>
  )
}

/** Shown while the session and /api/bootstrap load, before the shell exists. */
export function FullScreenSkeleton() {
  const t = useT()
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto min-h-dvh max-w-lg px-[18px] pt-[calc(env(safe-area-inset-top)+18px)]"
    >
      <span className="sr-only">{t('common.loading')}</span>
      <div className="mb-4 flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-36" />
        </div>
        <Skeleton className="size-10 rounded-full" />
      </div>
      <Skeleton className="mb-4 h-40 w-full rounded-3xl" />
      <CardSkeleton className="mb-4" />
      <ListSkeleton rows={5} />
    </div>
  )
}

export function FullScreenError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT()
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl border bg-card text-muted-foreground">
          <WifiOff aria-hidden className="size-7" />
        </span>
        <p className="text-base font-semibold">{t('errors.loadFailed')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{errorMessage(error)}</p>
        <Button size="touch" className="mt-5" onClick={onRetry}>
          <RefreshCw aria-hidden />
          {t('common.retry')}
        </Button>
      </div>
    </div>
  )
}
