import { useCallback, useSyncExternalStore } from 'react'

/** Live result of a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  const get = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches
  return useSyncExternalStore(subscribe, get, () => false)
}

/** The desktop breakpoint (Tailwind `md`, 768px): sidebar layout, dialogs instead of drawers. */
export const DESKTOP_QUERY = '(min-width: 768px)'

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY)
}
