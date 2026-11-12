import { act, render, screen } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnimatedNumber } from './AnimatedNumber'

describe('AnimatedNumber', () => {
  afterEach(() => {
    MotionGlobalConfig.skipAnimations = true
    vi.useRealTimers()
  })

  it('jumps straight to the new value when animations are off', () => {
    const { rerender } = render(<AnimatedNumber value={10} />)
    expect(screen.getByText('10,00 €')).toBeInTheDocument()
    rerender(<AnimatedNumber value={250.5} />)
    expect(screen.getByText('250,50 €')).toBeInTheDocument()
  })

  describe('with animations on', () => {
    beforeEach(() => {
      MotionGlobalConfig.skipAnimations = false
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    })

    it('counts to the new value in about 600ms', () => {
      const { container, rerender } = render(<AnimatedNumber value={0} />)
      expect(container).toHaveTextContent('0,00 €')
      rerender(<AnimatedNumber value={100} />)
      act(() => vi.advanceTimersByTime(200))
      const midway = Number(container.textContent!.replace(/[^\d,]/g, '').replace(',', '.'))
      expect(midway).toBeGreaterThan(0)
      expect(midway).toBeLessThan(100)
      act(() => vi.advanceTimersByTime(600))
      expect(container).toHaveTextContent('100,00 €')
    })
  })
})
