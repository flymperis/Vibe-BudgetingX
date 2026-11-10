import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ConfirmContext, type ConfirmFn } from './confirm'
import { ConfirmDialog, type ConfirmOptions } from './ConfirmDialog'

/** Hosts one ConfirmDialog for the whole app; see useConfirm(). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [open, setOpen] = useState(false)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    resolver.current?.(false)
    setOptions(opts)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
  }

  return (
    <ConfirmContext value={confirm}>
      {children}
      {options ? (
        <ConfirmDialog
          {...options}
          open={open}
          onOpenChange={(o) => {
            if (!o) settle(false)
            setOpen(o)
          }}
          onConfirm={() => settle(true)}
        />
      ) : null}
    </ConfirmContext>
  )
}
