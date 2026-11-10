import { ScreenPlaceholder } from '@/components/ScreenPlaceholder'
import { useT } from '@/i18n'

/** Placeholder: replace with the real screen (see docs/FRONTEND.md). */
export default function IncomeCategoriesPage() {
  const t = useT()
  return <ScreenPlaceholder title={t('settings.incomeCategories')} backTo="/settings" />
}
