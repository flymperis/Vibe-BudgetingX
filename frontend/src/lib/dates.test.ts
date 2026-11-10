import {
  addDays,
  addMonths,
  currentMonth,
  daysAgo,
  fullDateLabel,
  isValidMonth,
  monthLabel,
  monthShortName,
  parseISODate,
  relativeDayLabel,
  todayISO,
} from './dates'

const TODAY = '2026-11-10' // a Tuesday

describe('dates', () => {
  it('formats today in local time', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(todayISO(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31')
  })

  it('parses ISO days as local dates', () => {
    const d = parseISODate('2026-03-29 10:00:00')!
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 29])
    expect(parseISODate('2026-02-31')).toBeNull()
    expect(parseISODate('nope')).toBeNull()
  })

  it('counts days across DST changes', () => {
    expect(daysAgo('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysAgo('2026-10-24', '2026-10-26')).toBe(2)
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('labels days relatively in Greek', () => {
    expect(relativeDayLabel(TODAY, 'el', TODAY)).toBe('Σήμερα')
    expect(relativeDayLabel('2026-11-09', 'el', TODAY)).toBe('Χθες')
    expect(relativeDayLabel('2026-11-07', 'el', TODAY)).toBe('Σάββατο')
    expect(relativeDayLabel('2026-11-01', 'el', TODAY)).toBe('1 Νοεμβρίου')
    expect(relativeDayLabel('2025-12-24', 'el', TODAY)).toBe('24 Δεκεμβρίου 2025')
  })

  it('labels days relatively in English', () => {
    expect(relativeDayLabel(TODAY, 'en', TODAY)).toBe('Today')
    expect(relativeDayLabel('2026-11-09', 'en', TODAY)).toBe('Yesterday')
    expect(relativeDayLabel('2026-11-05', 'en', TODAY)).toBe('Thursday')
    expect(fullDateLabel('2026-11-01', 'en', TODAY)).toBe('1 November')
    expect(relativeDayLabel('2026-11-12', 'en', TODAY)).toBe('12 November')
  })

  it('handles months', () => {
    expect(isValidMonth('2026-11')).toBe(true)
    expect(isValidMonth('2026-13')).toBe(false)
    expect(isValidMonth('2026-1')).toBe(false)
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-05', 14)).toBe('2027-07')
    expect(currentMonth(new Date(2026, 10, 10))).toBe('2026-11')
  })

  it('labels months in both languages', () => {
    expect(monthLabel('2026-11', 'el')).toBe('Νοέμβριος 2026')
    expect(monthLabel('2026-11', 'en')).toBe('November 2026')
    expect(monthShortName('2026-11', 'en')).toBe('Nov')
    expect(monthShortName('2026-11', 'el')).toMatch(/^Νοε/)
  })
})
