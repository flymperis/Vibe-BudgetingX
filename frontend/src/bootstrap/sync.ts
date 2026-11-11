/**
 * Recurring entries are posted by the server only inside GET /api/bootstrap
 * (the old app did it on every page load). So bootstrap is fetched again:
 *  - on app start (the gate loads it),
 *  - when the tab / installed app becomes visible again,
 *  - when the local date changes while the app is open.
 * When a response says `posted_recurring > 0`, the old flash message is shown
 * as a toast and every money query is refreshed.
 */
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { invalidateDomains, MONEY_DOMAINS, qk } from '@/api/keys'
import { translate } from '@/i18n'
import { todayISO } from '@/lib/dates'

/** How often the open app checks whether the day changed. */
export const DAY_CHECK_MS = 60_000

export function postedRecurringMessage(count: number): string {
  return count === 1
    ? translate('money.postedRecurringOne')
    : translate('money.postedRecurringMany', { count })
}

/** Every money domain except bootstrap itself (it just arrived). */
export function invalidateAfterPosting(qc: QueryClient) {
  return invalidateDomains(qc, ...MONEY_DOMAINS.filter((d) => d !== 'bootstrap').map((d) => [d]))
}

export function useBootstrapSync(data: { posted_recurring: number } | undefined, dataUpdatedAt: number) {
  const qc = useQueryClient()
  const handled = useRef(0)

  // React to a response that posted recurring entries (once per response).
  useEffect(() => {
    if (!data || dataUpdatedAt === handled.current) return
    handled.current = dataUpdatedAt
    if (data.posted_recurring > 0) {
      toast.success(postedRecurringMessage(data.posted_recurring), { id: 'posted-recurring' })
      void invalidateAfterPosting(qc)
    }
  }, [data, dataUpdatedAt, qc])

  // Refetch when the app comes back and when the day changes.
  useEffect(() => {
    let day = todayISO()
    const refetch = () => void qc.invalidateQueries({ queryKey: qk.bootstrap })
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      day = todayISO()
      refetch()
    }
    const timer = window.setInterval(() => {
      const now = todayISO()
      if (now !== day) {
        day = now
        refetch()
      }
    }, DAY_CHECK_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [qc])
}
