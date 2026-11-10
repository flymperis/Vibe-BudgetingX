import type { ReactNode } from 'react'
import { LanguageSwitch } from '@/components/Preferences'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useT } from '@/i18n'

/** Centred card used by the login and register pages. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const t = useT()
  useDocumentTitle(title)
  return (
    <div className="flex min-h-dvh flex-col px-[18px] pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <div className="flex justify-end">
        <LanguageSwitch />
      </div>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
        <div className="mb-7 flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" width={40} height={40} className="size-10 rounded-xl" />
          <span className="text-lg font-semibold tracking-tight">{t('app.name')}</span>
        </div>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-[15px] text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-7">{children}</div>
        {footer ? <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
      </main>
    </div>
  )
}
