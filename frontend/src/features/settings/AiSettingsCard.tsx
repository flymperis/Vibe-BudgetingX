import { Bot, Loader2 } from 'lucide-react'
import { useId, useState } from 'react'
import { errorMessage } from '@/app/query-client'
import { Panel } from '@/components/Cards'
import { FieldError, FieldLabel } from '@/components/FormField'
import { ResultLine } from './ResultLine'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import { useLoadModels, useSaveAi, useTestAi } from './api'
import {
  aiFormFromSettings,
  buildAiBody,
  modelsStatus,
  validateAi,
  type AiForm,
  type AiSettings,
} from './integrations'

/** Settings → Integrations → Local AI (Ollama). */
export function AiSettingsCard({ settings }: { settings: AiSettings }) {
  const t = useT()
  const ids = {
    enabled: useId(),
    provider: useId(),
    url: useId(),
    model: useId(),
    ocr: useId(),
    timeout: useId(),
    list: useId(),
  }
  const [form, setForm] = useState<AiForm>(() => aiFormFromSettings(settings))
  const [problem, setProblem] = useState<string | null>(null)
  const [modelsNote, setModelsNote] = useState<{ ok: boolean; text: string } | null>(null)
  const save = useSaveAi()
  const test = useTestAi()
  const load = useLoadModels()
  const [models, setModels] = useState<string[]>([])
  const set = (patch: Partial<AiForm>) => {
    setProblem(null)
    save.reset()
    test.reset()
    setForm((f) => ({ ...f, ...patch }))
  }

  const check = () => {
    const issue = validateAi(form)
    if (issue) setProblem(t(issue))
    return !issue
  }
  const loadModels = () => {
    const url = form.baseUrl.trim()
    if (!url) {
      setModelsNote({ ok: false, text: t('settings.aiNeedUrl') })
      return
    }
    setModelsNote(null)
    load.mutate(url, {
      onSuccess: ({ models: list }) => {
        setModels(list)
        const s = modelsStatus(list.length)
        setModelsNote({ ok: true, text: t(s.key, { n: s.n ?? 0 }) })
        if (list.length === 1 && !form.model.trim()) setForm((f) => ({ ...f, model: list[0] }))
      },
      onError: (e) => setModelsNote({ ok: false, text: errorMessage(e) }),
    })
  }

  const pick = (field: 'model' | 'ocrModel', name: string) => set({ [field]: name } as Partial<AiForm>)

  return (
    <Panel>
      <h2 className="flex items-center gap-2 text-[17px] font-semibold">
        <Bot aria-hidden className="size-5 text-muted-foreground" />
        {t('settings.aiTitle')}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('settings.aiHelp')}</p>

      <div className="mt-4 flex min-h-11 items-center justify-between gap-3">
        <label htmlFor={ids.enabled} className="text-[15px] font-medium">
          {t('settings.aiEnable')}
        </label>
        <Switch id={ids.enabled} checked={form.enabled} onCheckedChange={(enabled) => set({ enabled })} />
      </div>

      <FieldLabel htmlFor={ids.provider}>{t('settings.aiProvider')}</FieldLabel>
      <select
        id={ids.provider}
        value={form.provider}
        onChange={(e) => set({ provider: e.target.value })}
        className="h-11 w-full rounded-xl border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:rounded-lg md:text-sm dark:bg-input/30"
      >
        <option value="ollama">Ollama</option>
      </select>

      <FieldLabel htmlFor={ids.url}>{t('settings.aiBaseUrl')}</FieldLabel>
      <Input
        id={ids.url}
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="http://100.x.x.x:11434"
        value={form.baseUrl}
        onChange={(e) => set({ baseUrl: e.target.value })}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">{t('settings.aiBaseUrlHint')}</p>

      <FieldLabel htmlFor={ids.model}>{t('settings.aiModel')}</FieldLabel>
      <div className="flex gap-2">
        <Input
          id={ids.model}
          list={ids.list}
          autoComplete="off"
          spellCheck={false}
          placeholder="llama3.2"
          value={form.model}
          onChange={(e) => set({ model: e.target.value })}
        />
        <Button
          variant="outline"
          size="touch"
          className="shrink-0 md:h-9"
          onClick={loadModels}
          disabled={load.isPending}
        >
          {load.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {t('settings.aiLoadModels')}
        </Button>
      </div>
      <datalist id={ids.list}>
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {modelsNote ? (
        <p
          role="status"
          className={cn('mt-1.5 text-xs', modelsNote.ok ? 'text-muted-foreground' : 'text-negative')}
        >
          {modelsNote.text}
        </p>
      ) : null}
      {models.length ? (
        <ModelChips
          models={models}
          value={form.model}
          onPick={(m) => pick('model', m)}
          label={t('settings.aiModel')}
        />
      ) : null}

      <FieldLabel htmlFor={ids.ocr}>{t('settings.aiOcrModel')}</FieldLabel>
      <Input
        id={ids.ocr}
        list={ids.list}
        autoComplete="off"
        spellCheck={false}
        placeholder="glm-ocr"
        value={form.ocrModel}
        onChange={(e) => set({ ocrModel: e.target.value })}
      />
      {models.length ? (
        <ModelChips
          models={models}
          value={form.ocrModel}
          onPick={(m) => pick('ocrModel', m)}
          label={t('settings.aiOcrModel')}
        />
      ) : null}
      <p className="mt-1.5 text-xs text-muted-foreground">{t('settings.aiOcrHint')}</p>

      <FieldLabel htmlFor={ids.timeout}>{t('settings.aiTimeout')}</FieldLabel>
      <Input
        id={ids.timeout}
        type="number"
        inputMode="numeric"
        min={5}
        max={120}
        value={form.timeout}
        onChange={(e) => set({ timeout: e.target.value })}
        className="w-28"
      />

      <FieldError>
        {problem ?? (save.error ? errorMessage(save.error) : test.error ? errorMessage(test.error) : null)}
      </FieldError>
      {test.data ? <ResultLine ok={test.data.ok} message={test.data.message ?? ''} /> : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button
          size="touch"
          onClick={() => check() && save.mutate(buildAiBody(form))}
          disabled={save.isPending}
        >
          {t('common.save')}
        </Button>
        <Button
          size="touch"
          variant="secondary"
          onClick={() => check() && test.mutate(buildAiBody(form))}
          disabled={test.isPending}
        >
          {test.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {t('settings.testConnection')}
        </Button>
      </div>
    </Panel>
  )
}

function ModelChips({
  models,
  value,
  onPick,
  label,
}: {
  models: string[]
  value: string
  onPick: (m: string) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="mt-2 flex flex-wrap gap-1.5">
      {models.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          onClick={() => onPick(m)}
          className={cn(
            'inline-flex h-9 items-center rounded-full border px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === m ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
          )}
        >
          {m}
        </button>
      ))}
    </div>
  )
}
