import { useCallback } from 'react'
import { useLocation, useNavigate, type To } from 'react-router'

export const GROUP_PARAM = 'group'

/** Search string with ?group set (or removed), other params (month…) kept. */
export function withGroup(search: string, groupId: number | null): string {
  const params = new URLSearchParams(search)
  if (groupId === null) params.delete(GROUP_PARAM)
  else params.set(GROUP_PARAM, String(groupId))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** Links between the overview and a group, inside /shared. */
export function useGroupNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const groupTo = useCallback(
    (groupId: number): To => ({ pathname: location.pathname, search: withGroup(location.search, groupId) }),
    [location.pathname, location.search],
  )
  const overviewTo: To = { pathname: location.pathname, search: withGroup(location.search, null) }
  const openGroup = useCallback((groupId: number) => navigate(groupTo(groupId)), [navigate, groupTo])
  /** After leaving / deleting: back to the overview without a dead entry to return to. */
  const leaveToOverview = useCallback(
    () =>
      navigate({ pathname: location.pathname, search: withGroup(location.search, null) }, { replace: true }),
    [navigate, location.pathname, location.search],
  )
  return { groupTo, overviewTo, openGroup, leaveToOverview }
}
