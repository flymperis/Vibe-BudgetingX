import { Coffee, Fuel, Home, ShoppingCart, UtensilsCrossed } from 'lucide-react'
import { categoryVisual, normalizeName } from './category-icon'

describe('categoryVisual', () => {
  it('maps common Greek and English names to icons', () => {
    expect(categoryVisual('Σούπερ μάρκετ').icon).toBe(ShoppingCart)
    expect(categoryVisual('Groceries').icon).toBe(ShoppingCart)
    expect(categoryVisual('Καφές').icon).toBe(Coffee)
    expect(categoryVisual('ΚΑΦΕΣ').icon).toBe(Coffee)
    expect(categoryVisual('Φαγητό έξω').icon).toBe(UtensilsCrossed)
    expect(categoryVisual('Βενζίνη').icon).toBe(Fuel)
    expect(categoryVisual('Ενοίκιο').icon).toBe(Home)
  })

  it('matches stems at word starts only', () => {
    // "education" contains "cat" and "vacation" contains "cat", neither is a pet
    expect(categoryVisual('Education').tone).toBe('indigo')
    expect(categoryVisual('Φορέματα').matched).toBe(false)
  })

  it('is deterministic for unknown names', () => {
    const a = categoryVisual('Ξωτικά πράγματα')
    const b = categoryVisual('ξωτικα  πραγματα')
    expect(a.matched).toBe(false)
    expect(b).toEqual(a)
    expect(a.className).toMatch(/^bg-/)
  })

  it('normalises names', () => {
    expect(normalizeName('  Καφές  Έξω ')).toBe('καφεσ εξω')
  })
})
