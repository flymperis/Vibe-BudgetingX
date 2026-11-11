import { useEffect, useRef } from 'react'

/**
 * The browser / Android back button closes an open sheet instead of leaving
 * the screen (native-app behaviour).
 *
 *  - Opening a sheet pushes a history entry for the same URL, marked with an id.
 *  - Back pops it: the sheet closes. The popstate event is swallowed before
 *    React Router sees it (installSheetHistory registers its listener before
 *    the router's), so the router does not "navigate" to the same page again
 *    (no loader re-run, no scroll restoration, no cancelled navigation).
 *  - Closing the sheet any other way (button, Escape, drag, save) goes back
 *    over its entry, again unseen by the router. When the same click also
 *    navigated somewhere (e.g. "create group" opens the new group) the
 *    router's entry is already on top and nothing is undone.
 */

interface OpenSheet {
  marker: string
  close: () => void
}

const stack: OpenSheet[] = []
let ownBacks = 0
let counter = 0
let installed = false

/** Call once before the router is created (src/app/App.tsx). */
export function installSheetHistory() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('popstate', (event) => {
    if (ownBacks > 0) {
      // Our own history.back() after a sheet closed: invisible to the router.
      ownBacks--
      event.stopImmediatePropagation()
      return
    }
    const top = stack[stack.length - 1]
    if (top && window.history.state?.vbxSheet !== top.marker) {
      event.stopImmediatePropagation()
      stack.pop()
      top.close()
    }
  })
}

function openEntry(close: () => void): () => void {
  const marker = `vbx-sheet-${++counter}`
  window.history.pushState({ ...window.history.state, vbxSheet: marker }, '')
  stack.push({ marker, close })
  return () => {
    const i = stack.findIndex((s) => s.marker === marker)
    if (i === -1) return // closed by Back: its entry is already gone
    stack.splice(i, 1)
    if (installed && window.history.state?.vbxSheet === marker) {
      ownBacks++
      window.history.back()
    }
  }
}

export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })
  useEffect(() => {
    if (!open || !installed) return
    let release: (() => void) | undefined
    // Deferred a tick: React's dev double-invoked effects must not leave an entry behind.
    const timer = window.setTimeout(() => {
      release = openEntry(() => closeRef.current())
    }, 0)
    return () => {
      window.clearTimeout(timer)
      // At once: a delayed back() could abort a navigation the user starts right after.
      // A router navigation started by the same click either pushed already (then the
      // marker is no longer on top and nothing is undone) or pushes after this back.
      release?.()
    }
  }, [open])
}
