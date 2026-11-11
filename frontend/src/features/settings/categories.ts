import type { TFunction } from '@/i18n'
import type { Category, CategoryKind } from './api'

/** "12 έξοδα · 1 επαναλαμβανόμενο" or "Δεν χρησιμοποιείται" (the counts behind the delete rule). */
export function categoryUsage(
  t: TFunction,
  kind: CategoryKind,
  c: Pick<Category, 'entry_count' | 'rule_count'>,
): string {
  const parts: string[] = []
  if (c.entry_count) {
    const one = c.entry_count === 1
    const key =
      kind === 'expense'
        ? one
          ? 'settings.expensesOne'
          : 'settings.expensesMany'
        : one
          ? 'settings.incomeOne'
          : 'settings.incomeMany'
    parts.push(t(key, { n: c.entry_count }))
  }
  if (c.rule_count) {
    parts.push(t(c.rule_count === 1 ? 'settings.rulesOne' : 'settings.rulesMany', { n: c.rule_count }))
  }
  return parts.length ? parts.join(' · ') : t('settings.unused')
}
