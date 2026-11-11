/**
 * Pure logic of the "Monthly budgets" editor, ported from the old
 * static/app.js setupBudgetTools (live total, Distribute, Copy from another
 * month) and the form's field mapping (docs/parity/B.md).
 */
import { amountToText, parseAmountInput } from '@/lib/amount'
import type { BudgetDefaultsIn, BudgetFormRow, BudgetLine, MonthSnapshot } from './api'

/** One editable row: the amount is the canonical amount string ("" | "12.5"). */
export interface DraftRow {
  id: number
  name: string
  avg: number
  active: boolean
  fixed: boolean
  value: string
}

export function draftFromFormRows(rows: BudgetFormRow[]): DraftRow[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    avg: r.avg,
    active: r.active,
    fixed: r.fixed,
    value: amountToText(r.default),
  }))
}

const toCents = (v: number) => Math.round(v * 100)

/** Blank/invalid fields count as 0, as in the old form. */
function amountOf(text: string): number {
  return parseAmountInput(text) ?? 0
}

/** "Total monthly budget": every category field plus Everything else. */
export function liveTotal(rows: DraftRow[], otherText: string): number {
  const cents = rows.reduce((sum, r) => sum + toCents(amountOf(r.value)), 0) + toCents(amountOf(otherText))
  return cents / 100
}

export type DistributeResult =
  | { ok: false; reason: 'noTotal' | 'nothingToSplit' | 'fixedCover' | 'noHistory' }
  | { ok: false; reason: 'fixedExceed'; fixedTotal: number }
  | {
      ok: true
      rows: DraftRow[]
      fixedCount: number
      fixedTotal: number
      remaining: number
      changed: number
      withoutHistory: number
    }

/**
 * Splits `totalText` across the non-fixed categories by their 3-month
 * average (largest-remainder method in whole cents, so the shares always add
 * up to exactly the amount). Fixed rows keep their amount; rows without
 * history and Everything else are left as they are.
 */
export function distribute(rows: DraftRow[], totalText: string): DistributeResult {
  const raw = parseAmountInput(totalText)
  if (raw === null || raw <= 0) return { ok: false, reason: 'noTotal' }
  const total = Math.round(raw * 100) / 100

  const fixedRows = rows.filter((r) => r.fixed)
  const fixedTotal = fixedRows.reduce((sum, r) => sum + amountOf(r.value), 0)
  const remaining = Math.round((total - fixedTotal) * 100) / 100
  if (remaining < 0) return { ok: false, reason: 'fixedExceed', fixedTotal }

  const eligible = rows.filter((r) => !r.fixed)
  const withHistory = eligible.filter((r) => r.avg > 0)
  const withoutHistory = eligible.length - withHistory.length

  if (remaining === 0) return { ok: false, reason: fixedRows.length ? 'fixedCover' : 'nothingToSplit' }
  if (!withHistory.length) return { ok: false, reason: 'noHistory' }

  const avgSum = withHistory.reduce((sum, r) => sum + r.avg, 0)
  const totalCents = Math.round(remaining * 100)
  const shares = withHistory.map((r) => {
    const rawCents = (r.avg / avgSum) * totalCents
    const floored = Math.floor(rawCents)
    return { id: r.id, cents: floored, fraction: rawCents - floored }
  })
  const leftover = totalCents - shares.reduce((sum, s) => sum + s.cents, 0)
  shares
    .slice()
    .sort((a, b) => b.fraction - a.fraction)
    .slice(0, leftover)
    .forEach((s) => {
      s.cents += 1
    })
  const byId = new Map(shares.map((s) => [s.id, s.cents]))
  const next = rows.map((r) => {
    const cents = byId.get(r.id)
    return cents === undefined ? r : { ...r, value: amountToText(cents / 100) }
  })
  return {
    ok: true,
    rows: next,
    fixedCount: fixedRows.length,
    fixedTotal,
    remaining,
    changed: shares.length,
    withoutHistory,
  }
}

export type CopyPreviewItem =
  | { id: number; name: string; kind: 'fixed'; amount: number }
  | { id: number; name: string; kind: 'amount'; amount: number }
  | { id: number; name: string; kind: 'unchanged'; amount: number }

/** What "Copy from another month" would do, and the total after the prefill. */
export function copyPreview(
  rows: DraftRow[],
  snapshot: MonthSnapshot,
  otherText: string,
): { items: CopyPreviewItem[]; total: number } {
  let cents = 0
  const items = rows.map<CopyPreviewItem>((r) => {
    const current = amountOf(r.value)
    if (r.fixed) {
      cents += toCents(current)
      return { id: r.id, name: r.name, kind: 'fixed', amount: current }
    }
    const snap = snapshot.amounts[String(r.id)]
    if (snap !== undefined && Number.isFinite(snap)) {
      cents += toCents(snap)
      return { id: r.id, name: r.name, kind: 'amount', amount: snap }
    }
    cents += toCents(current)
    return { id: r.id, name: r.name, kind: 'unchanged', amount: current }
  })
  cents += toCents(amountOf(otherText))
  return { items, total: cents / 100 }
}

/** Prefills the non-fixed rows that the snapshot has an amount for. */
export function applySnapshot(rows: DraftRow[], snapshot: MonthSnapshot): DraftRow[] {
  return rows.map((r) => {
    if (r.fixed) return r
    const snap = snapshot.amounts[String(r.id)]
    if (snap === undefined || !Number.isFinite(snap)) return r
    return { ...r, value: amountToText(snap) }
  })
}

/**
 * The old form posted every row (amount_<id>, fixed_<id> when checked) and
 * other_amount: every category is in `amounts`, unchecked rows lose the flag.
 */
export function defaultsPayload(rows: DraftRow[], otherText: string): BudgetDefaultsIn {
  const amounts: BudgetDefaultsIn['amounts'] = {}
  const fixed: BudgetDefaultsIn['fixed'] = {}
  for (const r of rows) {
    amounts[String(r.id)] = r.value
    if (r.fixed) fixed[String(r.id)] = true
  }
  return { amounts, fixed, other_amount: otherText }
}

/**
 * Payload that changes one category's default only (the category sheet). The
 * fixed flag is sent too, since a category in `amounts` without it loses it.
 */
export function singleDefaultPayload(id: number, value: string, isFixed: boolean): BudgetDefaultsIn {
  return { amounts: { [String(id)]: value }, fixed: isFixed ? { [String(id)]: true } : {} }
}

/** The old row text: an over-budget row shows how much over (positive), else what is left. */
export function remainingOf(line: Pick<BudgetLine, 'remaining' | 'status'>): {
  word: 'left' | 'over'
  amount: number
} {
  return line.status === 'over'
    ? { word: 'over', amount: -line.remaining }
    : { word: 'left', amount: line.remaining }
}

/** Amount for a bar's width; the API's pct, clamped like the old template. */
export function clampPct(pct: number): number {
  return Math.max(0, Math.min(100, pct))
}
