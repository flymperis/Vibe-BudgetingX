import { useSearchParams } from 'react-router'
import { GroupDetailScreen } from './GroupDetail'
import { SharedOverviewScreen } from './SharedOverview'

/**
 * /shared shows the overview; /shared?group=<id> one group. The group lives in
 * the URL (a pushed history entry) so it can be linked and Back returns to the
 * overview. A real /shared/groups/:id route is a foundation request.
 */
export default function SharedPage() {
  const [params] = useSearchParams()
  const groupId = Number(params.get('group'))
  if (Number.isInteger(groupId) && groupId > 0) return <GroupDetailScreen key={groupId} groupId={groupId} />
  return <SharedOverviewScreen />
}
