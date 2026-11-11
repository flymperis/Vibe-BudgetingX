import type { ReactNode } from 'react'
import { FullScreenError, FullScreenSkeleton } from '@/components/skeletons'
import { BootstrapContext, useBootstrapQuery, type Bootstrap } from './bootstrap'
import { useBootstrapSync } from './sync'

/**
 * Loads /api/bootstrap and provides it to everything below. It is fetched
 * again when the app becomes visible or the day changes (that is when the
 * server posts due recurring entries; see ./sync.ts).
 */
export function BootstrapGate({ children }: { children: ReactNode }) {
  const query = useBootstrapQuery()
  useBootstrapSync(query.data, query.dataUpdatedAt)
  // A failed background refetch keeps the data already on screen.
  if (!query.data) {
    if (query.isError) return <FullScreenError error={query.error} onRetry={() => void query.refetch()} />
    return <FullScreenSkeleton />
  }
  return <BootstrapContext value={query.data}>{children}</BootstrapContext>
}

/** Provides fixed data (tests, the dev components page). */
export function BootstrapProvider({ value, children }: { value: Bootstrap; children: ReactNode }) {
  return <BootstrapContext value={value}>{children}</BootstrapContext>
}
