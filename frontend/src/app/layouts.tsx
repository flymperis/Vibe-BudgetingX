import { Outlet, ScrollRestoration } from 'react-router'
import { BootstrapGate } from '@/bootstrap/BootstrapGate'
import { AppShell } from '@/components/layout/AppShell'

export function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

/** Logged in: load /api/bootstrap, then the shell. */
export function AuthenticatedApp() {
  return (
    <BootstrapGate>
      <AppShell />
    </BootstrapGate>
  )
}
