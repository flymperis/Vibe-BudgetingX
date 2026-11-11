import { describe, expect, it } from 'vitest'
import {
  buildTransferBody,
  sameAccount,
  swapAccounts,
  transferFormFromDefaults,
  validateTransfer,
} from './transferForm'

const defaults = { from_account_id: 1, to_account_id: 2, amount: null, transferred_at: '2026-11-11' }

describe('transferForm', () => {
  it('starts from the server defaults, incl. the pay-card amount', () => {
    expect(transferFormFromDefaults(defaults)).toEqual({
      fromId: 1,
      toId: 2,
      amount: '',
      date: '2026-11-11',
      notes: '',
    })
    expect(transferFormFromDefaults({ ...defaults, amount: 412.5 }).amount).toBe('412.5')
  })

  it('swaps accounts and flags the same account (old live hint)', () => {
    const f = transferFormFromDefaults(defaults)
    expect(swapAccounts(f)).toMatchObject({ fromId: 2, toId: 1 })
    expect(sameAccount({ ...f, toId: 1 })).toBe(true)
    expect(validateTransfer({ ...f, toId: 1, amount: '5' })).toBe('transfers.sameAccount')
  })

  it('validates accounts and a positive amount', () => {
    const f = transferFormFromDefaults(defaults)
    expect(validateTransfer({ ...f, fromId: null })).toBe('transfers.chooseAccounts')
    expect(validateTransfer(f)).toBe('transfers.amountRequired')
    expect(validateTransfer({ ...f, amount: '0' })).toBe('transfers.amountRequired')
    expect(validateTransfer({ ...f, amount: '12.5' })).toBeNull()
  })

  it('maps to the POST body the old form sent', () => {
    const f = { ...transferFormFromDefaults(defaults), amount: '12,5', notes: '  rent #home ' }
    expect(buildTransferBody(f)).toEqual({
      from_account_id: 1,
      to_account_id: 2,
      amount: 12.5,
      transferred_at: '2026-11-11',
      notes: 'rent #home',
    })
  })
})
