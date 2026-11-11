/**
 * Tag chips under a notes field, ported from the old static/app.js
 * (tag_suggestions): a recent-tag chip toggles its tag in the notes; typing
 * "#" plus some letters offers matching tags (from every tag the user has)
 * that complete the word being typed.
 */
import { tagKey } from '@/lib/tags'

/** Old SUGGEST_LIMIT. */
export const SUGGEST_LIMIT = 6

/** Folded tags present in the text (old `tagsIn`). */
export function tagsIn(value: string): Set<string> {
  return new Set((value.match(/#[\p{L}\p{N}_-]+/gu) ?? []).map(tagKey))
}

/** Removes every "#tag" word matching `tag` (old `removeTag`). */
export function removeTag(value: string, tag: string): string {
  const wanted = tagKey(tag)
  return value
    .split(/(\s+)/)
    .filter((part) => !(part.startsWith('#') && tagKey(part.replace(/[.,;:!?)]+$/, '')) === wanted))
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** Adds the tag at the end, or removes it when it is already there. */
export function toggleTag(value: string, tag: string): string {
  if (tagsIn(value).has(tagKey(tag))) return removeTag(value, tag)
  return `${value.trim()} #${tag}`.trim()
}

export interface TypedTag {
  text: string
  start: number
  end: number
}

/** The "#abc" being typed just before the caret, if any (old `typedTag`). */
export function typedTag(value: string, caret: number = value.length): TypedTag | null {
  const m = value.slice(0, caret).match(/(^|\s)#([\p{L}\p{N}_-]+)$/u)
  return m ? { text: m[2], end: caret, start: caret - m[2].length - 1 } : null
}

/** Tags completing the word being typed (old `refresh`). */
export function tagSuggestions(
  value: string,
  caret: number,
  allTags: readonly string[],
  limit: number = SUGGEST_LIMIT,
): string[] {
  const typed = typedTag(value, caret)
  if (!typed) return []
  const present = tagsIn(value)
  const prefix = tagKey(typed.text)
  return allTags
    .filter((tag) => {
      const key = tagKey(tag)
      return key.startsWith(prefix) && key !== prefix && !present.has(key)
    })
    .slice(0, limit)
}

/** Replaces the word being typed with "#tag " and returns the new caret. */
export function completeTag(value: string, caret: number, tag: string): { value: string; caret: number } {
  const typed = typedTag(value, caret)
  if (!typed) {
    const next = `${value.trim()} #${tag}`.trim()
    return { value: next, caret: next.length }
  }
  const next = `${value.slice(0, typed.start)}#${tag} ${value.slice(typed.end).replace(/^\s+/, '')}`
  return { value: next, caret: typed.start + tag.length + 2 }
}
