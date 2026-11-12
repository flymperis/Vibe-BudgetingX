import { Loader2, Mic } from 'lucide-react'
import { useId, useState } from 'react'
import { errorMessage } from '@/app/query-client'
import { Panel } from '@/components/Cards'
import { FieldError, FieldLabel } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/i18n'
import { useSaveWhisper, useTestWhisper } from './api'
import {
  buildWhisperBody,
  validateWhisper,
  whisperFormFromSettings,
  type WhisperForm,
  type WhisperSettings,
} from './integrations'
import { ResultLine } from './ResultLine'

/** Settings → Integrations → Voice messages (Whisper) for the Telegram bot. */
export function VoiceSettingsCard({ settings }: { settings: WhisperSettings }) {
  const t = useT()
  const ids = { enabled: useId(), url: useId(), model: useId(), language: useId() }
  const [form, setForm] = useState<WhisperForm>(() => whisperFormFromSettings(settings))
  const [problem, setProblem] = useState<string | null>(null)
  const save = useSaveWhisper()
  const test = useTestWhisper()
  const set = (patch: Partial<WhisperForm>) => {
    setProblem(null)
    save.reset()
    test.reset()
    setForm((f) => ({ ...f, ...patch }))
  }
  const check = () => {
    const issue = validateWhisper(form)
    if (issue) setProblem(t(issue))
    return !issue
  }

  return (
    <Panel>
      <h2 className="flex items-center gap-2 text-[17px] font-semibold">
        <Mic aria-hidden className="size-5 text-muted-foreground" />
        {t('settings.whisperTitle')}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('settings.whisperHelp')}</p>

      <div className="mt-4 flex min-h-11 items-center justify-between gap-3">
        <label htmlFor={ids.enabled} className="text-[15px] font-medium">
          {t('settings.whisperEnable')}
        </label>
        <Switch id={ids.enabled} checked={form.enabled} onCheckedChange={(enabled) => set({ enabled })} />
      </div>

      <FieldLabel htmlFor={ids.url}>{t('settings.whisperUrl')}</FieldLabel>
      <Input
        id={ids.url}
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="http://bazzite-server:8000"
        value={form.url}
        onChange={(e) => set({ url: e.target.value })}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">{t('settings.whisperUrlHint')}</p>

      <FieldLabel htmlFor={ids.model}>{t('settings.whisperModel')}</FieldLabel>
      <Input
        id={ids.model}
        autoComplete="off"
        spellCheck={false}
        placeholder={settings.default_model}
        value={form.model}
        onChange={(e) => set({ model: e.target.value })}
      />
      <p className="mt-1.5 text-xs [overflow-wrap:anywhere] text-muted-foreground">
        {t('settings.whisperModelHint', { model: settings.default_model })}
      </p>

      <FieldLabel htmlFor={ids.language}>{t('settings.whisperLanguage')}</FieldLabel>
      <Input
        id={ids.language}
        autoComplete="off"
        spellCheck={false}
        placeholder="el"
        value={form.language}
        onChange={(e) => set({ language: e.target.value })}
        className="w-28"
      />
      <p className="mt-1.5 text-xs text-muted-foreground">{t('settings.whisperLanguageHint')}</p>

      <FieldError>
        {problem ?? (save.error ? errorMessage(save.error) : test.error ? errorMessage(test.error) : null)}
      </FieldError>
      {test.data ? <ResultLine ok={test.data.ok} message={test.data.message ?? ''} /> : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button
          size="touch"
          onClick={() => check() && save.mutate(buildWhisperBody(form))}
          disabled={save.isPending}
        >
          {t('common.save')}
        </Button>
        <Button
          size="touch"
          variant="secondary"
          onClick={() => check() && test.mutate(buildWhisperBody(form))}
          disabled={test.isPending}
        >
          {test.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {t('settings.testConnection')}
        </Button>
      </div>
    </Panel>
  )
}
