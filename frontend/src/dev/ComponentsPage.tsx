/**
 * /dev/components (dev builds only): every building block with sample data,
 * so the look can be reviewed without a backend. Section titles are component
 * names (code identifiers), not UI copy, so they are not translated.
 */
import { Bell, CalendarDays, Inbox, TrendingUp, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { AmountDisplay, AmountInput, AmountKeypad } from '@/components/Amount'
import { BudgetRow } from '@/components/BudgetRow'
import { HeroCard, Panel, StatCard } from '@/components/Cards'
import { CategoryGlyph, CategoryIcon } from '@/components/CategoryIcon'
import { ChipPicker } from '@/components/ChipPicker'
import { useConfirm } from '@/components/confirm'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DatePicker } from '@/components/DatePicker'
import { EmptyState } from '@/components/EmptyState'
import { DetailRow, FieldError, FieldLabel } from '@/components/FormField'
import { ListGroup, ListRow, SectionHeader } from '@/components/ListGroup'
import { Money } from '@/components/Money'
import { MonthSwitcher } from '@/components/MonthSwitcher'
import { PageHeader } from '@/components/PageHeader'
import { LanguageSwitch, ModeSwitch, ThemeSwatches } from '@/components/Preferences'
import { ProgressBar } from '@/components/ProgressBar'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { CardSkeleton, ListSkeleton } from '@/components/skeletons'
import { TagText } from '@/components/TagText'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useLang, useT } from '@/i18n'
import { parseAmountInput } from '@/lib/amount'
import { addDays, currentMonth, relativeDayLabel, todayISO } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { SAMPLE_ACCOUNTS, SAMPLE_CATEGORIES, sampleTransactions } from './sample-data'

function Block({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mx-0.5 mt-10 mb-3 font-mono text-[13px] font-semibold text-muted-foreground">{`<${title}>`}</h2>
      {children}
    </section>
  )
}

const ICON_NAMES = [
  'Σούπερ μάρκετ',
  'Καφές',
  'Φαγητό έξω',
  'Μετακίνηση',
  'Βενζίνη',
  'Λογαριασμοί',
  'Ενοίκιο',
  'Συνδρομές',
  'Διασκέδαση',
  'Ταξίδια',
  'Υγεία',
  'Φαρμακείο',
  'Ρούχα',
  'Δώρα',
  'Κατοικίδια',
  'Γυμναστήριο',
  'Groceries',
  'Coffee',
  'Rent',
  'Salary',
  'Μισθός',
  'Bonus',
  'Τόκοι',
  'Άλλα',
  'Ξωτικά',
  'Zebra stuff',
]

