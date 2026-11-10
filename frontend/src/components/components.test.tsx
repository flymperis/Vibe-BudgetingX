import { act, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { AmountDisplay, AmountKeypad } from '@/components/Amount'
import { ChipPicker } from '@/components/ChipPicker'
import { ProgressBar } from '@/components/ProgressBar'
import { TagText } from '@/components/TagText'
import { getLang, setLang, useT } from '@/i18n'
import { el } from '@/i18n/el'
import { en } from '@/i18n/en'
import { renderWithProviders } from '@/test/render'

function Chips() {
  const [v, setV] = useState('b')
  return (
    <ChipPicker
      label="Λογαριασμός"
      value={v}
      onChange={setV}
      options={[
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Revolut' },
        { value: 'c', label: 'Μετρητά' },
      ]}
    />
  )
}

function Keypad() {
  const [v, setV] = useState('')
  return (
    <>
      <AmountDisplay value={v} />
      <AmountKeypad value={v} onChange={setV} />
    </>
  )
}

describe('ChipPicker', () => {
  it('is a radio group with click and arrow-key selection', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Chips />)
    expect(screen.getByRole('radiogroup', { name: 'Λογαριασμός' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Revolut' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('radio', { name: 'Alpha' }))
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Revolut' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Revolut' })).toHaveFocus()
  })
})

describe('AmountKeypad', () => {
  it('types an amount shown with a decimal comma', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Keypad />)
    for (const k of ['1', '2']) await user.click(screen.getByRole('button', { name: k }))
    await user.click(screen.getByRole('button', { name: 'Υποδιαστολή' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    expect(screen.getByRole('status')).toHaveTextContent('12,5€')
    await user.click(screen.getByRole('button', { name: 'Σβήσιμο' }))
    expect(screen.getByRole('status')).toHaveTextContent('12,€')
  })
})

describe('TagText', () => {
  it('links tags to the tag report and keeps the rest as text', () => {
    renderWithProviders(<TagText text="Σινεμά #Νοέμβρης με #3 φίλους" />)
    const link = screen.getByRole('link', { name: '#Νοέμβρης' })
    expect(link).toHaveAttribute('href', `/reports/tags?tag=${encodeURIComponent('Νοέμβρης')}`)
    expect(screen.getByText(/με #3 φίλους/)).toBeInTheDocument()
  })
})

describe('ProgressBar', () => {
  it('exposes the status without relying on colour', () => {
    renderWithProviders(<ProgressBar value={85} max={100} label="Καφές" />)
    const bar = screen.getByRole('progressbar', { name: 'Καφές' })
    expect(bar).toHaveAttribute('data-status', 'warn')
    expect(bar).toHaveAttribute('aria-valuetext', '85% · Κοντά στο όριο')
  })
})

describe('i18n', () => {
  it('has the same keys in both languages, none empty', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(el).sort())
    for (const v of [...Object.values(el), ...Object.values(en)]) expect(v.trim()).not.toBe('')
  })

  it('switches language, persists it and interpolates', () => {
    const { result } = renderHook(() => useT())
    expect(result.current('nav.home')).toBe('Αρχική')
    act(() => setLang('en'))
    expect(result.current('nav.home')).toBe('Home')
    expect(result.current('auth.hello', { name: 'Fotis' })).toBe('Hi, Fotis')
    expect(localStorage.getItem('vbx.lang')).toBe('en')
    act(() => setLang('el'))
    expect(getLang()).toBe('el')
  })
})
