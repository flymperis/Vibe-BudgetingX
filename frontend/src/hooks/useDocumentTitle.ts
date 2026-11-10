import { useEffect } from 'react'
import { useT } from '@/i18n'

/** Sets the browser tab / app switcher title ("Έξοδα · Vibe Budgeting"). PageHeader calls it. */
export function useDocumentTitle(title: string) {
  const t = useT()
  useEffect(() => {
    document.title = title ? `${title} · ${t('app.name')}` : t('app.name')
  }, [title, t])
}
