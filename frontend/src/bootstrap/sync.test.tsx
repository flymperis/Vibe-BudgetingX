import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { qk } from '@/api/keys'
import { postedRecurringMessage, useBootstrapSync } from './sync'

const toastSuccess = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { success: toastSuccess } }))

function Probe({ posted, at }: { posted: number; at: number }) {
  useBootstrapSync({ posted_recurring: posted }, at)
  return null
}

function setup(qc: QueryClient, posted: number, at: number) {
  return render(
    <QueryClientProvider client={qc}>
      <Probe posted={posted} at={at} />
    </QueryClientProvider>,
  )
}

beforeEach(() => toastSuccess.mockReset())
afterEach(() => vi.useRealTimers())

describe('bootstrap sync (recurring posting)', () => {
  it('words the toast like the old flash', () => {
    expect(postedRecurringMessage(1)).toBe('Καταχωρήθηκε 1 επαναλαμβανόμενη κίνηση.')
    expect(postedRecurringMessage(3)).toBe('Καταχωρήθηκαν 3 επαναλαμβανόμενες κινήσεις.')
  })

  it('toasts and refreshes money queries once per response that posted', () => {
    const qc = new QueryClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const view = setup(qc, 2, 100)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey))
    expect(keys).toContain('["home"]')
    expect(keys).toContain('["expenses"]')
    expect(keys).not.toContain('["bootstrap"]')
    // same response re-rendered: nothing new
    view.rerender(
      <QueryClientProvider client={qc}>
        <Probe posted={2} at={100} />
      </QueryClientProvider>,
    )
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when nothing was posted', () => {
    const qc = new QueryClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    setup(qc, 0, 100)
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
  })

  it('refetches bootstrap when the app becomes visible and when the day changes', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 10, 23, 59, 30) })
    const qc = new QueryClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    setup(qc, 0, 100)
    const bootstrapCalls = () =>
      spy.mock.calls.filter((c) => JSON.stringify(c[0]?.queryKey) === JSON.stringify(qk.bootstrap)).length

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(bootstrapCalls()).toBe(1)

    act(() => {
      vi.advanceTimersByTime(60_000) // past midnight
    })
    expect(bootstrapCalls()).toBe(2)
    act(() => {
      vi.advanceTimersByTime(60_000) // same day: nothing
    })
    expect(bootstrapCalls()).toBe(2)
  })
})
