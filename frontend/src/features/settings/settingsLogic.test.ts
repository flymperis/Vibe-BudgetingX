import { describe, expect, it } from 'vitest'
import type { Account } from '@/api/accounts'
import { translate, type MessageKey, type TParams } from '@/i18n'
import {
  accountFormFromAccount,
  buildAccountBody,
  emptyAccountForm,
  sanitizeBalanceTyping,
  validateAccount,
} from './accountForm'
import { buildImportForm } from './api'
import { categoryUsage } from './categories'
import { splitImportErrors } from './importResult'
import {
  aiFormFromSettings,
  buildAiBody,
  buildNotifyBody,
  clockOf,
  modelsStatus,
  notifyFormFromPrefs,
  validateAi,
  validateNotify,
} from './integrations'

const t = (k: MessageKey, p?: TParams) => translate(k, p, 'en')

const card: Account = {
  id: 4,
  name: 'Alpha Visa',
  account_type: 'credit',
  is_credit_card: true,
  opening_balance: -300,
  opening_balance_input: 300,
  credit_limit: 1000,
  statement_day: 5,
  due_day: 25,
  current_balance: -420.5,
  can_pay: true,
}

describe('accountForm', () => {
  it('a card shows what is owed as a positive amount', () => {
    expect(accountFormFromAccount(card)).toEqual({
      name: 'Alpha Visa',
      type: 'credit',
      opening: '300',
      limit: '1000',
      statementDay: '5',
      dueDay: '25',
    })
  })

  it('sends card fields only for cards', () => {
    const f = { ...emptyAccountForm(), name: ' Eurobank ', opening: '-12,5', limit: '500', statementDay: '3' }
    expect(buildAccountBody(f)).toEqual({
      name: 'Eurobank',
      account_type: 'bank',
      opening_balance: -12.5,
      credit_limit: null,
      statement_day: null,
      due_day: null,
    })
    expect(buildAccountBody({ ...f, type: 'credit', opening: '300', dueDay: '20' })).toEqual({
      name: 'Eurobank',
      account_type: 'credit',
      opening_balance: 300,
      credit_limit: 500,
      statement_day: 3,
      due_day: 20,
    })
    expect(buildAccountBody({ ...f, opening: '' }).opening_balance).toBe(0)
  })

  it('validates like the server', () => {
    const f = { ...emptyAccountForm(), name: 'Card', type: 'credit' as const }
    expect(validateAccount({ ...f, name: ' ' })).toBe('settings.errName')
    expect(validateAccount({ ...f, opening: 'abc' })).toBe('settings.errOpening')
    expect(validateAccount({ ...f, statementDay: '32' })).toBe('settings.errStatementDay')
    expect(validateAccount({ ...f, dueDay: '0' })).toBe('settings.errDueDay')
    expect(validateAccount({ ...f, dueDay: '20' })).toBe('settings.errDueNeedsStatement')
    expect(validateAccount({ ...f, dueDay: '20', statementDay: '1' })).toBeNull()
    // Bank accounts ignore the card fields entirely.
    expect(validateAccount({ ...f, type: 'bank', dueDay: '99' })).toBeNull()
  })

  it('cleans what is typed into balance fields', () => {
    expect(sanitizeBalanceTyping('-1a2.3,4', true)).toBe('-12,34')
    expect(sanitizeBalanceTyping('-12', false)).toBe('12')
  })
})

describe('categories', () => {
  it('describes the counts behind the delete rule', () => {
    expect(categoryUsage(t, 'expense', { entry_count: 0, rule_count: 0 })).toBe('Not used')
    expect(categoryUsage(t, 'expense', { entry_count: 12, rule_count: 1 })).toBe(
      '12 expenses · 1 recurring rule',
    )
    expect(categoryUsage(t, 'income', { entry_count: 1, rule_count: 2 })).toBe(
      '1 income entry · 2 recurring rules',
    )
  })
})

describe('import', () => {
  it('splits the server error list', () => {
    expect(splitImportErrors('Import failed. Row 3: bad date; Row 9: no amount (+4 more)')).toEqual({
      errors: ['Row 3: bad date', 'Row 9: no amount'],
      more: 4,
    })
    expect(splitImportErrors('Import failed. Missing sheets: Expenses')).toEqual({
      errors: ['Missing sheets: Expenses'],
      more: 0,
    })
    expect(splitImportErrors('The uploaded file is empty.')).toBeNull()
  })

  it('builds the old multipart form', () => {
    const file = new File(['x'], 'data.xlsx')
    const fd = buildImportForm({ file, replaceMovements: true, syncOpeningBalances: false })
    expect((fd.get('file') as File).name).toBe('data.xlsx')
    expect(fd.get('replace_movements')).toBe('1')
    expect(fd.has('sync_opening_balances')).toBe(false)
  })
})

describe('integrations', () => {
  const ai = {
    ai_enabled: true,
    ai_provider: 'ollama',
    ai_base_url: 'http://10.0.0.2:11434',
    ai_model: 'qwen3:8b',
    ai_timeout: 30,
    ai_ocr_model: '',
  }
  it('maps the AI form both ways and checks the timeout', () => {
    const f = aiFormFromSettings(ai)
    expect(buildAiBody({ ...f, model: ' qwen3:8b ' })).toEqual({ ...ai, ai_timeout: '30' })
    expect(validateAi(f)).toBeNull()
    expect(validateAi({ ...f, timeout: '4' })).toBe('settings.errTimeout')
    expect(validateAi({ ...f, timeout: '121' })).toBe('settings.errTimeout')
  })

  it('sends every notification kind explicitly', () => {
    const f = notifyFormFromPrefs({
      budget: true,
      cards: false,
      bills: true,
      weekly: false,
      monthly: true,
      card_days: 3,
    })
    expect(buildNotifyBody({ ...f, cardDays: '5' })).toEqual({
      budget: true,
      cards: false,
      bills: true,
      weekly: false,
      monthly: true,
      card_days: 5,
    })
    expect(validateNotify({ ...f, cardDays: '15' })).toBe('settings.errCardDays')
    expect(validateNotify({ ...f, cardDays: '1' })).toBeNull()
  })

  it('model status texts and link-code clock', () => {
    expect(modelsStatus(0).key).toBe('settings.aiModelsNone')
    expect(modelsStatus(3)).toEqual({ key: 'settings.aiModelsMany', n: 3 })
    expect(clockOf('2026-11-11T01:15:00')).toBe('01:15')
  })
})
