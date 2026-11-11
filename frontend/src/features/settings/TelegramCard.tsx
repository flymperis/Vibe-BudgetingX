import { Copy, Link2, Loader2, Send, Unlink } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/app/query-client'
import { useBootstrap, useToday } from '@/bootstrap/bootstrap'
import { Panel } from '@/components/Cards'
import { ChipPicker } from '@/components/ChipPicker'
import { useConfirm } from '@/components/confirm'
import { FieldError, FieldLabel } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useLang, useT, type MessageKey } from '@/i18n'
import { fullDateLabel } from '@/lib/dates'
import {
  useDefaultAccount,
  useLinkCode,
  useSaveBotToken,
  useSaveNotifications,
  useTestBot,
  useUnlink,
  type Integrations,
} from './api'
import {
  buildNotifyBody,
  clockOf,
  notifyFormFromPrefs,
  validateNotify,
  type NotifyForm,
} from './integrations'
import { ResultLine } from './ResultLine'

type Telegram = Integrations['telegram']

const KIND_LABELS: Record<string, MessageKey> = {
  budget: 'settings.tgKindBudget',
  cards: 'settings.tgKindCards',
  bills: 'settings.tgKindBills',
  weekly: 'settings.tgKindWeekly',
  monthly: 'settings.tgKindMonthly',
}

/** Settings → Integrations → Telegram bot. The token is write-only: never shown, never logged. */
export function TelegramCard({ telegram }: { telegram: Telegram }) {
  const t = useT()
  return (
    <Panel>
      <h2 className="flex items-center gap-2 text-[17px] font-semibold">
        <Send aria-hidden className="size-5 text-muted-foreground" />
        {t('settings.tgTitle')}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('settings.tgHelp')}</p>
      <BotTokenForm tokenSet={telegram.bot_token_set} />
      <div className="mt-5 border-t pt-4">
        {telegram.enabled ? (
          <LinkSection telegram={telegram} />
        ) : (
          <p className="text-sm text-muted-foreground">{t('settings.tgNotConfigured')}</p>
        )}
      </div>
    </Panel>
  )
}

