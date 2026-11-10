/**
 * TanStack Query setup.
 *
 * Defaults: data is fresh for 30 s, no refetch on window focus (screens are
 * heavy; the session query opts back in), no retries for 4xx, one retry for
 * network/5xx errors.
 *
 * Errors are toasted globally from the caches. Opt out per query/mutation with
 *   meta: { toastErrors: false }
 * when the component shows the error itself (e.g. inline form validation).
 * 401s are never toasted: the API client already redirects to /login.
 */
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isApiError } from '@/api/client'
import { translate } from '@/i18n'

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { toastErrors?: boolean }
    mutationMeta: { toastErrors?: boolean }
  }
}

export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.detail
  return translate('errors.generic')
}

function toastError(error: unknown, meta: { toastErrors?: boolean } | undefined) {
  if (meta?.toastErrors === false) return
  if (isApiError(error) && error.status === 401) return
  if (error instanceof DOMException && error.name === 'AbortError') return
  const message = errorMessage(error)
  // id de-duplicates identical messages (e.g. several queries failing offline)
  toast.error(message, { id: `err:${message}` })
}

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Background refetch failures of data already on screen stay quiet.
        if (query.state.data !== undefined) return
        toastError(error, query.meta)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => toastError(error, mutation.meta),
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => {
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false
          return count < 1
        },
      },
      mutations: { retry: false },
    },
  })
}
