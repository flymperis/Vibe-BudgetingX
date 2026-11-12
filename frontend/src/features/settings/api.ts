import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { createKeys, invalidateDomains, invalidateMoney, qk } from '@/api/keys'
import type { Schema } from '@/api/types'
import type { Account } from '@/api/accounts'
import { translate } from '@/i18n'

export const settingsKeys = createKeys('settings')
export const categoryKeys = createKeys('categories')

// ---- accounts ------------------------------------------------------------------

export type AccountIn = Schema<'AccountIn'>

export function useSaveAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number | null; body: AccountIn }) =>
      id === null ? api.post<Account>('/accounts', body) : api.put<Account>(`/accounts/${id}`, body),
    meta: { toastErrors: false },
    onSuccess: (_d, vars) => {
      // Opening balances move every balance; names show up everywhere.
      void invalidateMoney(qc)
      void invalidateDomains(qc, settingsKeys.all)
      toast.success(translate(vars.id === null ? 'settings.accountAdded' : 'common.saved'))
    },
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<Schema<'OkOut'>>(`/accounts/${id}`),
    meta: { toastErrors: false },
    onSuccess: () => {
      void invalidateMoney(qc)
      void invalidateDomains(qc, settingsKeys.all)
      toast.success(translate('common.deleted'))
    },
  })
}

// ---- categories ----------------------------------------------------------------

export type CategoryKind = 'expense' | 'income'
export type Category = Schema<'CategoryOut'>
const categoryPath = (kind: CategoryKind) => (kind === 'expense' ? '/categories' : '/income-categories')

export function useCategories(kind: CategoryKind) {
  return useQuery({
    queryKey: categoryKeys.list({ kind }),
    queryFn: () => api.get<Schema<'CategoryListOut'>>(categoryPath(kind)),
  })
}

function invalidateCategories(qc: ReturnType<typeof useQueryClient>) {
  // Names appear in bootstrap (pickers) and in every list/report.
  return invalidateDomains(
    qc,
    categoryKeys.all,
    qk.bootstrap,
    ['expenses'],
    ['income'],
    ['recurring'],
    ['budget'],
    ['reports'],
    ['summary'],
    ['yearly'],
    ['home'],
  )
}

export function useSaveCategory(kind: CategoryKind) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: number | null; name: string }) =>
      id === null
        ? api.post<Category>(categoryPath(kind), { name })
        : api.put<Category>(`${categoryPath(kind)}/${id}`, { name }),
    meta: { toastErrors: false },
    onSuccess: (_d, vars) => {
      void invalidateCategories(qc)
      toast.success(translate(vars.id === null ? 'settings.categoryAdded' : 'common.saved'))
    },
  })
}

export function useDeleteCategory(kind: CategoryKind) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete<Schema<'OkOut'>>(`${categoryPath(kind)}/${id}`),
    meta: { toastErrors: false },
    onSuccess: () => {
      void invalidateCategories(qc)
      toast.success(translate('common.deleted'))
    },
  })
}

// ---- integrations ----------------------------------------------------------------

export type Integrations = Schema<'IntegrationsOut'>
export type AiSettingsIn = Schema<'AiSettingsIn'>
export type OkResult = Schema<'OkOut'>

export function useIntegrations() {
  return useQuery({
    queryKey: settingsKeys.custom('integrations'),
    queryFn: () => api.get<Integrations>('/settings/integrations'),
  })
}

function useIntegrationMutation<TVars, TOut>(
  fn: (vars: TVars) => Promise<TOut>,
  successMessage?: (out: TOut) => string | null | undefined,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    meta: { toastErrors: false },
    onSuccess: (out) => {
      void qc.invalidateQueries({ queryKey: settingsKeys.custom('integrations') })
      const msg = successMessage?.(out)
      if (msg) toast.success(msg)
    },
  })
}

export const useSaveAi = () =>
  useIntegrationMutation(
    (body: AiSettingsIn) => api.put<Schema<'AiSettingsSaved'>>('/settings/integrations/ai', body),
    () => translate('common.saved'),
  )

/** Tests the typed settings; nothing is saved. Result `{ok, message}` is shown inline. */
export function useTestAi() {
  return useMutation({
    mutationFn: (body: AiSettingsIn) => api.post<OkResult>('/settings/integrations/ai/test', body),
    meta: { toastErrors: false },
  })
}

export type WhisperSettingsIn = Schema<'WhisperSettingsIn'>

export const useSaveWhisper = () =>
  useIntegrationMutation(
    (body: WhisperSettingsIn) =>
      api.put<Schema<'WhisperSettingsSaved'>>('/settings/integrations/whisper', body),
    () => translate('common.saved'),
  )

/** Tests the typed Whisper settings (server up, model downloaded); nothing is saved. */
export function useTestWhisper() {
  return useMutation({
    mutationFn: (body: WhisperSettingsIn) => api.post<OkResult>('/settings/integrations/whisper/test', body),
    meta: { toastErrors: false },
  })
}

/** "Load models": GET models for the typed base URL. */
export function useLoadModels() {
  return useMutation({
    mutationFn: (baseUrl: string) =>
      api.get<Schema<'ModelsOut'>>('/settings/integrations/ai/models', { params: { base_url: baseUrl } }),
    meta: { toastErrors: false },
  })
}

export const useSaveBotToken = () =>
  useIntegrationMutation(
    (botToken: string) =>
      api.put<Schema<'TelegramServerSaved'>>('/settings/telegram/server', { bot_token: botToken }),
    () => translate('common.saved'),
  )

export function useTestBot() {
  return useMutation({
    mutationFn: (botToken: string) => api.post<OkResult>('/settings/telegram/test', { bot_token: botToken }),
    meta: { toastErrors: false },
  })
}

export const useLinkCode = () =>
  useIntegrationMutation(() => api.post<Schema<'LinkCodeOut'>>('/settings/telegram/link-code'))

export const useUnlink = () =>
  useIntegrationMutation(
    () => api.post<OkResult>('/settings/telegram/unlink'),
    () => translate('settings.tgUnlinked'),
  )

export const useDefaultAccount = () =>
  useIntegrationMutation(
    (accountId: number | null) =>
      api.put<OkResult>('/settings/telegram/default-account', { default_account_id: accountId }),
    () => translate('common.saved'),
  )

export const useSaveNotifications = () =>
  useIntegrationMutation(
    (body: Schema<'NotifyPrefsIn'>) =>
      api.put<Schema<'NotifyPrefsSaved'>>('/settings/telegram/notifications', body),
    () => translate('common.saved'),
  )

// ---- import --------------------------------------------------------------------

export interface ImportVars {
  file: File
  replaceMovements: boolean
  syncOpeningBalances: boolean
}

/** Same multipart form as the old import (`file`, `replace_movements=1`, `sync_opening_balances=1`). */
export function buildImportForm({ file, replaceMovements, syncOpeningBalances }: ImportVars): FormData {
  const fd = new FormData()
  fd.append('file', file, file.name)
  if (replaceMovements) fd.append('replace_movements', '1')
  if (syncOpeningBalances) fd.append('sync_opening_balances', '1')
  return fd
}

export function useImportExcel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: ImportVars) => api.post<OkResult>('/import/excel', buildImportForm(vars)),
    meta: { toastErrors: false },
    onSuccess: () => {
      // Anything may have changed: refresh every screen.
      void qc.invalidateQueries()
      toast.success(translate('settings.importDone'))
    },
  })
}
