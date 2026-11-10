/**
 * One API, two presentations:
 *  - mobile (< 768px): bottom drawer (vaul) that can be dragged down to close
 *  - desktop: centred dialog
 *
 *   <ResponsiveSheet open={open} onOpenChange={setOpen} title={t('quickAdd.newExpense')}
 *     footer={<Button size="block" onClick={save}>{t('common.save')}</Button>}>
 *     ...form...
 *   </ResponsiveSheet>
 *
 * Both trap focus, close on Escape and restore focus to the opener (Radix).
 */
import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'

export interface ResponsiveSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Required for screen readers; hide it visually with `hideTitle`. */
  title: string
  hideTitle?: boolean
  description?: ReactNode
  children: ReactNode
  /** Sticky actions at the bottom (save / delete). */
  footer?: ReactNode
  /** Dialog width on desktop. */
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const DIALOG_WIDTH = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-xl' } as const

export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  description,
  children,
  footer,
  size = 'md',
  className,
}: ResponsiveSheetProps) {
  const isDesktop = useIsDesktop()
  // Without a description, tell Radix there is none (avoids its console warning).
  const noDescription = description ? {} : { 'aria-describedby': undefined }

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn('max-h-[90dvh] gap-0 overflow-y-auto rounded-2xl p-5', DIALOG_WIDTH[size], className)}
          {...noDescription}
        >
          <DialogHeader className={cn('mb-3', hideTitle && 'sr-only')}>
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
          {footer ? (
            <DialogFooter className="mx-0 mt-5 mb-0 flex-col gap-2 rounded-none border-0 bg-transparent p-0 sm:flex-col">
              {footer}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className={className} {...noDescription}>
        <DrawerHeader className={cn('px-[18px] pt-2 pb-1', hideTitle && 'sr-only')}>
          <DrawerTitle className="text-[19px] font-semibold">{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px] pb-2">{children}</div>
        {footer ? <DrawerFooter className="gap-2 px-[18px] pt-2 pb-4">{footer}</DrawerFooter> : null}
      </DrawerContent>
    </Drawer>
  )
}
