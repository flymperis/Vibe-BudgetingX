import {
  addDays,
  addMonths,
  currentMonth,
  daysAgo,
  fullDateLabel,
  isValidMonth,
  monthLabel,
  monthLabelGenitive,
  monthName,
  monthNameGenitive,
  monthNameOf,
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

  it('names Greek months in the nominative for headings and the genitive for sentences', () => {
    expect(monthName('2026-03', 'el')).toBe('Μάρτιος')
    expect(monthName('2026-05', 'el')).toBe('Μάιος')
    expect(monthNameGenitive('2026-03', 'el')).toBe('Μαρτίου')
    expect(monthNameGenitive('2026-05', 'el')).toBe('Μαΐου')
    expect(monthLabel('2026-08', 'el')).toBe('Αύγουστος 2026')
    expect(monthLabelGenitive('2026-08', 'el')).toBe('Αυγούστου 2026')
    expect(monthNameOf(1, 'el')).toBe('Ιανουάριος')
    expect(monthNameOf(12, 'el', 'genitive')).toBe('Δεκεμβρίου')
    // Every month, both forms, are distinct and capitalised.
    const nom = Array.from({ length: 12 }, (_, i) => monthNameOf(i + 1, 'el'))
    const gen = Array.from({ length: 12 }, (_, i) => monthNameOf(i + 1, 'el', 'genitive'))
    expect(new Set([...nom, ...gen]).size).toBe(24)
    expect(nom.every((n) => /^[Α-Ω]/.test(n))).toBe(true)
  })

  it('has one form in English and rejects bad input', () => {
    expect(monthName('2026-03', 'en')).toBe('March')
    expect(monthNameGenitive('2026-03', 'en')).toBe('March')
    expect(monthLabelGenitive('2026-03', 'en')).toBe('March 2026')
    expect(monthNameOf(13, 'el')).toBe('13')
    expect(monthName('nope', 'el')).toBe('nope')
  })
})
