/**
 * Motion (motion/react) setup. Shared presets: src/lib/motion.ts.
 *
 * <MotionProvider> wraps the app. LazyMotion fetches only the DOM animation
 * features, in their own chunk after first paint; use `m.*`, never `motion.*`
 * (`strict` throws on it). MotionConfig drops transform animations for
 * prefers-reduced-motion.
 */
import { LazyMotion, MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'

const loadFeatures = () => import('@/lib/motion-features').then((mod) => mod.default)

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
