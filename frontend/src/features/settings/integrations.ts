import type { Schema } from '@/api/types'
import type { MessageKey } from '@/i18n'

export type AiSettings = Schema<'AiSettings'>
export type NotifyPrefs = Schema<'NotifyPrefs'>

export interface AiForm {
  enabled: boolean
  provider: string
  baseUrl: string
  model: string
  ocrModel: string
  timeout: string
}

export function aiFormFromSettings(s: AiSettings): AiForm {
  return {
    enabled: s.ai_enabled,
    provider: s.ai_provider || 'ollama',
    baseUrl: s.ai_base_url ?? '',
    model: s.ai_model ?? '',
    ocrModel: s.ai_ocr_model ?? '',
    timeout: String(s.ai_timeout ?? ''),
  }
}

/** Body for PUT /settings/integrations/ai and POST .../ai/test (old form fields). */
export function buildAiBody(f: AiForm): Schema<'AiSettingsIn'> {
  return {
    ai_enabled: f.enabled,
    ai_provider: f.provider,
    ai_base_url: f.baseUrl.trim(),
    ai_model: f.model.trim(),
    ai_ocr_model: f.ocrModel.trim(),
    ai_timeout: f.timeout.trim(),
  }
}

/** Old client check: the timeout field was required, 5..120. */
export function validateAi(f: AiForm): MessageKey | null {
  const s = f.timeout.trim()
  if (!/^\d+$/.test(s) || Number(s) < 5 || Number(s) > 120) return 'settings.errTimeout'
  return null
}

export interface NotifyForm {
  kinds: Record<string, boolean>
  cardDays: string
}

export const NOTIFY_KIND_ORDER = ['budget', 'cards', 'bills', 'weekly', 'monthly'] as const
export type NotifyKindName = (typeof NOTIFY_KIND_ORDER)[number]

export function notifyFormFromPrefs(p: NotifyPrefs): NotifyForm {
  return {
    kinds: { budget: p.budget, cards: p.cards, bills: p.bills, weekly: p.weekly, monthly: p.monthly },
    cardDays: String(p.card_days),
  }
}

export function validateNotify(f: NotifyForm): MessageKey | null {
  const s = f.cardDays.trim()
  if (!/^\d+$/.test(s) || Number(s) < 1 || Number(s) > 14) return 'settings.errCardDays'
  return null
}

/** Body for PUT /settings/telegram/notifications: every kind sent as true/false. */
export function buildNotifyBody(f: NotifyForm): Schema<'NotifyPrefsIn'> {
  return {
    budget: !!f.kinds.budget,
    cards: !!f.kinds.cards,
    bills: !!f.kinds.bills,
    weekly: !!f.kinds.weekly,
    monthly: !!f.kinds.monthly,
    card_days: Number(f.cardDays.trim()),
  }
}

/** "Model list" status line after "Load models" (old setupAiModelLoader texts). */
export function modelsStatus(count: number): { key: MessageKey; n?: number } {
  if (count === 0) return { key: 'settings.aiModelsNone' }
  return count === 1 ? { key: 'settings.aiModelsOne' } : { key: 'settings.aiModelsMany', n: count }
}

/** "2026-11-11T01:15:00" -> "01:15" (server-local time, shown as it is stored). */
export function clockOf(isoDateTime: string): string {
  return isoDateTime.slice(11, 16)
}
