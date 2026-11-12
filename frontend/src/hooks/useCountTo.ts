import { MotionGlobalConfig, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

const DURATION = 600
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

/** The value to show this frame while counting towards `target`. */
export function useCountTo(target: number): number {
  // Reduced motion, or animations switched off globally (tests): jump.
  const reduce = useReducedMotion() || MotionGlobalConfig.skipAnimations
  const [shown, setShown] = useState(target)
  // Where the count is right now (a change mid-count continues from here).
  const current = useRef(target)

  useEffect(() => {
    if (reduce) {
      current.current = target
      return
    }
    const from = current.current
    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const p = from === target ? 1 : Math.min(1, (now - start) / DURATION)
      // Cents only, so in-between values print like real amounts.
      const v = p === 1 ? target : Math.round((from + (target - from) * easeOutCubic(p)) * 100) / 100
      current.current = v
      setShown(v)
      if (p < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, reduce])

  return reduce ? target : shown
}
