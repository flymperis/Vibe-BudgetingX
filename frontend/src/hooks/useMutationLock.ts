import { useEffect, useRef } from 'react'

/**
 * Synchronous double-submit guard for a form's save mutation.
 *
 * `mutation.isPending` only becomes true after TanStack Query notifies its
 * observers (batched, a tick later), so two quick taps or tap + Enter could
 * both call `mutate`. Take the lock right before mutating:
 *
 *   const save = useSaveThing()
 *   const lock = useMutationLock(save)
 *   const submit = () => {
 *     if (invalid) return ...
 *     if (!lock.take()) return
 *     save.mutate(body)
 *   }
 *
 * The lock is released when the mutation settles (success or error).
 */
export function useMutationLock(mutation: { status: string; submittedAt: number }) {
  const locked = useRef(false)
  useEffect(() => {
    if (mutation.status !== 'pending') locked.current = false
  }, [mutation.status, mutation.submittedAt])
  return {
    take(): boolean {
      if (locked.current) return false
      locked.current = true
      return true
    },
  }
}
