/**
 * Colour theme + light/dark mode, stored per device in localStorage.
 *
 *   <html data-theme="zinc|blue|green|violet|rose" data-mode="light|dark">
 *
 * index.html runs the same logic inline before first paint (keep the storage
 * keys in sync). `mode` can be "system": the resolved mode then follows
 * prefers-color-scheme live.
 */
import { useSyncExternalStore } from 'react'

export const THEMES = ['zinc', 'blue', 'green', 'violet', 'rose'] as const
export type ThemeName = (typeof THEMES)[number]
export type ModePreference = 'light' | 'dark' | 'system'
export type Mode = 'light' | 'dark'

/** Swatch colours for pickers (light-mode primary of each theme). */
export const THEME_SWATCH: Record<ThemeName, string> = {
  zinc: '#18181b',
  blue: '#2563eb',
  green: '#047857',
  violet: '#7c3aed',
  rose: '#e11d48',
}

const THEME_KEY = 'vbx.theme'
const MODE_KEY = 'vbx.mode'

export interface ThemeState {
  theme: ThemeName
  mode: ModePreference
  resolvedMode: Mode
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode */
  }
}

const darkQuery = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

function computeState(): ThemeState {
  const t = read(THEME_KEY)
  const m = read(MODE_KEY)
  const theme = (THEMES as readonly string[]).includes(t ?? '') ? (t as ThemeName) : 'zinc'
  const mode: ModePreference = m === 'light' || m === 'dark' ? m : 'system'
  const resolvedMode: Mode = mode === 'system' ? (darkQuery()?.matches ? 'dark' : 'light') : mode
  return { theme, mode, resolvedMode }
}

let state: ThemeState = computeState()
const listeners = new Set<() => void>()

function apply(s: ThemeState) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = s.theme
  root.dataset.mode = s.resolvedMode
  // Status bar / browser chrome follows the page background of the active theme.
  const bg = getComputedStyle(root).getPropertyValue('--background').trim()
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  if (bg) meta.content = bg
}

function update() {
  state = computeState()
  apply(state)
  listeners.forEach((l) => l())
}

export function getThemeState(): ThemeState {
  return state
}

export function setTheme(theme: ThemeName) {
  write(THEME_KEY, theme)
  update()
}

export function setMode(mode: ModePreference) {
  write(MODE_KEY, mode)
  update()
}

/** Call once at startup: applies the stored theme and follows OS dark mode changes. */
export function initTheme() {
  update()
  darkQuery()?.addEventListener('change', () => {
    if (state.mode === 'system') update()
  })
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useTheme(): ThemeState & {
  setTheme: typeof setTheme
  setMode: typeof setMode
} {
  const s = useSyncExternalStore(subscribe, getThemeState, getThemeState)
  return { ...s, setTheme, setMode }
}
