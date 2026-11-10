import type { ReactNode } from 'react'
import { FullScreenError, FullScreenSkeleton } from '@/components/skeletons'
import { BootstrapContext, useBootstrapQuery, type Bootstrap } from './bootstrap'

/** Loads /api/bootstrap once and provides it to everything below. */
export function BootstrapGate({ children }: { children: ReactNode }) {
  const query = useBootstrapQuery()
  if (query.isPending) return <FullScreenSkeleton />
  if (query.isError) return <FullScreenError error={query.error} onRetry={() => void query.refetch()} />
  return <BootstrapContext value={query.data}>{children}</BootstrapContext>
}

/** Provides fixed data (tests, the dev components page). */
export function BootstrapProvider({ value, children }: { value: Bootstrap; children: ReactNode }) {
  return <BootstrapContext value={value}>{children}</BootstrapContext>
}
