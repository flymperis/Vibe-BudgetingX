import { useLayoutEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { useT } from '@/i18n'
import { tagKey } from '@/lib/tags'
import { cn } from '@/lib/utils'
import { completeTag, tagSuggestions, tagsIn, toggleTag } from './tag-edit'

export interface NotesFieldProps {
  id: string
  value: string
  onChange: (value: string) => void
  /** One-tap chips (bootstrap.recent_tags). */
  recentTags: readonly string[]
  /** Every tag, for "#" completion (bootstrap.tag_names). */
  allTags: readonly string[]
}

/**
 * Notes input with tag chips under it (old `tag_suggestions` + app.js):
 * recent tags toggle in the notes; typing "#ab" swaps them for matching tags
 * that complete the word.
 */
export function NotesField({ id, value, onChange, recentTags, allTags }: NotesFieldProps) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [caret, setCaret] = useState(value.length)
  const pendingCaret = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !inputRef.current) return
    const pos = pendingCaret.current
    pendingCaret.current = null
    inputRef.current.focus()
    inputRef.current.setSelectionRange(pos, pos)
  })

  const completions = tagSuggestions(value, Math.min(caret, value.length), allTags)
  const present = tagsIn(value)
  const trackCaret = (el: HTMLInputElement) => setCaret(el.selectionStart ?? el.value.length)

  const chipClass =
    'inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div>
      <Input
        ref={inputRef}
        id={id}
        value={value}
        autoComplete="off"
        enterKeyHint="done"
        placeholder={t('money.notesPlaceholder')}
        onChange={(e) => {
          onChange(e.target.value)
          trackCaret(e.target)
        }}
        onSelect={(e) => trackCaret(e.currentTarget)}
        onKeyUp={(e) => trackCaret(e.currentTarget)}
        className="h-11 rounded-xl md:h-10"
      />
      {completions.length ? (
        <div
          role="group"
          aria-label={t('money.tagSuggestions')}
          className="mt-2 no-scrollbar flex gap-2 overflow-x-auto py-0.5"
        >
          {completions.map((tag) => (
            <button
              key={tag}
              type="button"
              data-vaul-no-drag
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const next = completeTag(value, Math.min(caret, value.length), tag)
                pendingCaret.current = next.caret
                setCaret(next.caret)
                onChange(next.value)
              }}
              className={cn(chipClass, 'border-dashed border-primary/60 bg-card text-primary hover:bg-muted')}
            >
              #{tag}
            </button>
          ))}
        </div>
      ) : recentTags.length ? (
        <div
          role="group"
          aria-label={t('money.tags')}
          className="mt-2 no-scrollbar flex gap-2 overflow-x-auto py-0.5"
        >
          {recentTags.map((tag) => {
            const on = present.has(tagKey(tag))
            return (
              <button
                key={tag}
                type="button"
                data-vaul-no-drag
                aria-pressed={on}
                onClick={() => {
                  const next = toggleTag(value, tag)
                  setCaret(next.length)
                  onChange(next)
                }}
                className={cn(
                  chipClass,
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-primary hover:bg-muted',
                )}
              >
                #{tag}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
