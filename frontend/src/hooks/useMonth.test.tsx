import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { addMonths, currentMonth } from '@/lib/dates'
import { renderWithProviders } from '@/test/render'
import { monthFromSearch, useMonth } from './useMonth'

function Probe() {
  const { month, prev, next } = useMonth()
  const location = useLocation()
  return (
    <>
      <span data-testid="month">{month}</span>
      <span data-testid="search">{location.search}</span>
      <button onClick={prev}>prev</button>
      <button onClick={next}>next</button>
    </>
  )
}

describe('useMonth', () => {
  it('reads ?month and falls back to the current month', () => {
    const now = new Date(2026, 10, 10)
    expect(monthFromSearch(new URLSearchParams('month=2025-02'), now)).toBe('2025-02')
    expect(monthFromSearch(new URLSearchParams('month=junk'), now)).toBe('2026-11')
    expect(monthFromSearch(new URLSearchParams(''), now)).toBe('2026-11')
  })

  it('moves between months and keeps the current month out of the URL', async () => {
    const user = userEvent.setup()
    const start = addMonths(currentMonth(), -2)
    renderWithProviders(<Probe />, { path: `/expenses?month=${start}&q=x` })
    expect(screen.getByTestId('month')).toHaveTextContent(start)
    await user.click(screen.getByText('next'))
    expect(screen.getByTestId('search')).toHaveTextContent(`month=${addMonths(start, 1)}`)
    expect(screen.getByTestId('search')).toHaveTextContent('q=x')
    await user.click(screen.getByText('next'))
    expect(screen.getByTestId('month')).toHaveTextContent(currentMonth())
    expect(screen.getByTestId('search')).not.toHaveTextContent('month=')
  })
})
