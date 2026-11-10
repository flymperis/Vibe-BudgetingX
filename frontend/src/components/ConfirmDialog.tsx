/**
 * Confirmation before destructive actions. Never use window.confirm.
 *
 * Declarative:
 *   <ConfirmDialog open={open} onOpenChange={setOpen} title="Διαγραφή εξόδου;"
 *     confirmLabel={t('common.delete')} destructive onConfirm={() => del.mutateAsync(id)} />
 *
 * Imperative (simpler from event handlers):
 *   const confirm = useConfirm()
 *   if (await confirm({ title: '…', destructive: true })) del.mutate(id)
 */
import { useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useT } from '@/i18n'
import { Loader2 } from 'lucide-react'

export interface ConfirmOptions {
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** May return a promise: the dialog stays open with a spinner until it settles. */
  onConfirm: () => void | Promise<unknown>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const t = useT()
  const [busy, setBusy] = useState(false)

  const run = async (e: React.MouseEvent) => {
    e.preventDefault() // keep it open while the action runs
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // errors are toasted by the query layer; keep the dialog open
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-semibold">{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? (destructive ? t('common.cannotUndo') : t('common.areYouSure'))}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="rounded-b-2xl">
          <AlertDialogCancel disabled={busy} size="touch" className="md:h-9 md:text-sm">
            {cancelLabel ?? t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            size="touch"
            variant={destructive ? 'destructive' : 'default'}
            className="md:h-9 md:text-sm"
            onClick={run}
          >
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {confirmLabel ?? t('common.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
