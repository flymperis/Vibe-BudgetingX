import { Navigate, useLocation } from 'react-router'
import { groupFromSearch, groupPath, withoutGroup } from './nav'
import { SharedOverviewScreen } from './SharedOverview'

/**
 * /shared: the overview. Old links `/shared?group=<id>` (and the old app's
 * `?panel=shared&group=<id>`) are redirected to /shared/groups/<id>.
 */
export default function SharedPage() {
  const location = useLocation()
  const groupId = groupFromSearch(location.search)
  if (groupId !== null)
    return <Navigate replace to={{ pathname: groupPath(groupId), search: withoutGroup(location.search) }} />
  return <SharedOverviewScreen />
}
