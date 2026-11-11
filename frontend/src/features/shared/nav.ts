import { useCallback } from 'react'
import { useLocation, useNavigate, type To } from 'react-router'

/** Old-style `?group=<id>` (and links from the old app's `panel=shared&group=`). */
export const GROUP_PARAM = 'group'

export const SHARED_PATH = '/shared'
export const groupPath = (groupId: number) => `${SHARED_PATH}/groups/${groupId}`

/** The search string without `?group` (other params, e.g. the month, are kept). */
export function withoutGroup(search: string): string {
  const params = new URLSearchParams(search)
  params.delete(GROUP_PARAM)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** `?group=<id>` as a positive integer, else null. */
export function groupFromSearch(search: string): number | null {
  const id = Number(new URLSearchParams(search).get(GROUP_PARAM))
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Links between the overview (/shared) and a group (/shared/groups/:groupId). */
export function useGroupNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const search = withoutGroup(location.search)
  const groupTo = useCallback((groupId: number): To => ({ pathname: groupPath(groupId), search }), [search])
  const overviewTo: To = { pathname: SHARED_PATH, search }
  const openGroup = useCallback((groupId: number) => navigate(groupTo(groupId)), [navigate, groupTo])
  /** After leaving / deleting: back to the overview without a dead entry to return to. */
  const leaveToOverview = useCallback(
    () => navigate({ pathname: SHARED_PATH, search }, { replace: true }),
    [navigate, search],
  )
  return { groupTo, overviewTo, openGroup, leaveToOverview }
}
