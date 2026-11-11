import { act, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { installSheetHistory, useBackToClose } from './useBackToClose'

function Sheet() {
  const [open, setOpen] = useState(false)
  useBackToClose(open, () => setOpen(false))
  return (
    <>
      <span data-testid="state">{open ? 'open' : 'closed'}</span>
      <button onClick={() => setOpen(true)}>open</button>
      <button onClick={() => setOpen(false)}>close</button>
    </>
  )
}

const tick = () => act(() => new Promise((r) => setTimeout(r, 5)))

describe('useBackToClose', () => {
  beforeAll(() => installSheetHistory())

  it('Back closes the open sheet; closing it otherwise removes its history entry', async () => {
    const routerSaw: unknown[] = []
    const routerListener = (e: PopStateEvent) => routerSaw.push(e.state)
    window.addEventListener('popstate', routerListener) // registered after ours, like the router's
    render(<Sheet />)
    const start = window.history.length

    act(() => screen.getByText('open').click())
    await tick()
    expect(window.history.length).toBe(start + 1)
    expect(window.history.state?.vbxSheet).toBeTruthy()

    act(() => window.history.back())
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('closed'))
    expect(window.history.state?.vbxSheet).toBeUndefined()

    // Open again and close with the button: the entry is popped again.
    act(() => screen.getByText('open').click())
    await tick()
    expect(window.history.state?.vbxSheet).toBeTruthy()
    act(() => screen.getByText('close').click())
    await waitFor(() => expect(window.history.state?.vbxSheet).toBeUndefined())
    await tick()
    // The router never saw these same-page pops.
    expect(routerSaw).toEqual([])
    window.removeEventListener('popstate', routerListener)
  })
})
