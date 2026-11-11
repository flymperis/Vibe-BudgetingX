import { Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { errorMessage } from '@/app/query-client'
import { CategoryIcon } from '@/components/CategoryIcon'
import { useConfirm } from '@/components/confirm'
import { FieldError, FieldLabel } from '@/components/FormField'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/i18n'
import { useDeleteCategory, useSaveCategory, type Category, type CategoryKind } from './api'
import { categoryUsage } from './categories'

export interface CategorySheetProps {
  kind: CategoryKind
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = new category. Mount with a fresh `key` each time. */
  category: Category | null
}

/** Add / rename / delete one expense or income category. */
export function CategorySheet({ kind, open, onOpenChange, category }: CategorySheetProps) {
  const t = useT()
  const confirm = useConfirm()
  const save = useSaveCategory(kind)
  const del = useDeleteCategory(kind)
  const nameId = useId()
  const blockedId = useId()
  const [name, setName] = useState(category?.name ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  const submit = () => {
    if (!name.trim()) {
      setProblem(t('settings.errName'))
      return
    }
    save.mutate({ id: category?.id ?? null, name: name.trim() }, { onSuccess: () => onOpenChange(false) })
  }
  const remove = async () => {
    if (!category) return
    const ok = await confirm({
      title: t('settings.deleteCategoryTitle', { name: category.name }),
      description: t('common.cannotUndo'),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (ok) del.mutate(category.id, { onSuccess: () => onOpenChange(false) })
  }

  const serverError = save.error ?? del.error
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={category ? t('settings.editCategory') : t('settings.addCategory')}
      footer={
        <>
          <Button size="block" onClick={submit} disabled={save.isPending}>
            {category ? t('common.save') : t('settings.addCategory')}
          </Button>
          {category ? (
            <Button
              variant="destructive"
              size="block"
              onClick={remove}
              disabled={del.isPending || !category.can_delete}
              aria-describedby={!category.can_delete ? blockedId : undefined}
            >
              <Trash2 aria-hidden />
              {t('settings.deleteCategory')}
            </Button>
          ) : null}
        </>
      }
    >
      <FieldLabel htmlFor={nameId} className="mt-1">
        {t('settings.categoryName')}
      </FieldLabel>
      <div className="flex items-center gap-2.5">
        <CategoryIcon name={name || '?'} />
        <Input
          id={nameId}
          value={name}
          autoComplete="off"
          placeholder={
            kind === 'expense'
              ? t('settings.expenseCategoryPlaceholder')
              : t('settings.incomeCategoryPlaceholder')
          }
          onChange={(e) => {
            setProblem(null)
            save.reset()
            setName(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
      </div>
      {category ? (
        <p className="mt-3 text-sm text-muted-foreground">{categoryUsage(t, kind, category)}</p>
      ) : null}
      {category && !category.can_delete ? (
        <p id={blockedId} className="mt-1 text-sm text-warning">
          {t('settings.cannotDeleteCategory')}
        </p>
      ) : null}
      <FieldError>{problem ?? (serverError ? errorMessage(serverError) : null)}</FieldError>
    </ResponsiveSheet>
  )
}
