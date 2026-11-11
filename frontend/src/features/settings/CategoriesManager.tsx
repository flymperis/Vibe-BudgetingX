import { Plus, Tags } from 'lucide-react'
import { CategoryIcon } from '@/components/CategoryIcon'
import { EmptyState } from '@/components/EmptyState'
import { ListGroup, ListRow } from '@/components/ListGroup'
import { PageHeader } from '@/components/PageHeader'
import { useSheet } from '@/components/manage/useSheet'
import { ListSkeleton } from '@/components/skeletons'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'
import { useCategories, type Category, type CategoryKind } from './api'
import { categoryUsage } from './categories'
import { CategorySheet } from './CategorySheet'

/** Shared body of the expense and income category settings pages. */
export function CategoriesManager({ kind, title }: { kind: CategoryKind; title: string }) {
  const t = useT()
  const list = useCategories(kind)
  const sheet = useSheet<Category | null>()
  const open = sheet.show
  const items = list.data?.items ?? []

  return (
    <>
      <PageHeader
        title={title}
        backTo="/settings"
        actions={
          <Button
            size="icon-touch"
            className="rounded-full"
            aria-label={t('settings.addCategory')}
            onClick={() => open(null)}
          >
            <Plus aria-hidden />
          </Button>
        }
      />
      <p className="-mt-2 mb-4 text-sm text-muted-foreground">
        {kind === 'expense' ? t('settings.expenseCategoriesHelp') : t('settings.incomeCategoriesHelp')}
      </p>
      {list.isPending ? (
        <ListSkeleton rows={6} />
      ) : !items.length ? (
        <EmptyState
          icon={Tags}
          title={kind === 'expense' ? t('settings.noExpenseCategories') : t('settings.noIncomeCategories')}
          action={
            <Button size="touch" onClick={() => open(null)}>
              <Plus aria-hidden />
              {t('settings.addCategory')}
            </Button>
          }
        />
      ) : (
        <ListGroup label={title}>
          {items.map((c) => (
            <ListRow
              key={c.id}
              onClick={() => open(c)}
              icon={<CategoryIcon name={c.name} />}
              title={c.name}
              subtitle={categoryUsage(t, kind, c)}
              chevron
            />
          ))}
        </ListGroup>
      )}
      {sheet.state ? (
        <CategorySheet
          key={sheet.state.key}
          kind={kind}
          open={sheet.state.open}
          onOpenChange={sheet.onOpenChange}
          category={sheet.state.item}
        />
      ) : null}
    </>
  )
}
