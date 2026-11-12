/**
 * Direction of the next page change, for the slide in index.css
 * (::view-transition-old/new(root)). Links that pass `viewTransition` call
 * this on click; pages slide left when moving to a tab further right
 * (forward) and right when moving back. Without a direction they only fade.
 */
export type NavDirection = 'forward' | 'back' | null

export function setNavDirection(dir: NavDirection) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (dir) root.dataset.navDir = dir
  else delete root.dataset.navDir
}

/** Direction from the index of the current tab to the index of the clicked one. */
export function directionBetween(from: number, to: number): NavDirection {
  if (from < 0 || to < 0 || from === to) return null
  return to > from ? 'forward' : 'back'
}
