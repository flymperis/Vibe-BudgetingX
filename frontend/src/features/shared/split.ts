/**
 * Live preview of a shared bill's split, mirroring the server rules in
 * vbx/core/shared.py (compute_splits / allocate) and the old app.js preview.
 * The server stays the authority: this only drives the form's feedback.
 */

export type SplitMethod = 'equal' | 'exact' | 'percent' | 'shares'
export const SPLIT_METHODS: SplitMethod[] = ['equal', 'exact', 'percent', 'shares']

export function isSplitMethod(value: unknown): value is SplitMethod {
  return typeof value === 'string' && (SPLIT_METHODS as string[]).includes(value)
}

/** "12,5" / "12.50" -> 1250 cents; blank, junk or negative -> 0 (as the old preview). */
export function toCents(raw: string | null | undefined): number {
  const n = parseFloat(String(raw ?? '').replace(',', '.'))
  return Number.isNaN(n) || n < 0 ? 0 : Math.round(n * 100)
}

/** A percentage / share count; blank, junk or negative -> 0. */
export function toWeight(raw: string | null | undefined): number {
  const n = parseFloat(String(raw ?? '').replace(',', '.'))
  return Number.isNaN(n) || n < 0 ? 0 : n
}

/**
 * Split total cents in proportion to weights so the parts add up exactly
 * (largest remainder, earlier entries first on a tie): 1000 three ways ->
 * 334 / 333 / 333. Same as shared.allocate on the server.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return weights.map(() => 0)
  const exact = weights.map((w) => (total * w) / sum)
  const parts = exact.map(Math.floor)
  let left = total - parts.reduce((a, b) => a + b, 0)
  const order = exact.map((x, i) => ({ i, frac: x - parts[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; k < order.length && left > 0; k++, left--) parts[order[k].i] += 1
  return parts
}

export interface SplitRow {
  id: number
  included: boolean
  /** Raw text the user typed (amount, percentage or share count). */
  value: string
}

export type SplitStatus =
  | { kind: 'each'; cents: number }
  | { kind: 'pickOne' }
  | { kind: 'addsUp' }
  | { kind: 'left'; cents: number }
  | { kind: 'tooMuch'; cents: number }
  | { kind: 'percentOk' }
  | { kind: 'percentTotal'; total: number }
  | { kind: 'sharesTotal'; total: number }
  | { kind: 'giveShare' }
  | { kind: 'none' }

export interface SplitResult {
  /** person id -> share in cents (0 when not taking part). */
  shares: Record<number, number>
  /** The split itself is valid (ignoring the bill amount). */
  ok: boolean
  status: SplitStatus
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function evaluateSplit(method: SplitMethod, totalCents: number, rows: SplitRow[]): SplitResult {
  const shares: Record<number, number> = {}
  rows.forEach((r) => (shares[r.id] = 0))

  if (method === 'equal') {
    const included = rows.filter((r) => r.included)
    const parts = allocate(
      totalCents,
      included.map(() => 1),
    )
    included.forEach((r, i) => (shares[r.id] = parts[i]))
    if (!included.length) return { shares, ok: false, status: { kind: 'pickOne' } }
    return {
      shares,
      ok: true,
      status: totalCents > 0 ? { kind: 'each', cents: parts[parts.length - 1] ?? 0 } : { kind: 'none' },
    }
  }

  if (method === 'exact') {
    let assigned = 0
    rows.forEach((r) => {
      const c = toCents(r.value)
      shares[r.id] = c
      assigned += c
    })
    const left = totalCents - assigned
    if (left === 0)
      return { shares, ok: assigned > 0, status: assigned > 0 ? { kind: 'addsUp' } : { kind: 'none' } }
    return {
      shares,
      ok: false,
      status: left > 0 ? { kind: 'left', cents: left } : { kind: 'tooMuch', cents: -left },
    }
  }

  const weights = rows.map((r) => toWeight(r.value))
  const sum = weights.reduce((a, b) => a + b, 0)
  const parts = allocate(totalCents, weights)
  rows.forEach((r, i) => (shares[r.id] = parts[i]))
  if (method === 'percent') {
    const ok = sum > 0 && Math.abs(sum - 100) <= 0.01 + 1e-9
    return { shares, ok, status: ok ? { kind: 'percentOk' } : { kind: 'percentTotal', total: round2(sum) } }
  }
  const ok = sum > 0
  return { shares, ok, status: ok ? { kind: 'sharesTotal', total: round2(sum) } : { kind: 'giveShare' } }
}

/** Values that split the bill evenly for the weighted methods ("Split evenly"). */
export function evenValues(method: SplitMethod, count: number): string[] {
  if (count <= 0) return []
  if (method === 'shares') return Array.from({ length: count }, () => '1')
  if (method === 'percent') {
    // Hundredths of a percent, leftover to the first people, so the total is exactly 100.
    const parts = allocate(
      10000,
      Array.from({ length: count }, () => 1),
    )
    return parts.map((p) => trimNumber(p / 100))
  }
  return Array.from({ length: count }, () => '')
}

/** 12.5 -> "12.5", 33.33 -> "33.33", 10 -> "10". */
export function trimNumber(n: number): string {
  return String(round2(n))
}

/** Cents -> the canonical amount string of the amount inputs ("12.5"). */
export function centsToInput(cents: number): string {
  if (cents <= 0) return ''
  return (cents / 100).toFixed(2).replace(/\.?0+$/, '')
}