function BotTokenForm({ tokenSet }: { tokenSet: boolean }) {
  const t = useT()
  const id = useId()
  const [token, setToken] = useState('')
  const save = useSaveBotToken()
  const test = useTestBot()
  const busy = save.isPending || test.isPending
  return (
    <div>
      <FieldLabel htmlFor={id}>{t('settings.tgToken')}</FieldLabel>
      <Input
        id={id}
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={tokenSet ? t('settings.tgTokenSaved') : '123456789:ABC…'}
        value={token}
        onChange={(e) => {
          save.reset()
          test.reset()
          setToken(e.target.value)
        }}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">{t('settings.tgTokenHint')}</p>
      <FieldError>
        {save.error ? errorMessage(save.error) : test.error ? errorMessage(test.error) : null}
      </FieldError>
      {save.data ? (
        <ResultLine
          ok={save.data.webhook_ok}
          message={[save.data.message, save.data.webhook_message].filter(Boolean).join(' ')}
        />
      ) : null}
      {test.data ? <ResultLine ok={test.data.ok} message={test.data.message ?? ''} /> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button
          size="touch"
          disabled={busy}
          onClick={() =>
            save.mutate(token, {
              // The token leaves the form as soon as it is stored.
              onSuccess: () => setToken(''),
            })
          }
        >
          {t('settings.tgSaveToken')}
        </Button>
        <Button size="touch" variant="secondary" disabled={busy} onClick={() => test.mutate(token)}>
          {test.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {t('settings.tgTestToken')}
        </Button>
      </div>
    </div>
  )
}

function LinkSection({ telegram }: { telegram: Telegram }) {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const confirm = useConfirm()
  const code = useLinkCode()
  const unlink = useUnlink()
  const link = telegram.link

  const botLine = telegram.bot_username ? (
    <p className="text-sm">
      {t('settings.tgBot')}{' '}
      <a
        href={`https://t.me/${encodeURIComponent(telegram.bot_username)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline-offset-2 hover:underline"
      >
        @{telegram.bot_username}
      </a>
    </p>
  ) : null

  if (!telegram.linked || !link) {
    const active = telegram.link_code
    const expiresDay = active ? active.expires_at.slice(0, 10) : ''
    const copy = async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        toast.success(t('settings.tgCopied'))
      } catch {
        /* clipboard not allowed: the command is on screen anyway */
      }
    }
    return (
      <div className="space-y-3">
        {botLine}
        <p className="text-sm">
          {t('settings.tgStatus')} <strong>{t('settings.tgNotLinked')}</strong>
        </p>
        {active ? (
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">
              {t('settings.tgCodeExpires', {
                time: clockOf(active.expires_at),
                date: expiresDay === today ? '' : fullDateLabel(expiresDay, lang, today),
              }).trim()}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-card px-3 py-2.5 font-mono text-[15px] font-semibold">
                /link {active.code}
              </code>
              <Button
                variant="outline"
                size="icon-touch"
                aria-label={t('settings.tgCopy')}
                onClick={() => void copy(`/link ${active.code}`)}
              >
                <Copy aria-hidden />
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t('settings.tgSendToBot')}</p>
          </div>
        ) : null}
        <FieldError>{code.error ? errorMessage(code.error) : null}</FieldError>
        <Button
          size="touch"
          className="w-full sm:w-auto"
          onClick={() => code.mutate()}
          disabled={code.isPending}
        >
          <Link2 aria-hidden />
          {active ? t('settings.tgNewCode') : t('settings.tgGenerateCode')}
        </Button>
      </div>
    )
  }

  const removeLink = async () => {
    const ok = await confirm({
      title: t('settings.tgUnlinkTitle'),
      description: t('settings.tgUnlinkText'),
      confirmLabel: t('settings.tgUnlink'),
      destructive: true,
    })
    if (ok) unlink.mutate()
  }

  return (
    <div className="space-y-1">
      {botLine}
      <p className="text-sm">
        {t('settings.tgStatus')} <strong className="text-positive">{t('settings.tgLinked')}</strong>
        {link.telegram_username ? ` (@${link.telegram_username})` : ''}
        {' · '}
        {t('settings.tgSince', {
          date: link.linked_at ? fullDateLabel(link.linked_at.slice(0, 10), lang, today) : '—',
        })}
      </p>
      <DefaultAccountForm current={link.default_account_id} />
      <NotificationsForm telegram={telegram} />
      <FieldError>{unlink.error ? errorMessage(unlink.error) : null}</FieldError>
      <Button
        variant="destructive"
        size="block"
        className="mt-5"
        onClick={removeLink}
        disabled={unlink.isPending}
      >
        <Unlink aria-hidden />
        {t('settings.tgUnlink')}
      </Button>
    </div>
  )
}

function DefaultAccountForm({ current }: { current: number | null }) {
  const t = useT()
  const boot = useBootstrap()
  const labelId = useId()
  const [value, setValue] = useState<number>(current ?? 0)
  const save = useDefaultAccount()
  return (
    <div>
      <FieldLabel id={labelId}>{t('settings.tgDefaultAccount')}</FieldLabel>
      <ChipPicker
        labelledBy={labelId}
        label={t('settings.tgDefaultAccount')}
        value={value}
        onChange={(v) => {
          save.reset()
          setValue(v)
        }}
        className="flex-wrap overflow-visible"
        options={[
          { value: 0, label: t('settings.tgFirstAccount') },
          ...boot.accounts.map((a) => ({ value: a.id, label: a.name })),
        ]}
      />
      <FieldError>{save.error ? errorMessage(save.error) : null}</FieldError>
      <Button
        size="touch"
        variant="secondary"
        className="mt-3 w-full sm:w-auto"
        disabled={save.isPending || value === (current ?? 0)}
        onClick={() => save.mutate(value || null)}
      >
        {t('settings.tgSaveDefault')}
      </Button>
    </div>
  )
}

function NotificationsForm({ telegram }: { telegram: Telegram }) {
  const t = useT()
  const daysId = useId()
  const baseId = useId()
  const [form, setForm] = useState<NotifyForm>(() => notifyFormFromPrefs(telegram.notify_prefs))
  const [problem, setProblem] = useState<string | null>(null)
  const save = useSaveNotifications()
  const submit = () => {
    const issue = validateNotify(form)
    if (issue) {
      setProblem(t(issue))
      return
    }
    save.mutate(buildNotifyBody(form))
  }
  return (
    <div>
      <FieldLabel>{t('settings.tgNotifications')}</FieldLabel>
      <div className="divide-y rounded-xl border">
        {telegram.notify_kinds.map((k) => {
          const id = `${baseId}-${k.kind}`
          return (
            <div key={k.kind} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
              <label htmlFor={id} className="text-[15px]">
                {KIND_LABELS[k.kind] ? t(KIND_LABELS[k.kind]) : k.label}
              </label>
              <Switch
                id={id}
                checked={!!form.kinds[k.kind]}
                onCheckedChange={(on) => {
                  save.reset()
                  setForm((f) => ({ ...f, kinds: { ...f.kinds, [k.kind]: on } }))
                }}
              />
            </div>
          )
        })}
      </div>
      <FieldLabel htmlFor={daysId}>{t('settings.tgCardDays')}</FieldLabel>
      <Input
        id={daysId}
        type="number"
        inputMode="numeric"
        min={1}
        max={14}
        value={form.cardDays}
        onChange={(e) => {
          setProblem(null)
          save.reset()
          setForm((f) => ({ ...f, cardDays: e.target.value }))
        }}
        className="w-24"
      />
      <p className="mt-1.5 text-xs text-muted-foreground">{t('settings.tgNotifyHint')}</p>
      <FieldError>{problem ?? (save.error ? errorMessage(save.error) : null)}</FieldError>
      <Button
        size="touch"
        variant="secondary"
        className="mt-3 w-full sm:w-auto"
        onClick={submit}
        disabled={save.isPending}
      >
        {t('settings.tgSaveNotifications')}
      </Button>
    </div>
  )
}
