/** Chart colours as CSS variables, so every theme and dark mode apply without a re-render. */
export const CHART = {
  income: 'var(--positive)',
  spending: 'var(--negative)',
  net: 'var(--primary)',
  line: 'var(--primary)',
  grid: 'var(--border)',
  axis: 'var(--muted-foreground)',
  baseline: 'var(--muted-foreground)',
  cursor: 'var(--muted)',
  surface: 'var(--card)',
} as const

export const AXIS_TICK = { fill: CHART.axis, fontSize: 11 } as const

/** "2026-03" for month number 3 of 2026 (used with monthShortName / monthName). */
export const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`
