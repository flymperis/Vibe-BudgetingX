import { useState } from 'react'

/**
 * State for an edit sheet that is remounted (fresh form) every time it opens
 * and stays mounted while it animates closed.
 *
 *   const sheet = useSheet<Rule | null>()
 *   sheet.show(rule)
 *   {sheet.state && <RuleSheet key={sheet.state.key} open={sheet.state.open}
 *      onOpenChange={sheet.onOpenChange} rule={sheet.state.item} />}
 */
export function useSheet<T>() {
  const [state, setState] = useState<{ key: number; item: T; open: boolean } | null>(null)
  return {
    state,
    show: (item: T) => setState((s) => ({ key: (s?.key ?? 0) + 1, item, open: true })),
    onOpenChange: (open: boolean) => {
      if (!open) setState((s) => (s ? { ...s, open: false } : s))
    },
  }
}
