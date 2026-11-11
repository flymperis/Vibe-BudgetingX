const FAILED_PREFIX = 'Import failed.'

export interface ImportFailure {
  /** The first errors the server listed (at most 8). */
  errors: string[]
  /** How many more the server left out ("(+N more)"). */
  more: number
}

/**
 * The server answers a failed import with one `detail` string:
 * "Import failed. <e1>; <e2>; ... (+N more)". Split it into a list to show.
 * Other messages (bad file, empty file) return null and are shown as they are.
 */
export function splitImportErrors(detail: string): ImportFailure | null {
  if (!detail.startsWith(FAILED_PREFIX)) return null
  let rest = detail.slice(FAILED_PREFIX.length).trim()
  let more = 0
  const m = /\s*\(\+(\d+) more\)$/.exec(rest)
  if (m) {
    more = Number(m[1])
    rest = rest.slice(0, m.index)
  }
  const errors = rest
    .split('; ')
    .map((s) => s.trim())
    .filter(Boolean)
  return { errors, more }
}
