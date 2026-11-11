/**
 * Number formatting shared by the insights screens (investments, reports).
 * Money always goes through `formatMoney`; these helpers cover the rest:
 * quantities, percentages, price age and chart axis ticks, in the user's language.
 */
import { LOCALES, type Lang } from '@/i18n'

const nf = (lang: Lang, options: Intl.NumberFormatOptions) => new Intl.NumberFormat(LOCALES[lang], options)

/**
 * Quantity with at most `significant` significant digits, like the old
 * `"%.6g"` (crypto) / `"%.4g"` (stocks), but never in exponent notation.
 */
export function formatQuantity(value: number | null | undefined, significant: number, lang: Lang): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return nf(lang, { maximumSignificantDigits: significant }).format(value)
}

/** "+45,8%" / "-3,1%" (old `"%+.1f"|format(x) ~ "%"`); `signed` adds the "+". */
export function formatPercent(
  value: number | null | undefined,
  lang: Lang,
  { signed = false, digits = 1 }: { signed?: boolean; digits?: number } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const text = nf(lang, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(value)
  // Intl uses a typographic minus in some locales; keep a plain hyphen like formatMoney.
  return `${text.replace('−', '-')}%`
}

/** Age of the price cache: "45s", "1m 5s", "2h 3m" (en) / "45δ", "1λ 5δ", "2ω 3λ" (el). */
export function formatAge(seconds: number, lang: Lang): string {
  const s = Math.max(0, Math.floor(seconds))
  const [sec, min, hour] = lang === 'el' ? ['δ', 'λ', 'ω'] : ['s', 'm', 'h']
  if (s < 60) return `${s}${sec}`
  if (s < 3600) {
    const rest = s % 60
    return rest ? `${Math.floor(s / 60)}${min} ${rest}${sec}` : `${Math.floor(s / 60)}${min}`
  }
  const rest = Math.floor((s % 3600) / 60)
  return rest ? `${Math.floor(s / 3600)}${hour} ${rest}${min}` : `${Math.floor(s / 3600)}${hour}`
}

/**
 * Short axis label for money: "1,5k €", "-800 €", "$12k". Axis ticks only;
 * tooltips and figures use formatMoney.
 */
export function formatAxisMoney(value: number, currency: '€' | '$', lang: Lang): string {
  if (!Number.isFinite(value)) return ''
  const abs = Math.abs(value)
  let body: string
  if (abs >= 1_000_000) body = `${nf(lang, { maximumFractionDigits: 1 }).format(abs / 1_000_000)}M`
  else if (abs >= 10_000) body = `${nf(lang, { maximumFractionDigits: 0 }).format(abs / 1000)}k`
  else if (abs >= 1000) body = `${nf(lang, { maximumFractionDigits: 1 }).format(abs / 1000)}k`
  else body = nf(lang, { maximumFractionDigits: 0 }).format(abs)
  const sign = value < 0 && body !== '0' ? '-' : ''
  return currency === '$' ? `${sign}$${body}` : `${sign}${body} €`
}
