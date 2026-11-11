import { createContext, use, useMemo, useSyncExternalStore } from 'react'

/**
 * The centre "+" (mobile tab bar) and the sidebar's "new" button open the
 * quick-add sheet owned by the shell. Any screen can open it too:
 *   const quickAdd = useQuickAdd(); quickAdd.open()            // expense
 *   quickAdd.open({ kind: 'income' })                            // income
 * (`open` also accepts a click event, so `onClick={quickAdd.open}` works.)
 */
export type QuickAddKind = 'expense' | 'income'

export interface QuickAddOptions {
  kind?: QuickAddKind
}

export interface QuickAddApi {
  open: (options?: QuickAddOptions | unknown) => void
}

/** The shell provides the raw opener; useQuickAdd() adds the options. */
export const QuickAddContext = createContext<{ open: () => void }>({ open: () => {} })

// ---- the latest request (read by the sheet) ----------------------------------

export interface QuickAddRequest {
  id: number
  kind: QuickAddKind
}

let request: QuickAddRequest = { id: 0, kind: 'expense' }
const listeners = new Set<() => void>()

function kindOf(options: unknown): QuickAddKind {
  return options && typeof options === 'object' && (options as QuickAddOptions).kind === 'income'
    ? 'income'
    : 'expense'
}

export function requestQuickAdd(options?: unknown) {
  request = { id: request.id + 1, kind: kindOf(options) }
  listeners.forEach((l) => l())
}

export function useQuickAddRequest(): QuickAddRequest {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => request,
    () => request,
  )
}

export function useQuickAdd(): QuickAddApi {
  const shell = use(QuickAddContext)
  return useMemo(
    () => ({
      open: (options?: unknown) => {
        requestQuickAdd(options)
        shell.open()
      },
    }),
    [shell],
  )
}
