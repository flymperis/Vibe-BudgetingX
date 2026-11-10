import { Link } from 'react-router'
import { splitTags, tagHref } from '@/lib/tags'
import { cn } from '@/lib/utils'

export interface TagTextProps {
  text: string | null | undefined
  /** Render tags as plain coloured text (inside another link/button, where nested links are invalid). */
  asText?: boolean
  className?: string
}

/** Notes with every #tag shown as a link to its report. */
export function TagText({ text, asText = false, className }: TagTextProps) {
  const parts = splitTags(text)
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <span key={i}>{part.text}</span>
        ) : asText ? (
          <span key={i} className="font-medium text-primary dark:text-primary">
            #{part.tag}
          </span>
        ) : (
          <Link
            key={i}
            to={tagHref(part.tag)}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'rounded-sm font-medium text-primary underline-offset-2 hover:underline',
              'focus-visible:outline-2 focus-visible:outline-ring',
            )}
          >
            #{part.tag}
          </Link>
        ),
      )}
    </span>
  )
}
