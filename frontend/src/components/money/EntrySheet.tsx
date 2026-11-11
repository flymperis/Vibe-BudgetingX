import { useId, useState } from 'react'
import { useMutationLock } from '@/hooks/useMutationLock'
import { toast } from 'sonner'
import { errorMessage } from '@/app/query-client'
import { useBootstrap, useToday } from '@/bootstrap/bootstrap'
import { FieldError } from '@/components/FormField'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useT, type TFunction } from '@/i18n'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useSaveEntry, type Entry, type EntryKind } from './entries'
import { EntryForm } from './EntryForm'
import {
  defaultAccountId,
  draftFromEntry,
  draftSignedAmount,
  draftToBody,
  emptyDraft,
  rememberAccount,
  validateDraft,
  type DraftError,
  type EntryDraft,
} from './entry-form'

export interface EntrySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this entry; without it the sheet adds a new one. */
  entry?: Entry | null
  /** Kind of a new entry. */
  kind?: EntryKind
  /** Show the Expense / Income switch (quick add). */
  allowKindSwitch?: boolean
  /** Changing it while open resets the form (a new quick-add request). */
  requestId?: number
}

const ERROR_KEY = {
  amount: 'money.errorAmount',
  category: 'money.errorCategory',
  account: 'money.errorAccount',
} as const

function titleFor(t: TFunction, kind: EntryKind, editing: boolean) {
  if (editing) return t(kind === 'expense' ? 'money.editExpense' : 'money.editIncome')
  return t(kind === 'expense' ? 'money.newExpense' : 'money.newIncome')
}

/** Add or edit an expense / income entry in a sheet. */
export function EntrySheet({
  open,
  onOpenChange,
  entry,
  kind: initialKind = 'expense',
  allowKindSwitch = false,
  requestId = 0,
}: EntrySheetProps) {
  const t = useT()
  const boot = useBootstrap()
  const today = useToday()
  const isDesktop = useIsDesktop()
  const formId = useId()
  const save = useSaveEntry()
  const lock = useMutationLock(save)

  const freshState = () => {
    const k = entry?.kind ?? initialKind
    return {
      kind: k,
      draft: entry ? draftFromEntry(entry) : emptyDraft(today, defaultAccountId(k, boot.accounts)),
    }
  }
  const [state, setState] = useState(freshState)
  const [invalid, setInvalid] = useState<DraftError | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  // Reset the form whenever the sheet (re)opens or a new request comes in.
  const openKey = open ? `${requestId}:${entry?.kind ?? initialKind}:${entry?.id ?? 'new'}` : null
  const [lastKey, setLastKey] = useState<string | null>(null)
  if (openKey !== lastKey) {
    setLastKey(openKey)
    if (openKey !== null) {
      setState(freshState())
      setInvalid(null)
      setServerError(null)
    }
  }

  const { kind, draft } = state
  const editing = !!entry
  const patch = (p: Partial<EntryDraft>) => {
    setState((s) => ({ ...s, draft: { ...s.draft, ...p } }))
    if (invalid) setInvalid(null)
    if (serverError) setServerError(null)
  }

  const switchKind = (next: EntryKind) => {
    if (next === kind) return
    // Carry amount (magnitude), day and notes; categories differ per kind.
    setState((s) => ({
      kind: next,
      draft: {
        ...s.draft,
        refund: false,
        categoryId: null,
        accountId: s.draft.accountId ?? defaultAccountId(next, boot.accounts),
      },
    }))
    setInvalid(null)
    setServerError(null)
  }

  const submit = () => {
    if (save.isPending) return
    const problem = validateDraft(draft)
    if (problem) {
      setInvalid(problem)
      return
    }
    setServerError(null)
    const category = (kind === 'expense' ? boot.categories : boot.income_categories).find(
      (c) => c.id === draft.categoryId,
    )
    if (!lock.take()) return
    save.mutate(
      { kind, id: entry?.id, body: draftToBody(kind, draft) },
      {
        onSuccess: () => {
          rememberAccount(kind, draft.accountId)
          toast.success(
            editing
              ? t('common.saved')
              : t('money.added', {
                  amount: formatMoney(draftSignedAmount(kind, draft), {
                    signed: kind === 'income' || draft.refund,
                  }),
                  category: category?.name ?? '',
                }),
          )
          onOpenChange(false)
        },
        onError: (error) => setServerError(errorMessage(error)),
      },
    )
  }

  const message = invalid ? t(ERROR_KEY[invalid]) : serverError

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={titleFor(t, kind, editing)}
      hideTitle={allowKindSwitch && !editing}
      footer={
        <Button size="block" type="submit" form={formId} disabled={save.isPending}>
          {t('common.save')}
        </Button>
      }
    >
      {allowKindSwitch && !editing ? <KindSwitch value={kind} onChange={switchKind} /> : null}
      <form
        id={formId}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className={cn('min-w-0', !isDesktop && 'pt-1')}
      >
        <EntryForm kind={kind} draft={draft} onChange={patch} invalid={invalid} autoFocusAmount={!editing} />
        <FieldError>{message}</FieldError>
      </form>
    </ResponsiveSheet>
  )
}

/** Segmented Expense / Income switch (old home sheets). */
function KindSwitch({ value, onChange }: { value: EntryKind; onChange: (kind: EntryKind) => void }) {
  const t = useT()
  const kinds: EntryKind[] = ['expense', 'income']
  return (
    <div
      role="radiogroup"
      aria-label={t('money.kind')}
      className="mb-3 grid min-w-0 grid-cols-2 gap-1 rounded-xl bg-muted p-1"
    >
      {kinds.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          data-vaul-no-drag
          onClick={() => onChange(k)}
          onKeyDown={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
              e.preventDefault()
              const next = k === 'expense' ? 'income' : 'expense'
              onChange(next)
              ;(
                e.currentTarget.parentElement?.querySelector(`[data-kind="${next}"]`) as HTMLElement | null
              )?.focus()
            }
          }}
          data-kind={k}
          tabIndex={value === k ? 0 : -1}
          className={cn(
            'h-10 rounded-lg text-[15px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {k === 'expense' ? t('money.newExpense') : t('money.newIncome')}
        </button>
      ))}
    </div>
  )
}
