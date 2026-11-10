/**
 * GET /api/bootstrap: reference data every screen needs (user, accounts with
 * balances, categories, tag names, budget on/off, server "today" and month).
 *
 * Typed from the generated OpenAPI schema (BootstrapOut). Read it with `useBootstrap()`
 * anywhere inside the authenticated app. It is loaded once by <BootstrapGate>,
 * which shows a full-screen skeleton until it arrives.
 */
import { useQuery } from '@tanstack/react-query'
import { createContext, use } from 'react'
import { api } from '@/api/client'
import { qk } from '@/api/keys'
import type { Schema } from '@/api/types'
import { todayISO } from '@/lib/dates'

export type Bootstrap = Schema<'BootstrapOut'>
export type BootstrapAccount = Bootstrap['accounts'][number]
export type BootstrapCategory = Schema<'IdName'>

export const fetchBootstrap = () => api.get<Bootstrap>('/bootstrap')

export function useBootstrapQuery() {
  return useQuery({ queryKey: qk.bootstrap, queryFn: fetchBootstrap, staleTime: 60_000 })
}

export const BootstrapContext = createContext<Bootstrap | null>(null)

export function useBootstrap(): Bootstrap {
  const value = use(BootstrapContext)
  if (!value) throw new Error('useBootstrap() must be used inside <BootstrapGate>')
  return value
}

/** Server "today" when known, else the device's local day. */
export function useToday(): string {
  const value = use(BootstrapContext)
  return value?.today ?? todayISO()
}
