import { useT } from '@/i18n'
import { CategoriesManager } from './CategoriesManager'

/** /settings/income-categories */
export default function IncomeCategoriesPage() {
  const t = useT()
  return <CategoriesManager kind="income" title={t('settings.incomeCategories')} />
}
