/**
 * Auth, against the fixed contract in docs/ARCHITECTURE.md ("Auth contract").
 * Types come from the generated OpenAPI schema.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, setCsrfLoader, setCsrfToken } from '@/api/client'
import { qk } from '@/api/keys'
import type { Schema } from '@/api/types'

export type SessionUser = Schema<'UserOut'>
export type SessionInfo = Schema<'SessionOut'>
export type AuthResponse = Schema<'AuthOut'>
export type LoginBody = Schema<'LoginIn'>
export type RegisterBody = Schema<'RegisterIn'>

export async function fetchSession(): Promise<SessionInfo> {
  const s = await api.get<SessionInfo>('/auth/session', { skipAuthRedirect: true })
  setCsrfToken(s.csrf_token)
  return s
}

/** Lets the API client fetch a CSRF token on demand, through the query cache. */
export function registerCsrfLoader(qc: QueryClient) {
  setCsrfLoader(async () => {
    const s = await qc.fetchQuery({ queryKey: qk.session, queryFn: fetchSession, staleTime: 0 })
    return s.csrf_token
  })
}

export function useSession() {
  return useQuery({
    queryKey: qk.session,
    queryFn: fetchSession,
    staleTime: 5 * 60_000,
    // Cheap call: re-check when the app comes back to the foreground so an
    // expired session sends the user to the login page.
    refetchOnWindowFocus: true,
  })
}

/** Marks the cached session as logged out (the route guard then redirects). */
export function markLoggedOut(qc: QueryClient) {
  qc.setQueryData<SessionInfo>(qk.session, (s) => (s ? { ...s, user: null } : s))
}

function onAuthenticated(qc: QueryClient, res: AuthResponse) {
  setCsrfToken(res.csrf_token)
  // Drop everything cached for a previous user before showing the new one.
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== qk.session[0] })
  qc.setQueryData<SessionInfo>(qk.session, (s) => ({
    allow_registration: s?.allow_registration ?? false,
    user: res.user,
    csrf_token: res.csrf_token,
  }))
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: LoginBody) => api.post<AuthResponse>('/auth/login', body, { skipAuthRedirect: true }),
    onSuccess: (res) => onAuthenticated(qc, res),
    meta: { toastErrors: false }, // shown inline by the form
  })
}

export function useRegister() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: RegisterBody) =>
      api.post<AuthResponse>('/auth/register', body, { skipAuthRedirect: true }),
    onSuccess: (res) => onAuthenticated(qc, res),
    meta: { toastErrors: false },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>('/auth/logout', undefined, { skipAuthRedirect: true }),
    onSettled: () => {
      setCsrfToken(null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== qk.session[0] })
      markLoggedOut(qc)
      // A fresh session gives a fresh CSRF token for the login form.
      void qc.invalidateQueries({ queryKey: qk.session })
    },
  })
}
