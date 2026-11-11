/**
 * Reports data layer: one query per section (`/api/reports/<section>`).
 * Reports are "money domains": every money mutation invalidates ['reports'].
 * Overview and investments value the portfolios on the server (5-minute price
 * cache); spending and tags never touch prices.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { createKeys } from '@/api/keys'
import type { Schema } from '@/api/types'

export type Overview = Schema<'OverviewOut'>
export type Spending = Schema<'SpendingOut'>
export type TagsReport = Schema<'TagsOut'>
export type ReportInvestments = Schema<'ReportInvestmentsOut'>
export type BalanceChartData = Schema<'BalanceChart'>
export type CashFlowChartData = Schema<'CashFlowChart'>
export type CashFlowMonth = Schema<'CashFlowMonth'>

export const reportKeys = createKeys('reports')

export function useOverview(year: number, account: number | null) {
  return useQuery({
    queryKey: reportKeys.custom('overview', { year, account }),
    queryFn: () =>
      api.get<Overview>('/reports/overview', { params: { year, account: account ?? 'all' } }),
    placeholderData: keepPreviousData,
  })
}

export function useSpending(year: number) {
  return useQuery({
    queryKey: reportKeys.custom('spending', { year }),
    queryFn: () => api.get<Spending>('/reports/spending', { params: { year } }),
    placeholderData: keepPreviousData,
  })
}

export function useTagsReport(tag: string | null) {
  return useQuery({
    queryKey: reportKeys.custom('tags', { tag }),
    queryFn: () => api.get<TagsReport>('/reports/tags', { params: { tag } }),
  })
}

export function useReportInvestments(year: number) {
  return useQuery({
    queryKey: reportKeys.custom('investments', { year }),
    queryFn: () => api.get<ReportInvestments>('/reports/investments', { params: { year } }),
    placeholderData: keepPreviousData,
  })
}
