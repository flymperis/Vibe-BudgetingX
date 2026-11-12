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
 * Both trap focus, close on Escape and restore focus to the opener (Radix),
 * and the back button closes them (useBackToClose).
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
import { useBackToClose } from '@/hooks/useBackToClose'
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
  /** Extra classes for the footer on mobile (e.g. a divider when it holds more than buttons). */
  footerClassName?: string
  /** Dialog width on desktop. */
  size?: 'sm' | 'md' | 'lg'
  /**
   * Mobile: fade the body's direct children in one after another as the sheet
   * opens (CSS `.sheet-stagger`, off with reduced motion). Turn it off when the
   * body is a single wrapper and stagger its fields yourself instead.
   */
  stagger?: boolean
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
  footerClassName,
  size = 'md',
  stagger = true,
  className,
}: ResponsiveSheetProps) {
  const isDesktop = useIsDesktop()
  // Back (browser, Android gesture) closes the sheet instead of leaving the screen.
  useBackToClose(open, () => onOpenChange(false))
  // Without a description, tell Radix there is none (avoids its console warning).
  const noDescription = description ? {} : { 'aria-describedby': undefined }

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          // The dialog is a CSS grid: without min-w-0 on its children a horizontally
          // scrolling child (ChipPicker, tables) would widen the dialog itself.
          className={cn(
            'max-h-[90dvh] gap-0 overflow-y-auto rounded-2xl p-5 [&>*]:min-w-0',
            DIALOG_WIDTH[size],
            className,
          )}
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
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px] pb-2',
            stagger && 'sheet-stagger',
          )}
        >
          {children}
        </div>
        {footer ? (
          <DrawerFooter className={cn('gap-2 px-[18px] pt-2 pb-4', footerClassName)}>{footer}</DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}
