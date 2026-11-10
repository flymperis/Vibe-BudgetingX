/**
 * Tiny typed i18n.
 *
 *   const t = useT()                       // in components (re-renders on language change)
 *   t('nav.home')                          // "Αρχική"
 *   t('progress.label', { spent, budget }) // "{spent} από {budget}" filled in
 *
 * `translate()` is the non-hook version for code outside React (API errors).
 * Add strings to el.ts first (the key source) and then to en.ts (the compiler
 * enforces that every key exists in both).
 */
import { useMemo, useSyncExternalStore } from 'react'
import { el, type MessageKey } from './el'
import { en } from './en'

export type { MessageKey }
export type Lang = 'el' | 'en'
export type TParams = Record<string, string | number>
export type TFunction = (key: MessageKey, params?: TParams) => string

export const LANGS: Lang[] = ['el', 'en']
export const LOCALES: Record<Lang, string> = { el: 'el-GR', en: 'en-GB' }
const DICTS: Record<Lang, Record<MessageKey, string>> = { el, en }
const STORAGE_KEY = 'vbx.lang'

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'en' || v === 'el' ? v : 'el'
  } catch {
    return 'el'
  }
}

let current: Lang = typeof window === 'undefined' ? 'el' : readStoredLang()
const listeners = new Set<() => void>()

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* private mode */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function interpolate(template: string, params?: TParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m))
}

export function translate(key: MessageKey, params?: TParams, lang: Lang = current): string {
  return interpolate(DICTS[lang][key] ?? DICTS.el[key] ?? key, params)
}

/** Current language; re-renders when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang)
}

/** Translation function bound to the current language. */
export function useT(): TFunction {
  const lang = useLang()
  return useMemo<TFunction>(() => (key, params) => translate(key, params, lang), [lang])
}

/** BCP-47 locale for Intl APIs ("el-GR" / "en-GB"). */
export function useLocale(): string {
  return LOCALES[useLang()]
}
