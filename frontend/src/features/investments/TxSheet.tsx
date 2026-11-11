import { Trash2 } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '@/app/query-client'
import { useToday } from '@/bootstrap/bootstrap'
import { ChipPicker } from '@/components/ChipPicker'
import { useConfirm } from '@/components/confirm'
import { DatePicker } from '@/components/DatePicker'
import { FieldError, FieldLabel } from '@/components/FormField'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/i18n'
import {
  fetchStockSearch,
  investmentKeys,
  useDeleteTransaction,
  useSaveTransaction,
  type AssetKind,
  type CryptoSearchItem,
  type CryptoTx,
  type StockSearchItem,
  type StockTx,
} from './api'
import { SymbolSearch } from './SymbolSearch'
import {
  applyCryptoPick,
  applyStockPick,
  cryptoBody,
  emptyTxForm,
  pickResolvedStock,
  shouldResolveSymbol,
  stockBody,
  txToForm,
  type TxFormState,
  type TxType,
} from './txForm'

export interface TxSheetProps {
  kind: AssetKind
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The transaction to edit; none = add a new one. */
  tx?: CryptoTx | StockTx | null
}

/** Add / edit / delete one buy or sell. Remounted per opening (key) so the form starts fresh. */
export function TxSheet(props: TxSheetProps) {
  const t = useT()
  const title = props.tx ? t('investments.editTx') : t('investments.addTx')
  return (
    <ResponsiveSheet open={props.open} onOpenChange={props.onOpenChange} title={title} size="lg">
      <TxForm {...props} />
    </ResponsiveSheet>
  )
}

function Field({
  id,
  label,
  children,
  className,
}: {
  id: string
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
    </div>
  )
}

