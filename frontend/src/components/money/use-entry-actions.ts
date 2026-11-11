import { useCallback, useState } from 'react'
import type { Entry } from './entries'
import type { EntryActionSheetsProps } from './EntryActionSheets'

/**
 *   const actions = useEntryActions()
 *   <TxnRow onOpen={actions.open} ... />
 *   <EntryActionSheets {...actions.sheets} />
 */
export function useEntryActions() {
  const [entry, setEntry] = useState<Entry | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const open = useCallback((e: Entry) => {
    setEntry(e)
    setDetailOpen(true)
  }, [])
  const sheets: EntryActionSheetsProps = { entry, detailOpen, setDetailOpen, editOpen, setEditOpen }
  return { open, sheets }
}
