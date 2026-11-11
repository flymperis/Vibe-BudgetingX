import { act, renderHook } from '@testing-library/react'
import { requestQuickAdd, useQuickAddRequest } from './quick-add'

describe('quick-add requests', () => {
  it('defaults to expense, takes income, ignores click events', () => {
    const { result } = renderHook(() => useQuickAddRequest())
    const start = result.current.id
    act(() => requestQuickAdd({ kind: 'income' }))
    expect(result.current).toEqual({ id: start + 1, kind: 'income' })
    act(() => requestQuickAdd(new MouseEvent('click')))
    expect(result.current).toEqual({ id: start + 2, kind: 'expense' })
    act(() => requestQuickAdd())
    expect(result.current.kind).toBe('expense')
  })
})
