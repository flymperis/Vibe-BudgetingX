/**
 * The one HTTP client. Every request to the backend goes through `api`.
 *
 *   const rows = await api.get<Expense[]>('/expenses', { params: { month } })
 *   const saved = await api.post<Expense>('/expenses', body)
 *
 * - Paths are relative to /api ("/expenses" -> "/api/expenses").
 * - Cookies are always sent (`credentials: 'include'`).
 * - Non-GET requests carry `X-CSRF-Token` (from the session query; fetched on
 *   demand if it is not known yet).
 * - Failures throw ApiError { status, detail }. status 0 = network failure.
 * - A 401 calls the registered unauthorized handler (the app sends the user to
 *   /login). Auth endpoints opt out with `{ skipAuthRedirect: true }`.
 *
 * Toasting errors is NOT done here: TanStack Query's caches do it (see
 * src/app/query-client.ts), so a component can opt out per query/mutation.
 */
import { translate } from '@/i18n'

export class ApiError extends Error {
  readonly status: number
  readonly detail: string
  readonly body: unknown

  constructor(status: number, detail: string, body?: unknown) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.body = body
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>

export interface RequestOptions {
  params?: QueryParams
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Do not trigger the 401 -> login redirect (login form, session probe). */
  skipAuthRedirect?: boolean
}

export const API_BASE = '/api'

// ---- CSRF token -------------------------------------------------------------

let csrfToken: string | null = null
let csrfLoader: (() => Promise<string | null>) | null = null

export function setCsrfToken(token: string | null | undefined) {
  csrfToken = token ?? null
}

export function getCsrfToken() {
  return csrfToken
}

/** How to obtain a token when none is known (the session query registers this). */
export function setCsrfLoader(loader: (() => Promise<string | null>) | null) {
  csrfLoader = loader
}

// ---- 401 handling -------------------------------------------------------------

let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

function handleUnauthorized() {
  if (unauthorizedHandler) {
    unauthorizedHandler()
    return
  }
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    const next = window.location.pathname + window.location.search
    window.location.assign(`/login?next=${encodeURIComponent(next)}`)
  }
}

// ---- helpers -----------------------------------------------------------------

export function buildUrl(path: string, params?: QueryParams): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  const url = clean.startsWith(`${API_BASE}/`) ? clean : `${API_BASE}${clean}`
  if (!params) return url
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.append(key, String(value))
  }
  const qs = search.toString()
  return qs ? `${url}?${qs}` : url
}

/** FastAPI sends `detail` as a string, or as a list of validation errors (422). */
export function detailFrom(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string' && detail) return detail
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : ''))
        .filter(Boolean)
      if (msgs.length) return msgs.join(' ')
    }
  }
  if (status === 401) return translate('errors.sessionExpired')
  return translate('errors.generic')
}

async function readBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    try {
      return await res.json()
    } catch {
      return null
    }
  }
  const text = await res.text()
  return text || null
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { params, body, headers = {}, signal, skipAuthRedirect } = options
  const finalHeaders: Record<string, string> = { Accept: 'application/json', ...headers }
  let payload: BodyInit | undefined

  if (body instanceof FormData) {
    payload = body // browser sets the multipart boundary
  } else if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  if (method !== 'GET' && method !== 'HEAD') {
    if (!csrfToken && csrfLoader) csrfToken = await csrfLoader()
    if (csrfToken) finalHeaders['X-CSRF-Token'] = csrfToken
  }

  let res: Response
  try {
    res = await fetch(buildUrl(path, params), {
      method,
      headers: finalHeaders,
      body: payload,
      credentials: 'include',
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, translate('errors.network'))
  }

  const data = await readBody(res)
  if (!res.ok) {
    if (res.status === 401 && !skipAuthRedirect) handleUnauthorized()
    throw new ApiError(res.status, detailFrom(data, res.status), data)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
}
