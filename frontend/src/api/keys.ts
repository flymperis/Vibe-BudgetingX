/**
 * Query key conventions
 * ---------------------
 * Every key is an array whose FIRST element is the domain (the feature folder
 * name, the same word the backend router uses): ['expenses', ...].
 * Build keys only with `createKeys(domain)` so invalidation by prefix works:
 *
 *   export const expenseKeys = createKeys('expenses')
 *   expenseKeys.all                      -> ['expenses']
 *   expenseKeys.list({ month })          -> ['expenses', 'list', { month }]
 *   expenseKeys.detail(42)               -> ['expenses', 'detail', 42]
 *   expenseKeys.custom('suggestions', q) -> ['expenses', 'suggestions', q]
 *
 * After a mutation, invalidate the domain prefix (`expenseKeys.all`) and every
 * other domain whose numbers change: anything that moves money changes account
 * balances, so also invalidate `qk.bootstrap` and `qk.home` (see MONEY_DOMAINS).
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query'

export function createKeys<D extends string>(domain: D) {
  return {
    all: [domain] as const,
    list: (filters: Record<string, unknown> = {}) => [domain, 'list', filters] as const,
    detail: (id: number | string) => [domain, 'detail', id] as const,
    custom: <P extends unknown[]>(name: string, ...parts: P) => [domain, name, ...parts] as const,
  }
}

/** Keys owned by the foundation. */
export const qk = {
  session: ['auth', 'session'] as const,
  bootstrap: ['bootstrap'] as const,
  home: ['home'] as const,
}

/**
 * Domains whose figures depend on transactions. A mutation that creates, edits
 * or deletes money movements calls `invalidateMoney(queryClient)`.
 */
export const MONEY_DOMAINS = [
  'bootstrap',
  'home',
  'expenses',
  'income',
  'recurring',
  'transfers',
  'budget',
  'shared',
  'reports',
  'yearly',
  'summary',
] as const

export function invalidateDomains(qc: QueryClient, ...keys: QueryKey[]) {
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })))
}

export function invalidateMoney(qc: QueryClient) {
  return invalidateDomains(qc, ...MONEY_DOMAINS.map((d) => [d]))
}
