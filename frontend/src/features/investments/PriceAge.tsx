import { useEffect, useState } from 'react'
import { formatAge } from '@/lib/format'
import { useLang, useT } from '@/i18n'

/**
 * "Ενημερώθηκε πριν από 1λ 5δ": the server's cache age at load time plus the
 * time since then, ticking every second (display only; nothing is refetched).
 */
export function PriceAge({ ageSeconds, loadedAt }: { ageSeconds: number; loadedAt: number }) {
  const t = useT()
  const lang = useLang()
  const [now, setNow] = useState(loadedAt)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [loadedAt])
  const elapsed = Math.max(0, (now - loadedAt) / 1000)
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {t('investments.updatedAgo', { age: formatAge(ageSeconds + elapsed, lang) })}
    </span>
  )
}
