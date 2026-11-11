import { cn } from '@/lib/utils'

/** First letter of a name, upper-cased ("?" for a blank name). */
function initialOf(name: string): string {
  return (name.trim()[0] ?? '?').toLocaleUpperCase()
}

/** Round avatar with a person's initial (people in shared groups, the signed-in user). */
export function Avatar({ name, me = false, className }: { name: string; me?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full text-[15px] font-semibold',
        me ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        className,
      )}
    >
      {initialOf(name)}
    </span>
  )
}
