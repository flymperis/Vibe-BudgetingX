/**
 * Expenses and income: one data layer for both lists, the quick-add sheet and
 * the edit/delete sheets (they are used by the home, expenses and income
 * features and by the "+" sheet, so they live here instead of a feature folder).
 */
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { api } from '@/api/client'
import { createKeys, invalidateMoney } from '@/api/keys'
import type { Schema } from '@/api/types'

export type EntryKind = 'expense' | 'income'
export type ExpenseOut = Schema<'ExpenseOut'>
export type IncomeOut = Schema<'IncomeOut'>
export type ExpenseIn = Schema<'vbx__api__schemas__expenses__ExpenseIn'>
export type IncomeIn = Schema<'IncomeIn'>
type ListOut = Schema<'ExpenseListOut'> | Schema<'IncomeListOut'>

/** Expense or income entry in one shape (amount signed as stored). */
export interface Entry {
  kind: EntryKind
  id: number
  amount: number
  date: string
  notes: string
  category_id: number
  category_name: string
  account_id: number
  account_name: string
}

export function toEntry(kind: EntryKind, raw: ExpenseOut | IncomeOut): Entry {
  const date = kind === 'expense' ? (raw as ExpenseOut).spent_at : (raw as IncomeOut).received_at
  return {
    kind,
    id: raw.id,
    amount: raw.amount,
    date: (date ?? '').slice(0, 10),
    notes: raw.notes ?? '',
    category_id: raw.category_id,
    category_name: raw.category_name,
    account_id: raw.account_id,
    account_name: raw.account_name,
  }
}

export const expenseKeys = createKeys('expenses')
export const incomeKeys = createKeys('income')
export const entryKeys = (kind: EntryKind) => (kind === 'expense' ? expenseKeys : incomeKeys)
const PATH: Record<EntryKind, string> = { expense: '/expenses', income: '/income' }

export interface EntryFilters {
  /** YYYY-MM, or null for all months. */
  month: string | null
  /** Category id, or null for all categories. */
  categoryId: number | null
}

export interface EntryPage {
  items: Entry[]
  page: number
  pages: number
  total: number
  page_size: number
  month: string | null
  category_id: number | null
}

export function fetchEntryPage(kind: EntryKind, filters: EntryFilters, page: number): Promise<EntryPage> {
  return api
    .get<ListOut>(PATH[kind], {
      params: { month: filters.month, category_id: filters.categoryId, page },
    })
    .then((out) => ({ ...out, items: out.items.map((r) => toEntry(kind, r)) }))
}

/** The list with "load more" (pages of LIST_PAGE_SIZE, newest first). */
export function useEntryList(kind: EntryKind, filters: EntryFilters) {
  return useInfiniteQuery({
    queryKey: entryKeys(kind).list({ month: filters.month, category: filters.categoryId }),
    queryFn: ({ pageParam }) => fetchEntryPage(kind, filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  })
}

/** All loaded rows, without the duplicates a shifted page can bring. */
export function flattenPages(data: InfiniteData<EntryPage> | undefined): Entry[] {
  const seen = new Set<number>()
  const out: Entry[] = []
  for (const page of data?.pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
    }
  }
  return out
}

/** Rows grouped by day, in list order. */
export function groupByDay(entries: Entry[]): { day: string; entries: Entry[] }[] {
  const groups: { day: string; entries: Entry[] }[] = []
  for (const e of entries) {
    const last = groups[groups.length - 1]
    if (last && last.day === e.date) last.entries.push(e)
    else groups.push({ day: e.date, entries: [e] })
  }
  return groups
}

export interface SaveEntryVars {
  kind: EntryKind
  id?: number
  body: ExpenseIn | IncomeIn
}

export function saveEntry({ kind, id, body }: SaveEntryVars): Promise<Entry> {
  const req =
    id === undefined
      ? api.post<ExpenseOut | IncomeOut>(PATH[kind], body)
      : api.put<ExpenseOut | IncomeOut>(`${PATH[kind]}/${id}`, body)
  return req.then((raw) => toEntry(kind, raw))
}

/** Create or update; the form shows the server's `detail` itself. */
export function useSaveEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: saveEntry,
    meta: { toastErrors: false },
    onSuccess: () => void invalidateMoney(qc),
  })
}

export function useDeleteEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, id }: { kind: EntryKind; id: number }) => api.delete(`${PATH[kind]}/${id}`),
    onSuccess: () => void invalidateMoney(qc),
  })
}
