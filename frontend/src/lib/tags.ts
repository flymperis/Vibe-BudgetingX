/**
 * #hashtags in notes. Port of the old app's tags.py:
 *
 *   TAG_RE = re.compile(r"(?<![\w&#/])#(\w[\w-]{0,49})")
 *
 * Python's Unicode \w is str.isalnum() (categories L* and N*) plus "_", so
 * here it is [\p{L}\p{N}_]. A tag needs at least one letter; trailing "-" is
 * not part of a found tag. Tags compare case- and accent-insensitively.
 */

const W = String.raw`\p{L}\p{N}_`
/** Fresh global regex each call (global regexes are stateful). */
export const tagRegex = () => new RegExp(String.raw`(?<![${W}&#/])#([${W}][${W}-]{0,49})`, 'gu')

const hasLetter = (s: string) => /\p{L}/u.test(s)

/** Comparison key: no "#", lower case, accents removed (Διακοπές -> διακοπες). */
export function tagKey(tag: string): string {
  return (tag ?? '')
    .replace(/^#+/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
}

/** Tags in the text, without "#", first spelling of each, in order. */
export function findTags(text: string | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of (text ?? '').matchAll(tagRegex())) {
    const tag = m[1].replace(/-+$/, '')
    const k = tagKey(tag)
    if (hasLetter(tag) && !seen.has(k)) {
      seen.add(k)
      out.push(tag)
    }
  }
  return out
}

export type TagPart = { type: 'text'; text: string } | { type: 'tag'; tag: string }

/** Splits notes into text and tag parts (old `linkify`, without the HTML). */
export function splitTags(text: string | null | undefined): TagPart[] {
  const source = text ?? ''
  const parts: TagPart[] = []
  let pos = 0
  for (const m of source.matchAll(tagRegex())) {
    if (!hasLetter(m[1])) continue
    const start = m.index ?? 0
    if (start > pos) parts.push({ type: 'text', text: source.slice(pos, start) })
    parts.push({ type: 'tag', tag: m[1] })
    pos = start + m[0].length
  }
  if (pos < source.length) parts.push({ type: 'text', text: source.slice(pos) })
  return parts
}

/** Route of a tag's report (old: /?panel=reports&reports_section=tags&tag=...). */
export function tagHref(tag: string): string {
  return `/reports/tags?tag=${encodeURIComponent(tag)}`
}
