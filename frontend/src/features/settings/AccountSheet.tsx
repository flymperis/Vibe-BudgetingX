import { Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { errorMessage } from '@/app/query-client'
import { ChipPicker } from '@/components/ChipPicker'
import { useConfirm } from '@/components/confirm'
import { DetailRow, FieldError, FieldLabel } from '@/components/FormField'
import { AccountAvatar } from '@/components/manage/AccountAvatar'
import type { Account } from '@/components/manage/accounts-api'
import { Money } from '@/components/Money'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/i18n'
import {
  accountFormFromAccount,
  buildAccountBody,
  emptyAccountForm,
  sanitizeBalanceTyping,
  validateAccount,
  type AccountForm,
  type AccountType,
} from './accountForm'
import { useDeleteAccount, useSaveAccount } from './api'

export interface AccountSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = new account. Mount with a fresh `key` each time. */
  account: Account | null
}

export function AccountSheet({ open, onOpenChange, account }: AccountSheetProps) {
  const t = useT()
  const confirm = useConfirm()
  const save = useSaveAccount()
  const del = useDeleteAccount()
  const ids = { name: useId(), type: useId(), opening: useId(), limit: useId(), st: useId(), due: useId() }
  const [form, setForm] = useState<AccountForm>(() =>
    account ? accountFormFromAccount(account) : emptyAccountForm(),
  )
  const [problem, setProblem] = useState<string | null>(null)
  const isCard = form.type === 'credit'
  const set = (patch: Partial<AccountForm>) => {
    setProblem(null)
    save.reset()
    del.reset()
    setForm((f) => ({ ...f, ...patch }))
  }

  const submit = () => {
    const issue = validateAccount(form)
    if (issue) {
      setProblem(t(issue))
      return
    }
    save.mutate(
      { id: account?.id ?? null, body: buildAccountBody(form) },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  const remove = async () => {
    if (!account) return
    const ok = await confirm({
      title: t('settings.deleteAccountTitle', { name: account.name }),
      description: t('settings.deleteAccountText'),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (ok) del.mutate(account.id, { onSuccess: () => onOpenChange(false) })
  }

  const serverError = save.error ?? del.error
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={account ? t('settings.editAccount') : t('settings.addAccount')}
      footer={
        <>
          <Button size="block" onClick={submit} disabled={save.isPending}>
            {account ? t('common.save') : t('settings.addAccount')}
          </Button>
          {account ? (
            <Button variant="destructive" size="block" onClick={remove} disabled={del.isPending}>
              <Trash2 aria-hidden />
              {t('settings.deleteAccount')}
            </Button>
          ) : null}
        </>
      }
    >
      <FieldLabel htmlFor={ids.name} className="mt-1">
        {t('settings.accountName')}
      </FieldLabel>
      <div className="flex items-center gap-2.5">
        <AccountAvatar
          name={form.name || '?'}
          bank={form.name === account?.name ? account.bank : undefined}
        />
        <Input
          id={ids.name}
          value={form.name}
          autoComplete="off"
          placeholder={t('settings.accountNamePlaceholder')}
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{t('settings.bankLogoHint')}</p>

      <FieldLabel id={ids.type}>{t('settings.accountType')}</FieldLabel>
      <ChipPicker<AccountType>
        labelledBy={ids.type}
        label={t('settings.accountType')}
        value={form.type}
        onChange={(type) => set({ type })}
        options={[
          { value: 'bank', label: t('settings.typeBank') },
          { value: 'credit', label: t('settings.typeCard') },
        ]}
      />

      <FieldLabel htmlFor={ids.opening}>
        {isCard ? t('settings.owedOnCard') : t('settings.openingBalance')}
      </FieldLabel>
      <div className="relative">
        <Input
          id={ids.opening}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={form.opening}
          onChange={(e) => set({ opening: sanitizeBalanceTyping(e.target.value, !isCard) })}
          className="pr-9 text-right tabular-nums"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-muted-foreground"
        >
          €
        </span>
      </div>
      {isCard ? <p className="mt-1.5 text-xs text-muted-foreground">{t('settings.owedHint')}</p> : null}

      {isCard ? (
        <>
          <FieldLabel htmlFor={ids.limit}>{t('settings.creditLimit')}</FieldLabel>
          <div className="relative">
            <Input
              id={ids.limit}
              inputMode="decimal"
              autoComplete="off"
              placeholder={t('settings.optional')}
              value={form.limit}
              onChange={(e) => set({ limit: sanitizeBalanceTyping(e.target.value, false) })}
              className="pr-9 text-right tabular-nums"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-muted-foreground"
            >
              €
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor={ids.st}>{t('settings.statementDay')}</FieldLabel>
              <Input
                id={ids.st}
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                placeholder="1–31"
                value={form.statementDay}
                onChange={(e) => set({ statementDay: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel htmlFor={ids.due}>{t('settings.dueDay')}</FieldLabel>
              <Input
                id={ids.due}
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                placeholder="1–31"
                value={form.dueDay}
                onChange={(e) => set({ dueDay: e.target.value })}
              />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{t('settings.cardDaysHint')}</p>
        </>
      ) : null}

      {account ? (
        <div className="mt-4 rounded-xl bg-muted/50 px-3">
          <DetailRow label={t('settings.currentBalance')}>
            <Money value={account.current_balance} className="font-semibold" />
          </DetailRow>
        </div>
      ) : null}

      <FieldError>{problem ?? (serverError ? errorMessage(serverError) : null)}</FieldError>
    </ResponsiveSheet>
  )
}
