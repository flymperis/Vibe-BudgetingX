/**
 * Investments data layer.
 *
 * Price-call gating (docs/parity/D.md): the screen asks for live prices
 * (`live=true`, the default) once each time it is opened. It never refetches
 * by itself (no focus/reconnect/interval refetch, data never goes stale), and
 * switching between the crypto and stocks tabs reuses the same data. Forced
 * lookups (`refresh_crypto` / `refresh_stocks`) only come from the "Refresh
 * prices" buttons.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { createKeys, qk } from '@/api/keys'
import type { Schema } from '@/api/types'
import { translate } from '@/i18n'

export type Investments = Schema<'InvestmentsOut'>
export type CryptoPortfolio = Schema<'CryptoPortfolio'>
export type StockPortfolio = Schema<'StockPortfolio'>
export type CryptoHolding = Schema<'CryptoHolding'>
export type StockHolding = Schema<'StockHolding'>
export type CryptoTx = Schema<'CryptoTxOut'>
export type StockTx = Schema<'StockTxOut'>
export type CryptoTxIn = Schema<'CryptoTxIn'>
export type StockTxIn = Schema<'StockTxIn'>
export type CryptoSearchItem = Schema<'CryptoSearchItem'>
export type StockSearchItem = Schema<'StockSearchItem'>

export type AssetKind = 'crypto' | 'stocks'

export const investmentKeys = createKeys('investments')
export const investmentScreenKey = investmentKeys.custom('screen')

export const fetchInvestments = (
  params: { live?: boolean; refresh_crypto?: boolean; refresh_stocks?: boolean } = {},
) => api.get<Investments>('/investments', { params: { live: true, ...params } })

/**
 * The investments payload. `onOpen` is set by the screen's layout only: it
 * makes the live lookup run every time the screen is opened. Tab pages read
 * the same cached data without triggering another lookup.
 */
export function useInvestments({ onOpen = false }: { onOpen?: boolean } = {}) {
  return useQuery({
    queryKey: investmentScreenKey,
    queryFn: () => fetchInvestments(),
    staleTime: Infinity,
    refetchOnMount: onOpen ? 'always' : false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  })
}

/** The "Refresh prices" button of one asset class (forced lookup, bypasses the 5-minute cache). */
export function useRefreshPrices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (kind: AssetKind) =>
      fetchInvestments(kind === 'crypto' ? { refresh_crypto: true } : { refresh_stocks: true }),
    onSuccess: async (data) => {
      await qc.cancelQueries({ queryKey: investmentScreenKey })
      // The response IS the fresh server state of this query (not an optimistic guess).
      qc.setQueryData(investmentScreenKey, data)
      toast.success(translate('investments.pricesRefreshed'))
    },
  })
}

/**
 * After a transaction is saved or deleted. Investments are not money
 * movements: this screen, the reports (portfolio charts) and home change.
 *
 * The screen is updated at once from `live=false` (holdings and history from
 * the database, prices from the server's in-process cache, never the network),
 * then the live lookup the old redirect did runs in the background. Waiting
 * for the live lookup (CoinGecko / Yahoo, seconds when uncached or rate
 * limited) before showing the new row made the list lag behind the save; it
 * was the cause of the rare e2e timeout after "add".
 */
export async function invalidateInvestments(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['reports'] }),
    qc.invalidateQueries({ queryKey: qk.home }),
  ])
  try {
    await qc.cancelQueries({ queryKey: investmentScreenKey })
    qc.setQueryData(investmentScreenKey, await fetchInvestments({ live: false }))
  } catch {
    /* the live refetch below still runs */
  }
  return qc.invalidateQueries({ queryKey: investmentKeys.all })
}

type SaveArgs =
  { kind: 'crypto'; id?: number; body: CryptoTxIn } | { kind: 'stocks'; id?: number; body: StockTxIn }

export function useSaveTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, id, body }: SaveArgs) =>
      id === undefined
        ? api.post<Schema<'CryptoTxSaved'> | Schema<'StockTxSaved'>>(`/investments/${kind}`, body)
        : api.put<Schema<'CryptoTxSaved'> | Schema<'StockTxSaved'>>(`/investments/${kind}/${id}`, body),
    meta: { toastErrors: false },
    onSuccess: (_data, { id }) => {
      void invalidateInvestments(qc)
      toast.success(translate(id === undefined ? 'investments.txAdded' : 'common.saved'))
    },
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, id }: { kind: AssetKind; id: number }) =>
      api.delete<Schema<'OkOut'>>(`/investments/${kind}/${id}`),
    onSuccess: () => {
      void invalidateInvestments(qc)
      toast.success(translate('common.deleted'))
    },
  })
}

export const SEARCH_RULES = {
  // Old app.js: crypto searched from 2 characters after 300 ms, stocks from 1 after 350 ms.
  crypto: { minLength: 2, delay: 300 },
  stocks: { minLength: 1, delay: 350 },
} as const

export const fetchCryptoSearch = (q: string) =>
  api.get<CryptoSearchItem[]>('/investments/crypto/search', { params: { q } })
export const fetchStockSearch = (q: string) =>
  api.get<StockSearchItem[]>('/investments/stocks/search', { params: { q } })

/** Search-as-you-type results; `q` is the already debounced text. Failures stay quiet, as before. */
export function useSymbolSearch(kind: AssetKind, q: string) {
  const query = q.trim()
  return useQuery<CryptoSearchItem[] | StockSearchItem[]>({
    queryKey: investmentKeys.custom('search', kind, query),
    queryFn: () => (kind === 'crypto' ? fetchCryptoSearch(query) : fetchStockSearch(query)),
    enabled: query.length >= SEARCH_RULES[kind].minLength,
    staleTime: 5 * 60_000,
    retry: false,
    meta: { toastErrors: false },
  })
}