export default function ComponentsPage() {
  const t = useT()
  const lang = useLang()
  const isDesktop = useIsDesktop()
  const confirm = useConfirm()
  const today = todayISO()
  const txns = sampleTransactions(today)

  const [chip, setChip] = useState(SAMPLE_CATEGORIES[0].name)
  const [acc, setAcc] = useState(SAMPLE_ACCOUNTS[1])
  const [amount, setAmount] = useState('12.5')
  const [desk, setDesk] = useState('1234.5')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetAmount, setSheetAmount] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [month, setMonth] = useState(currentMonth())
  const [date, setDate] = useState(today)
  const [sw, setSw] = useState(true)

  const days = [0, 1, 2, 3].map((n) => addDays(today, -n))
  const [day, setDay] = useState(today)

  return (
    <div className="mx-auto max-w-3xl px-[18px] pt-[calc(env(safe-area-inset-top)+18px)] pb-24 md:px-8">
      <PageHeader title={t('dev.title')} eyebrow="/dev/components" />
      <p className="-mt-2 mb-4 text-sm text-muted-foreground">{t('dev.subtitle')}</p>

      <Panel className="space-y-3">
        <ThemeSwatches />
        <div className="flex flex-wrap gap-2">
          <ModeSwitch />
          <LanguageSwitch />
        </div>
      </Panel>

      <Block title="HeroCard / StatCard">
        <HeroCard
          label={t('home.totalBalance')}
          amount={4218.4}
          pills={[
            { label: t('home.monthIncome'), value: 1850 },
            { label: t('home.monthExpenses'), value: -742.35 },
          ]}
        />
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard
            label={t('home.monthIncome')}
            value={<Money value={1850} signed />}
            icon={TrendingUp}
            hint="+4,2%"
          />
          <StatCard label={t('home.monthExpenses')} value={<Money value={-742.35} />} icon={Wallet} />
          <StatCard
            label="USD"
            value={<Money value={1234.5} currency="$" tone="none" />}
            hint={formatMoney(null)}
          />
        </div>
      </Block>

      <Block title="Money (formatMoney / amountClass)">
        <ListGroup>
          {[1527.08, -12, 5, 0, null].map((v, i) => (
            <ListRow
              key={i}
              title={<code className="text-sm">{String(v)}</code>}
              subtitle={i === 2 ? 'signed' : undefined}
              trailing={<Money value={v} signed={i === 2} className="font-semibold" />}
            />
          ))}
          <ListRow
            title={<code className="text-sm">1234.5, &apos;$&apos;</code>}
            trailing={<Money value={1234.5} currency="$" />}
          />
        </ListGroup>
      </Block>

      <Block title="ProgressBar / BudgetRow">
        <Panel className="space-y-4">
          <ProgressBar value={40} max={100} label="ok" />
          <ProgressBar value={85} max={100} label="warn" showIcon />
          <ProgressBar value={130} max={100} label="over" showIcon />
        </Panel>
        <Panel className="mt-3 py-2">
          {SAMPLE_CATEGORIES.slice(0, 4).map((c) => (
            <BudgetRow key={c.name} {...c} />
          ))}
          <BudgetRow name="Διασκέδαση" spent={134} budget={100} />
        </Panel>
      </Block>

      <Block title="ListGroup / ListRow / SectionHeader / TagText">
        <SectionHeader
          title={t('home.recent')}
          action={{ label: t('common.seeAll'), to: '/dev/components' }}
          className="mt-0"
        />
        <ListGroup
          header={relativeDayLabel(today, lang, today)}
          headerAside={
            <Badge variant="secondary">
              <Money value={-51.7} tone="none" />
            </Badge>
          }
        >
          {txns.slice(0, 2).map((x) => (
            <ListRow
              key={x.id}
              onClick={() => toast(x.notes)}
              icon={<CategoryIcon name={x.category} />}
              title={<TagText text={x.notes} asText />}
              subtitle={`${x.category} · ${x.account}`}
              amount={x.amount}
            />
          ))}
        </ListGroup>
        <ListGroup header={relativeDayLabel(addDays(today, -4), lang, today)} className="mt-4">
          {txns.slice(6).map((x) => (
            <ListRow
              key={x.id}
              icon={<CategoryIcon name={x.category} />}
              title={<TagText text={x.notes} asText />}
              subtitle={`${x.category} · ${x.account}`}
              amount={x.amount}
              chevron
              onClick={() => {}}
            />
          ))}
        </ListGroup>
        <Panel className="mt-3 text-[15px]">
          <TagText text="Σινεμά #Νοέμβρης με #3 φίλους, #trip-ny και mail a#b" />
        </Panel>
      </Block>

      <Block title="CategoryIcon">
        <Panel className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
          {ICON_NAMES.map((name) => (
            <div key={name} className="flex flex-col items-center gap-1 text-center">
              <CategoryIcon name={name} />
              <span className="line-clamp-1 text-[11px] text-muted-foreground">{name}</span>
            </div>
          ))}
        </Panel>
      </Block>

      <Block title="ChipPicker">
        <Panel>
          <FieldLabel className="mt-0">{t('common.category')}</FieldLabel>
          <ChipPicker
            label={t('common.category')}
            value={chip}
            onChange={setChip}
            options={SAMPLE_CATEGORIES.map((c) => ({
              value: c.name,
              label: c.name,
              icon: <CategoryGlyph name={c.name} />,
            }))}
          />
          <FieldLabel>{t('common.account')}</FieldLabel>
          <ChipPicker
            label={t('common.account')}
            value={acc}
            onChange={setAcc}
            options={SAMPLE_ACCOUNTS.map((a) => ({ value: a, label: a }))}
          />
          <FieldLabel>{t('common.day')}</FieldLabel>
          <ChipPicker
            label={t('common.day')}
            value={day}
            onChange={setDay}
            options={days.map((d) => ({ value: d, label: relativeDayLabel(d, lang, today) }))}
          />
        </Panel>
      </Block>

      <Block title="AmountDisplay / AmountKeypad / AmountInput">
        <div className="grid gap-3 md:grid-cols-2">
          <Panel>
            <AmountDisplay value={amount} />
            <AmountKeypad value={amount} onChange={setAmount} className="mt-4" />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              value = <code>&quot;{amount}&quot;</code> → {String(parseAmountInput(amount))}
            </p>
          </Panel>
          <Panel>
            <FieldLabel htmlFor="dev-amount" className="mt-0">
              {t('common.amount')}
            </FieldLabel>
            <AmountInput id="dev-amount" value={desk} onChange={setDesk} />
            <p className="mt-3 text-xs text-muted-foreground">
              value = <code>&quot;{desk}&quot;</code> → {formatMoney(parseAmountInput(desk))}
            </p>
            <FieldError>{t('amount.enter')}</FieldError>
          </Panel>
        </div>
      </Block>

      <Block title="ResponsiveSheet / ConfirmDialog / useConfirm / toast">
        <div className="flex flex-wrap gap-2">
          <Button size="touch" onClick={() => setSheetOpen(true)}>
            {t('quickAdd.newExpense')}
          </Button>
          <Button size="touch" variant="destructive" onClick={() => setConfirmOpen(true)}>
            ConfirmDialog
          </Button>
          <Button
            size="touch"
            variant="outline"
            onClick={async () => toast(String(await confirm({ title: t('common.areYouSure') })))}
          >
            useConfirm()
          </Button>
          <Button size="touch" variant="secondary" onClick={() => toast.success(t('common.saved'))}>
            toast.success
          </Button>
          <Button size="touch" variant="secondary" onClick={() => toast.error(t('errors.network'))}>
            toast.error
          </Button>
        </div>
        <ResponsiveSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={t('quickAdd.newExpense')}
          footer={
            <Button
              size="block"
              onClick={() => {
                setSheetOpen(false)
                toast.success(
                  t('quickAdd.sampleSaved', { amount: formatMoney(-(parseAmountInput(sheetAmount) ?? 0)) }),
                )
              }}
            >
              {t('common.save')}
            </Button>
          }
        >
          {isDesktop ? (
            <AmountInput value={sheetAmount} onChange={setSheetAmount} autoFocus />
          ) : (
            <AmountDisplay value={sheetAmount} />
          )}
          <FieldLabel>{t('common.category')}</FieldLabel>
          <ChipPicker
            bleed={!isDesktop}
            label={t('common.category')}
            value={chip}
            onChange={setChip}
            options={SAMPLE_CATEGORIES.map((c) => ({
              value: c.name,
              label: c.name,
              icon: <CategoryGlyph name={c.name} />,
            }))}
          />
          <FieldLabel>{t('common.account')}</FieldLabel>
          <ChipPicker
            bleed={!isDesktop}
            label={t('common.account')}
            value={acc}
            onChange={setAcc}
            options={SAMPLE_ACCOUNTS.map((a) => ({ value: a, label: a }))}
          />
          <FieldLabel htmlFor="dev-notes">{t('common.notes')}</FieldLabel>
          <Input id="dev-notes" placeholder={t('quickAdd.notesPlaceholder')} />
          {!isDesktop ? (
            <AmountKeypad value={sheetAmount} onChange={setSheetAmount} className="mt-4" />
          ) : null}
        </ResponsiveSheet>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`${t('common.delete')}: Freddo espresso`}
          destructive
          confirmLabel={t('common.delete')}
          onConfirm={() =>
            new Promise((r) => setTimeout(r, 600)).then(() => toast.success(t('common.deleted')))
          }
        />
      </Block>

      <Block title="MonthSwitcher / DatePicker">
        <Panel className="flex flex-col items-start gap-3">
          <MonthSwitcher month={month} onChange={setMonth} className="-ml-2" />
          <Label htmlFor="dev-date">{t('common.day')}</Label>
          <DatePicker id="dev-date" value={date} onChange={setDate} />
        </Panel>
      </Block>

      <Block title="DetailRow">
        <Panel className="py-1">
          <DetailRow label={t('common.category')}>Καφές</DetailRow>
          <DetailRow label={t('common.account')}>Revolut</DetailRow>
          <DetailRow label={t('common.day')}>{relativeDayLabel(today, lang, today)}</DetailRow>
        </Panel>
      </Block>

      <Block title="EmptyState / skeletons">
        <Panel>
          <EmptyState
            icon={Inbox}
            title={t('common.noResults')}
            description={t('common.comingSoon')}
            action={<Button size="touch">{t('common.retry')}</Button>}
          />
        </Panel>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <CardSkeleton />
          <ListSkeleton rows={2} />
        </div>
      </Block>

      <Block title="shadcn/ui">
        <Panel className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Notifications">
                  <Bell aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tooltip</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Badge</Badge>
            <Badge variant="secondary">{t('common.sample')}</Badge>
            <Badge variant="outline">
              <CalendarDays aria-hidden /> {relativeDayLabel(addDays(today, -1), lang, today)}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="dev-switch" checked={sw} onCheckedChange={setSw} />
            <Label htmlFor="dev-switch">Switch</Label>
            <Checkbox id="dev-check" defaultChecked />
            <Label htmlFor="dev-check">Checkbox</Label>
          </div>
          <Select defaultValue={SAMPLE_ACCOUNTS[0]}>
            <SelectTrigger className="w-60" aria-label={t('common.account')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SAMPLE_ACCOUNTS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs defaultValue="a">
            <TabsList>
              <TabsTrigger value="a">{t('reports.overview')}</TabsTrigger>
              <TabsTrigger value="b">{t('reports.spending')}</TabsTrigger>
            </TabsList>
            <TabsContent value="a" className="pt-2 text-sm text-muted-foreground">
              {t('reports.overview')}
            </TabsContent>
            <TabsContent value="b" className="pt-2 text-sm text-muted-foreground">
              {t('reports.spending')}
            </TabsContent>
          </Tabs>
        </Panel>
      </Block>
    </div>
  )
}
