import { LOCALES, type Lang } from '@/i18n'
import { parseISODate } from '@/lib/dates'

/** "12 Νοε" / "12 Nov" (statement and due days). */
export function dayMonthLabel(iso: string | null | undefined, lang: Lang): string {
  const d = parseISODate(iso)
  if (!d) return iso ?? ''
  return new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'short' }).format(d).replace('.', '')
}
