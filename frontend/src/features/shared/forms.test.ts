import { sampleGroup } from './fixtures'
import { buildBillBody, buildSettlementBody, initialBillState, initialSettleState } from './forms'

describe('bill form mapping', () => {
  it('new bill starts from expense_defaults and the first category/account', () => {
    const s = initialBillState(sampleGroup(), { categoryIds: [5, 6], accountIds: [9] })
    expect(s).toMatchObject({
      paidBy: 1,
      method: 'equal',
      record: true,
      categoryId: 5,
      accountId: 9,
      spentOn: '2026-11-10',
    })
    expect(s.included).toEqual({ 1: true, 2: true, 3: true })
    const body = buildBillBody({ ...s, amount: '30', description: ' Dinner #trip ' }, [1, 2, 3])
    expect(body).toEqual({
      description: 'Dinner #trip',
      amount: '30',
      paid_by: 1,
      split_method: 'equal',
      spent_on: '2026-11-10',
      included: [1, 2, 3],
      values: { '1': '', '2': '', '3': '' },
      record_personal: true,
      category_id: 5,
      account_id: 9,
    })
  })

  it('edit sends the current recording state (also "not recorded")', () => {
    const payload = {
      id: 4,
      description: 'Fuel',
      amount: '40.00',
      spent_on: '2026-11-01',
      paid_by: 2,
      split_method: 'percent',
      included: [1, 2],
      values: { '1': '50', '2': '50' },
      record_personal: false,
      category_id: null,
      account_id: null,
    }
    const s = initialBillState(sampleGroup(), { payload, categoryIds: [5], accountIds: [9] })
    expect(s).toMatchObject({ amount: '40', method: 'percent', paidBy: 2, record: false })
    expect(s.values).toEqual({ 1: '50', 2: '50', 3: '' })
    const body = buildBillBody(s, [1, 2, 3])
    expect(body.record_personal).toBe(false)
    expect(body.category_id).toBeNull()
    expect(body.values).toEqual({ '1': '50', '2': '50', '3': '' })
    expect(body.included).toEqual([1, 2])

    const recorded = initialBillState(sampleGroup(), {
      payload: { ...payload, record_personal: true, category_id: 6, account_id: null },
      categoryIds: [5, 6],
      accountIds: [9],
    })
    expect(buildBillBody(recorded, [1, 2, 3])).toMatchObject({ record_personal: true, category_id: 6 })
  })
})

describe('settle form mapping', () => {
  it('defaults, prefill and recording only when I take part', () => {
    const g = sampleGroup()
    const s = initialSettleState(g, [9])
    expect(s).toMatchObject({ fromId: 1, toId: 2, amount: '', record: true, accountId: 9 })
    const pre = initialSettleState(g, [9], { from_id: 3, to_id: 2, amount: 12.5 })
    expect(pre).toMatchObject({ fromId: 3, toId: 2, amount: '12.5' })
    expect(buildSettlementBody(pre, 1)).toMatchObject({ record_personal: false, account_id: null })
    expect(buildSettlementBody({ ...s, amount: '5', notes: ' cash ' }, 1)).toEqual({
      from_person_id: 1,
      to_person_id: 2,
      amount: '5',
      paid_on: '2026-11-10',
      notes: 'cash',
      record_personal: true,
      account_id: 9,
    })
  })
})
