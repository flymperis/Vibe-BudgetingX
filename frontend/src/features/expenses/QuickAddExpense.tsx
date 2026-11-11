/**
 * The quick-add sheet behind the "+" button (mounted by the AppShell): a new
 * expense or income entry, with the Expense / Income switch of the old Home
 * sheets. Open it with useQuickAdd().open({ kind }).
 */
import { useQuickAddRequest } from '@/app/quick-add'
import { EntrySheet } from '@/components/money/EntrySheet'

export default function QuickAddExpense({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const request = useQuickAddRequest()
  return (
    <EntrySheet
      open={open}
      onOpenChange={onOpenChange}
      kind={request.kind}
      requestId={request.id}
      allowKindSwitch
    />
  )
}
