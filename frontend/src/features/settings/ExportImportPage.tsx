import { CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { isApiError } from '@/api/client'
import { errorMessage } from '@/app/query-client'
import { Panel } from '@/components/Cards'
import { useConfirm } from '@/components/confirm'
import { FieldError } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/i18n'
import { useImportExcel } from './api'
import { splitImportErrors } from './importResult'

const XLSX_ACCEPT = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** /settings/export: Excel export, migration template and import (old Export + Migration sections). */
export default function ExportImportPage() {
  const t = useT()
  return (
    <>
      <PageHeader title={t('settings.exportImport')} backTo="/settings" />
      <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
        <Panel className="space-y-3">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold">
            <Download aria-hidden className="size-5 text-muted-foreground" />
            {t('settings.exportTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('settings.exportHelp')}</p>
          <Button asChild size="block" variant="secondary">
            {/* A normal link: the browser downloads the attachment with the session cookie. */}
            <a href="/api/export/excel" download>
              <FileSpreadsheet aria-hidden />
              {t('settings.exportDownload')}
            </a>
          </Button>
        </Panel>

        <Panel className="space-y-3">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold">
            <FileSpreadsheet aria-hidden className="size-5 text-muted-foreground" />
            {t('settings.migrationTitle')}
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t('settings.migrationHelp1')}</li>
            <li>{t('settings.migrationHelp2')}</li>
            <li>{t('settings.migrationHelp3')}</li>
            <li>{t('settings.migrationHelp4')}</li>
          </ul>
          <Button asChild size="block" variant="secondary">
            <a href="/api/export/migration-template" download>
              <Download aria-hidden />
              {t('settings.templateDownload')}
            </a>
          </Button>
        </Panel>
      </div>
      <ImportPanel />
    </>
  )
}

function ImportPanel() {
  const t = useT()
  const confirm = useConfirm()
  const imp = useImportExcel()
  const fileRef = useRef<HTMLInputElement>(null)
  const ids = { file: useId(), replace: useId(), sync: useId() }
  const [file, setFile] = useState<File | null>(null)
  const [replaceMovements, setReplace] = useState(false)
  const [syncOpeningBalances, setSync] = useState(false)
  const [missingFile, setMissingFile] = useState(false)

  const run = async () => {
    if (!file) {
      setMissingFile(true)
      return
    }
    const destructive = replaceMovements || syncOpeningBalances
    const ok = await confirm({
      title: t('settings.importConfirmTitle', { name: file.name }),
      description: (
        <span className="block space-y-2">
          {replaceMovements ? (
            <span className="block font-medium text-negative">{t('settings.importWarnReplace')}</span>
          ) : null}
          {syncOpeningBalances ? (
            <span className="block font-medium text-negative">{t('settings.importWarnSync')}</span>
          ) : null}
          <span className="block">
            {destructive ? t('settings.importBackupHint') : t('settings.importMergeText')}
          </span>
        </span>
      ),
      confirmLabel: t('settings.importRun'),
      destructive,
    })
    if (ok) imp.mutate({ file, replaceMovements, syncOpeningBalances })
  }

  const failure = imp.error && isApiError(imp.error) ? splitImportErrors(imp.error.detail) : null
  return (
    <Panel className="mt-4 space-y-4">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold">
        <Upload aria-hidden className="size-5 text-muted-foreground" />
        {t('settings.importTitle')}
      </h2>

      <div>
        <input
          ref={fileRef}
          id={ids.file}
          type="file"
          accept={XLSX_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setMissingFile(false)
            imp.reset()
          }}
        />
        {file ? (
          <div className="flex min-h-14 items-center gap-3 rounded-xl border bg-muted/40 px-3">
            <FileSpreadsheet aria-hidden className="size-5 shrink-0 text-positive" />
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{file.name}</span>
            <Button
              variant="ghost"
              size="icon-touch"
              aria-label={t('settings.importClearFile')}
              onClick={() => {
                setFile(null)
                imp.reset()
                if (fileRef.current) fileRef.current.value = ''
              }}
            >
              <X aria-hidden />
            </Button>
          </div>
        ) : (
          <label
            htmlFor={ids.file}
            className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-4 text-center transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/50"
          >
            <span className="text-[15px] font-medium text-primary">{t('settings.importChoose')}</span>
            <span className="text-xs text-muted-foreground">{t('settings.importFileHint')}</span>
          </label>
        )}
        {missingFile ? <FieldError>{t('settings.importNoFile')}</FieldError> : null}
      </div>

      <div className="flex items-start justify-between gap-3">
        <label htmlFor={ids.replace} className="min-w-0">
          <span className="block text-[15px] font-medium">{t('settings.importReplace')}</span>
          <span className="block text-xs text-muted-foreground">{t('settings.importReplaceHint')}</span>
        </label>
        <Switch id={ids.replace} checked={replaceMovements} onCheckedChange={setReplace} className="mt-1" />
      </div>
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={ids.sync} className="min-w-0">
          <span className="block text-[15px] font-medium">{t('settings.importSync')}</span>
          <span className="block text-xs text-muted-foreground">{t('settings.importSyncHint')}</span>
        </label>
        <Switch id={ids.sync} checked={syncOpeningBalances} onCheckedChange={setSync} className="mt-1" />
      </div>

      <Button size="block" onClick={run} disabled={imp.isPending}>
        <Upload aria-hidden />
        {imp.isPending ? t('settings.importRunning') : t('settings.importRun')}
      </Button>

      {imp.isSuccess ? (
        <div role="status" className="flex gap-2 rounded-xl bg-positive/10 p-3 text-sm">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-positive" />
          <span>{imp.data.message}</span>
        </div>
      ) : null}
      {imp.error ? (
        failure ? (
          <div role="alert" className="rounded-xl bg-negative/10 p-3 text-sm">
            <p className="font-semibold text-negative">{t('settings.importFailed')}</p>
            <p className="mt-1 text-muted-foreground">{t('settings.importNothingChanged')}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {failure.errors.map((e, i) => (
                <li key={i} className="break-words">
                  {e}
                </li>
              ))}
            </ul>
            {failure.more ? (
              <p className="mt-2 text-muted-foreground">{t('settings.importMore', { n: failure.more })}</p>
            ) : null}
          </div>
        ) : (
          <FieldError>{errorMessage(imp.error)}</FieldError>
        )
      ) : null}
    </Panel>
  )
}