function TxForm({ kind, tx, onOpenChange }: TxSheetProps) {
  const t = useT()
  const today = useToday()
  const uid = useId()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const save = useSaveTransaction()
  const remove = useDeleteTransaction()
  const [form, setForm] = useState<TxFormState>(() => (tx ? txToForm(kind, tx) : emptyTxForm(kind, today)))
  const set = <K extends keyof TxFormState>(key: K, value: TxFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const isCrypto = kind === 'crypto'
  const cur = isCrypto ? '€' : '$'
  const fid = (name: string) => `${uid}-${name}`
  const typeLabel = fid('type')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (save.isPending) return
    const args =
      kind === 'crypto'
        ? ({ kind, id: tx?.id, body: cryptoBody(form) } as const)
        : ({ kind, id: tx?.id, body: stockBody(form) } as const)
    save.mutate(args, { onSuccess: () => onOpenChange(false) })
  }

  const onDelete = async () => {
    if (!tx) return
    const ok = await confirm({
      title: t('investments.deleteTxTitle'),
      description: t('common.cannotUndo'),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (ok) remove.mutate({ kind, id: tx.id }, { onSuccess: () => onOpenChange(false) })
  }

  // Old stock form: leaving the symbol field resolves ticker and name.
  const resolveSymbol = async () => {
    if (isCrypto || !shouldResolveSymbol(form)) return
    const sym = form.code.trim().toUpperCase()
    try {
      const items = await qc.fetchQuery({
        queryKey: investmentKeys.custom('search', 'stocks', sym),
        queryFn: () => fetchStockSearch(sym),
        staleTime: 5 * 60_000,
      })
      const pick = pickResolvedStock(sym, items)
      if (pick) setForm((f) => applyStockPick(f, pick))
    } catch {
      /* quiet, as before */
    }
  }

  const codeLabel = isCrypto ? t('investments.coinId') : t('investments.symbol')
  const symbolLabel = isCrypto ? t('investments.symbol') : t('investments.ticker')

  return (
    <form onSubmit={submit} noValidate aria-describedby={save.error ? fid('error') : undefined}>
      <FieldLabel id={typeLabel} className="mt-0">
        {t('investments.type')}
      </FieldLabel>
      <ChipPicker<TxType>
        labelledBy={typeLabel}
        label={t('investments.type')}
        value={form.txType}
        onChange={(v) => set('txType', v)}
        options={[
          { value: 'buy', label: t('investments.buy') },
          { value: 'sell', label: t('investments.sell') },
        ]}
      />

      <FieldLabel htmlFor={fid('search')}>
        {isCrypto ? t('investments.searchCoin') : t('investments.searchSymbol')}
      </FieldLabel>
      {!isCrypto ? (
        <p className="mt-2 mb-1 text-xs leading-snug text-muted-foreground">{t('investments.stocksHint')}</p>
      ) : null}
      <SymbolSearch
        kind={kind}
        inputId={fid('search')}
        onPick={(item) =>
          setForm((f) =>
            isCrypto ? applyCryptoPick(f, item as CryptoSearchItem) : applyStockPick(f, item as StockSearchItem),
          )
        }
      />

      <div className="grid grid-cols-2 gap-x-3 md:grid-cols-3">
        <Field id={fid('code')} label={codeLabel}>
          <Input
            id={fid('code')}
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            onBlur={() => void resolveSymbol()}
            placeholder={isCrypto ? 'bitcoin' : 'VUAA.EU'}
            autoComplete="off"
            autoCapitalize={isCrypto ? 'none' : 'characters'}
            spellCheck={false}
            required
          />
        </Field>
        <Field id={fid('symbol')} label={symbolLabel}>
          <Input
            id={fid('symbol')}
            value={form.symbol}
            onChange={(e) => set('symbol', e.target.value)}
            placeholder={isCrypto ? 'BTC' : 'VUAA'}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
          />
        </Field>
        <Field id={fid('name')} label={t('investments.name')} className="col-span-2 md:col-span-1">
          <Input
            id={fid('name')}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={isCrypto ? 'Bitcoin' : 'Vanguard S&P 500 UCITS ETF'}
            autoComplete="off"
            required
          />
        </Field>

        <Field id={fid('qty')} label={isCrypto ? t('investments.quantity') : t('investments.shares')}>
          <Input
            id={fid('qty')}
            inputMode="decimal"
            value={form.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            placeholder="0"
            autoComplete="off"
            required
          />
        </Field>
        <Field
          id={fid('price')}
          label={t(isCrypto ? 'investments.pricePerUnit' : 'investments.pricePerShare', { currency: cur })}
        >
          <Input
            id={fid('price')}
            inputMode="decimal"
            value={form.price}
            onChange={(e) => set('price', e.target.value)}
            placeholder="0,00"
            autoComplete="off"
            required
          />
        </Field>
        <Field id={fid('fee')} label={t('investments.fee', { currency: cur })}>
          <Input
            id={fid('fee')}
            inputMode="decimal"
            value={form.fee}
            onChange={(e) => set('fee', e.target.value)}
            placeholder="0,00"
            autoComplete="off"
          />
        </Field>
        <Field id={fid('venue')} label={isCrypto ? t('investments.exchange') : t('investments.broker')}>
          <Input
            id={fid('venue')}
            value={form.venue}
            onChange={(e) => set('venue', e.target.value)}
            placeholder={isCrypto ? 'Binance' : 'Freedom24'}
            autoComplete="off"
          />
        </Field>
        <Field id={fid('date')} label={t('investments.date')} className="col-span-2 md:col-span-1">
          <DatePicker id={fid('date')} value={form.date} onChange={(v) => set('date', v)} />
        </Field>
      </div>

      <FieldLabel htmlFor={fid('notes')}>{t('common.notes')}</FieldLabel>
      <Textarea
        id={fid('notes')}
        rows={2}
        value={form.notes}
        onChange={(e) => set('notes', e.target.value)}
        placeholder={t('investments.notesPlaceholder')}
      />

      <FieldError id={fid('error')}>{save.error ? errorMessage(save.error) : null}</FieldError>

      <div className="mt-5 flex flex-col gap-2 pb-1">
        <Button type="submit" size="block" disabled={save.isPending}>
          {tx ? t('common.save') : t('investments.addTx')}
        </Button>
        {tx ? (
          <Button
            type="button"
            size="block"
            variant="destructive"
            onClick={() => void onDelete()}
            disabled={remove.isPending}
          >
            <Trash2 aria-hidden />
            {t('investments.deleteTx')}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
