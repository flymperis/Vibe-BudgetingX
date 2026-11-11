import { useT } from '@/i18n'
import { CategoriesManager } from './CategoriesManager'

/** /settings/expense-categories */
export default function ExpenseCategoriesPage() {
  const t = useT()
  return <CategoriesManager kind="expense" title={t('settings.expenseCategories')} />
}
