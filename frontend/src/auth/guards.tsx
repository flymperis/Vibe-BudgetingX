import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import { FullScreenError, FullScreenSkeleton } from '@/components/skeletons'
import { safeNext } from './next'
import { useSession } from './session'

/** Renders children only for a logged-in user; otherwise /login?next=<here>. */
export function RequireAuth() {
  const session = useSession()
  const location = useLocation()
  if (session.isPending) return <FullScreenSkeleton />
  if (session.isError && !session.data)
    return <FullScreenError error={session.error} onRetry={() => void session.refetch()} />
  if (!session.data?.user) {
    const next = location.pathname + location.search
    const to = next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`
    return <Navigate to={to} replace />
  }
  return <Outlet />
}

/** Login / register: a logged-in user goes straight to ?next or home. */
export function PublicOnly() {
  const session = useSession()
  const [params] = useSearchParams()
  if (session.isPending) return <FullScreenSkeleton />
  if (session.data?.user) return <Navigate to={safeNext(params.get('next'))} replace />
  return <Outlet />
}
