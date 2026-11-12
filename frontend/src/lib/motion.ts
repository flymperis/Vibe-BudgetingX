/** Shared motion/react presets (provider: src/components/motion.tsx). */
import type { Variants } from 'motion/react'

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

/**
 * A list row (or group of rows) inside <AnimatePresence>: new ones drop in
 * from above while their height opens; removed ones slide out to the left,
 * then their height collapses so the rows below close the gap.
 */
export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: -12, height: 0 },
  shown: {
    opacity: 1,
    y: 0,
    height: 'auto',
    transition: { duration: 0.28, ease: EASE_OUT_EXPO },
  },
  exit: {
    x: '-100%',
    opacity: 0,
    height: 0,
    transition: {
      x: { duration: 0.2, ease: 'easeIn' },
      opacity: { duration: 0.2 },
      height: { delay: 0.18, duration: 0.22, ease: EASE_OUT_EXPO },
    },
  },
}

/** Props for an `m.*` list item; `enter` says whether it may animate in when it mounts. */
export const listItemMotion = (enter: boolean) =>
  ({
    variants: listItemVariants,
    initial: enter ? 'hidden' : false,
    animate: 'shown',
    exit: 'exit',
  }) as const
