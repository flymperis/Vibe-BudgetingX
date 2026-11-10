import { createContext, use } from 'react'

/**
 * The centre "+" (mobile tab bar) and the sidebar's "new" button open the
 * quick-add sheet owned by the shell. Any screen can open it too:
 *   const quickAdd = useQuickAdd(); quickAdd.open()
 */
export interface QuickAddApi {
  open: () => void
}

export const QuickAddContext = createContext<QuickAddApi>({ open: () => {} })

export function useQuickAdd(): QuickAddApi {
  return use(QuickAddContext)
}
