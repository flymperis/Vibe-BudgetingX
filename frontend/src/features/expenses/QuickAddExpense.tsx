/**
 * SAMPLE quick-add sheet opened by the "+" button. It shows the intended
 * layout with the real building blocks but saves nothing. The expenses feature
 * replaces the body with the real form (POST + invalidateMoney + toast).
 */
import { use, useId, useState } from 'react'
import { toast } from 'sonner'
import { BootstrapContext, useToday } from '@/bootstrap/bootstrap'
import { AmountEntry, AmountKeypad } from '@/components/Amount'
import { CategoryGlyph } from '@/components/CategoryIcon'
import { ChipPicker } from '@/components/ChipPicker'
import { FieldLabel } from '@/components/FormField'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SAMPLE_ACCOUNTS, SAMPLE_CATEGORIES } from '@/dev/sample-data'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useLang, useT } from '@/i18n'
import { parseAmountInput } from '@/lib/amount'
import { addDays, relativeDayLabel } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

export default function QuickAddExpense({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const lang = useLang()
  const isDesktop = useIsDesktop()
  const today = useToday()
  const boot = use(BootstrapContext)
  const ids = { cat: useId(), acc: useId(), day: useId(), notes: useId() }

  const categories = boot?.categories?.length
    ? boot.categories.map((c) => c.name)
    : SAMPLE_CATEGORIES.map((c) => c.name)
  const accounts = boot?.accounts?.length ? boot.accounts.map((a) => a.name) : SAMPLE_ACCOUNTS

  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [account, setAccount] = useState(accounts[0])
  const [day, setDay] = useState(today)
  const [notes, setNotes] = useState('')

  const days = [0, 1, 2, 3].map((n) => addDays(today, -n))

  const reset = () => {
    setAmount('')
    setNotes('')
    setDay(today)
  }

  const save = () => {
    const value = parseAmountInput(amount)
    if (!value) {
      toast.error(t('amount.enter'))
      return
    }
    toast.success(t('quickAdd.sampleSaved', { amount: formatMoney(-value) }))
    onOpenChange(false)
    reset()
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('quickAdd.newExpense')}
      footer={
        <Button size="block" onClick={save}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="mb-1 flex justify-center">
        <Badge variant="secondary">{t('common.sample')}</Badge>
      </div>
      <AmountEntry value={amount} onChange={setAmount} autoFocus={isDesktop} />

      <FieldLabel id={ids.cat}>{t('common.category')}</FieldLabel>
      <ChipPicker
        bleed={!isDesktop}
        labelledBy={ids.cat}
        label={t('common.category')}
        value={category}
        onChange={setCategory}
        options={categories.map((name) => ({
          value: name,
          label: name,
          icon: <CategoryGlyph name={name} />,
        }))}
      />

      <FieldLabel id={ids.acc}>{t('common.account')}</FieldLabel>
      <ChipPicker
        bleed={!isDesktop}
        labelledBy={ids.acc}
        label={t('common.account')}
        value={account}
        onChange={setAccount}
        options={accounts.map((name) => ({ value: name, label: name }))}
      />

      <FieldLabel id={ids.day}>{t('common.day')}</FieldLabel>
      <ChipPicker
        bleed={!isDesktop}
        labelledBy={ids.day}
        label={t('common.day')}
        value={day}
        onChange={setDay}
        options={days.map((d) => ({ value: d, label: relativeDayLabel(d, lang, today) }))}
      />

      <FieldLabel htmlFor={ids.notes}>{t('common.notes')}</FieldLabel>
      <Input
        id={ids.notes}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t('quickAdd.notesPlaceholder')}
        autoComplete="off"
      />

      {!isDesktop ? <AmountKeypad value={amount} onChange={setAmount} className="mt-4" /> : null}
    </ResponsiveSheet>
  )
}
