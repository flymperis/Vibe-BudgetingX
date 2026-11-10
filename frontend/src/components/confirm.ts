import { createContext, use } from 'react'
import type { ConfirmOptions } from './ConfirmDialog'

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)

/** `if (await confirm({ title, destructive: true })) ...` (needs <ConfirmProvider>). */
export function useConfirm(): ConfirmFn {
  const fn = use(ConfirmContext)
  if (!fn) throw new Error('useConfirm() must be used inside <ConfirmProvider>')
  return fn
}
