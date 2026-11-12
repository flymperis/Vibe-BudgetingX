import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach } from 'vitest'

// Animations finish instantly in tests: removed list rows leave the DOM at once
// and nothing depends on timers or animation frames.
MotionGlobalConfig.skipAnimations = true

afterEach(() => {
  cleanup()
  localStorage.clear()
})

// jsdom lacks matchMedia, ResizeObserver and scrollIntoView, which Radix/vaul use.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
if (!('ResizeObserver' in window)) {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO
}
Element.prototype.scrollIntoView ??= function () {}
// vaul (mobile drawer) captures the pointer while dragging.
Element.prototype.setPointerCapture ??= function () {}
Element.prototype.releasePointerCapture ??= function () {}
Element.prototype.hasPointerCapture ??= function () {
  return false
}
