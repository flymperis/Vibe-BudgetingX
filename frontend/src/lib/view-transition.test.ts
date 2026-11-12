import { afterEach, describe, expect, it } from 'vitest'
import { directionBetween, setNavDirection } from './view-transition'

describe('view transition direction', () => {
  afterEach(() => setNavDirection(null))

  it('goes forward to a tab further right and back to one on the left', () => {
    expect(directionBetween(0, 2)).toBe('forward')
    expect(directionBetween(3, 1)).toBe('back')
  })

  it('has no direction for the same tab or an unknown one', () => {
    expect(directionBetween(1, 1)).toBeNull()
    expect(directionBetween(-1, 2)).toBeNull()
  })

  it('marks <html> for the CSS and clears it again', () => {
    setNavDirection('back')
    expect(document.documentElement.dataset.navDir).toBe('back')
    setNavDirection(null)
    expect(document.documentElement.dataset.navDir).toBeUndefined()
  })
})
