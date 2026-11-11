import { Download, Landmark, Plug, ReceiptText, PiggyBank, SlidersHorizontal } from 'lucide-react'
import { SETTINGS_SECTIONS } from '@/app/nav'
import { IconTile } from '@/components/CategoryIcon'
import { ListGroup, ListRow } from '@/components/ListGroup'
import { PageHeader } from '@/components/PageHeader'
import { useT } from '@/i18n'

const ICONS = {
  '/settings/general': SlidersHorizontal,
  '/settings/accounts': Landmark,
  '/settings/expense-categories': ReceiptText,
  '/settings/income-categories': PiggyBank,
  '/settings/export': Download,
  '/settings/integrations': Plug,
} as const

const HINTS = {
  '/settings/general': 'settings.hintGeneral',
  '/settings/accounts': 'settings.hintAccounts',
  '/settings/expense-categories': 'settings.hintExpenseCategories',
  '/settings/income-categories': 'settings.hintIncomeCategories',
  '/settings/export': 'settings.hintExport',
  '/settings/integrations': 'settings.hintIntegrations',
} as const

/** /settings: list of sections (each one is its own route). */
export default function SettingsIndexPage() {
  const t = useT()
  return (
    <>
      <PageHeader title={t('nav.settings')} />
      <ListGroup>
        {SETTINGS_SECTIONS.map((s) => (
          <ListRow
            key={s.path}
            to={s.path}
            icon={<IconTile icon={ICONS[s.path]} />}
            title={t(s.label)}
            subtitle={t(HINTS[s.path])}
          />
        ))}
      </ListGroup>
    </>
  )
}
