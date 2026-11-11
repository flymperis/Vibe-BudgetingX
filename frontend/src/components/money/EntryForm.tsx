import { useId } from 'react'
import { Link } from 'react-router'
import { useBootstrap, useToday } from '@/bootstrap/bootstrap'
import { AmountDisplay, AmountInput, AmountKeypad } from '@/components/Amount'
import { CategoryGlyph } from '@/components/CategoryIcon'
import { ChipPicker } from '@/components/ChipPicker'
import { FieldLabel } from '@/components/FormField'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { AccountAvatar } from './AccountAvatar'
import { DayPicker } from './DayPicker'
import type { EntryKind } from './entries'
import type { DraftError, EntryDraft } from './entry-form'
import { NotesField } from './NotesField'

export interface EntryFormProps {
  kind: EntryKind
  draft: EntryDraft
  onChange: (patch: Partial<EntryDraft>) => void
  /** Field the last save attempt complained about (marks it). */
  invalid?: DraftError | null
  autoFocusAmount?: boolean
}

/**
 * Fields of an expense / income entry, in the order of the fast path:
 * amount -> category -> (account, day, notes) -> save. Keypad on mobile.
 */
export function EntryForm({ kind, draft, onChange, invalid, autoFocusAmount }: EntryFormProps) {
  const t = useT()
  const boot = useBootstrap()
  const today = useToday()
  const isDesktop = useIsDesktop()
  const ids = { amount: useId(), cat: useId(), acc: useId(), day: useId(), notes: useId() }
  const categories = kind === 'expense' ? boot.categories : boot.income_categories
  const isExpense = kind === 'expense'
  const sign = isExpense ? (draft.refund ? '+' : '-') : '+'

  const signToggle = isExpense ? (
    <button
      type="button"
      data-vaul-no-drag
      aria-pressed={draft.refund}
      aria-label={draft.refund ? t('money.signRefund') : t('money.signExpense')}
      title={draft.refund ? t('money.refund') : t('money.expense')}
      onClick={() => onChange({ refund: !draft.refund })}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-full border text-xl font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
        draft.refund ? 'border-positive/40 bg-positive/10 text-positive' : 'bg-muted text-foreground',
      )}
    >
      {draft.refund ? '+' : '−'}
    </button>
  ) : null

  return (
    <div>
      <label htmlFor={ids.amount} className="sr-only">
        {t('common.amount')}
      </label>
      {isDesktop ? (
        <div className="flex items-center gap-2">
          {signToggle}
          <div className="min-w-0 flex-1" aria-invalid={invalid === 'amount' || undefined}>
            <AmountInput
              id={ids.amount}
              value={draft.amount}
              onChange={(amount) => onChange({ amount })}
              autoFocus={autoFocusAmount}
              invalid={invalid === 'amount'}
            />
          </div>
        </div>
      ) : (
        <div className="relative flex items-center justify-center">
          {signToggle ? <div className="absolute left-0">{signToggle}</div> : null}
          <AmountDisplay
            value={draft.amount}
            sign={sign}
            className={cn('px-12', invalid === 'amount' && 'text-negative')}
          />
        </div>
      )}
      {isExpense && draft.refund ? (
        <p className="mt-1 text-center text-xs font-medium text-positive">{t('money.refund')}</p>
      ) : null}

      <FieldLabel id={ids.cat} className={cn(invalid === 'category' && 'text-negative')}>
        {t('common.category')}
      </FieldLabel>
      {categories.length ? (
        <ChipPicker
          bleed={!isDesktop}
          className="md:flex-wrap"
          labelledBy={ids.cat}
          label={t('common.category')}
          value={draft.categoryId}
          onChange={(categoryId) => onChange({ categoryId })}
          options={categories.map((c) => ({
            value: c.id,
            label: c.name,
            icon: <CategoryGlyph name={c.name} />,
          }))}
        />
      ) : (
        <EmptyHint
          text={isExpense ? t('money.noCategories') : t('money.noIncomeCategories')}
          to={isExpense ? '/settings/expense-categories' : '/settings/income-categories'}
        />
      )}

      <FieldLabel id={ids.acc} className={cn(invalid === 'account' && 'text-negative')}>
        {t('common.account')}
      </FieldLabel>
      {boot.accounts.length ? (
        <ChipPicker
          bleed={!isDesktop}
          className="md:flex-wrap"
          labelledBy={ids.acc}
          label={t('common.account')}
          value={draft.accountId}
          onChange={(accountId) => onChange({ accountId })}
          options={boot.accounts.map((a) => ({
            value: a.id,
            label: a.name,
            icon: a.bank ? <AccountAvatar name={a.name} bank={a.bank} size="sm" /> : undefined,
          }))}
        />
      ) : (
        <EmptyHint text={t('money.noAccounts')} to="/settings/accounts" />
      )}

      <FieldLabel id={ids.day}>{t('common.day')}</FieldLabel>
      <DayPicker
        value={draft.day}
        onChange={(day) => onChange({ day })}
        today={today}
        labelledBy={ids.day}
        bleed={!isDesktop}
      />

      <FieldLabel htmlFor={ids.notes}>{t('common.notes')}</FieldLabel>
      <NotesField
        id={ids.notes}
        value={draft.notes}
        onChange={(notes) => onChange({ notes })}
        recentTags={boot.recent_tags}
        allTags={boot.tag_names}
      />

      {!isDesktop ? (
        <AmountKeypad value={draft.amount} onChange={(amount) => onChange({ amount })} className="mt-4" />
      ) : null}
    </div>
  )
}

function EmptyHint({ text, to }: { text: string; to: string }) {
  const t = useT()
  return (
    <p className="text-sm text-muted-foreground">
      {text}{' '}
      <Link to={to} className="font-medium text-primary underline-offset-2 hover:underline">
        {t('money.addOne')}
      </Link>
    </p>
  )
}
