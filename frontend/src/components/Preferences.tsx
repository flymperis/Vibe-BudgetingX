import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { LANGS, setLang, useLang, useT, type Lang } from '@/i18n'
import { cn } from '@/lib/utils'
import { THEMES, THEME_SWATCH, useTheme, type ModePreference } from '@/theme/theme'

const segment =
  'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Ελληνικά | English */
export function LanguageSwitch({ className }: { className?: string }) {
  const t = useT()
  const lang = useLang()
  return (
    <div
      role="radiogroup"
      aria-label={t('settings.language')}
      className={cn('inline-flex rounded-full border bg-card p-0.5', className)}
    >
      {LANGS.map((l: Lang) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lang === l}
          lang={l}
          onClick={() => setLang(l)}
          className={cn(segment, lang === l ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
        >
          {t(`language.${l}`)}
        </button>
      ))}
    </div>
  )
}

/** Colour swatches for the five themes. */
export function ThemeSwatches({ className }: { className?: string }) {
  const t = useT()
  const { theme, setTheme } = useTheme()
  return (
    <div role="radiogroup" aria-label={t('theme.theme')} className={cn('flex flex-wrap gap-2.5', className)}>
      {THEMES.map((name) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={theme === name}
          aria-label={t(`theme.${name}`)}
          title={t(`theme.${name}`)}
          onClick={() => setTheme(name)}
          className={cn(
            'grid size-10 place-items-center rounded-full border border-foreground/15 ring-offset-2 ring-offset-card transition outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring',
            theme === name && 'ring-2 ring-foreground/40',
          )}
          style={{ backgroundColor: THEME_SWATCH[name] }}
        >
          {theme === name ? <Check aria-hidden className="size-4 text-white" /> : null}
        </button>
      ))}
    </div>
  )
}

const MODES: { value: ModePreference; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
]

/** Φωτεινό | Σκούρο | Αυτόματο */
export function ModeSwitch({ className }: { className?: string }) {
  const t = useT()
  const { mode, setMode } = useTheme()
  return (
    <div
      role="radiogroup"
      aria-label={t('theme.mode')}
      className={cn('inline-flex rounded-full border bg-card p-0.5', className)}
    >
      {MODES.map(({ value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          onClick={() => setMode(value)}
          className={cn(segment, mode === value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
        >
          <Icon aria-hidden className="size-3.5" />
          {t(`theme.${value}`)}
        </button>
      ))}
    </div>
  )
}
