import { useParams } from 'react-router'
import NotFoundPage from '@/features/NotFoundPage'
import { GroupDetailScreen } from './GroupDetail'

/** /shared/groups/:groupId: one group (a pushed history entry, so Back returns to the overview). */
export default function SharedGroupPage() {
  const { groupId: raw } = useParams()
  const groupId = Number(raw)
  if (!Number.isInteger(groupId) || groupId <= 0) return <NotFoundPage />
  return <GroupDetailScreen key={groupId} groupId={groupId} />
}
