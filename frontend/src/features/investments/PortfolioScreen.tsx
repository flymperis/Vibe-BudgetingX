import {
  ArrowDownLeft,
  ArrowUpRight,
  Info,
  Plus,
  RefreshCw,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { IconTile } from '@/components/CategoryIcon'
import { formatPercent, formatQuantity } from '@/lib/format'
import { EmptyState } from '@/components/EmptyState'
import { DetailRow } from '@/components/FormField'
import { ListGroup, SectionHeader } from '@/components/ListGroup'
import { Money } from '@/components/Money'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { CardSkeleton, ListSkeleton } from '@/components/skeletons'
import { Button } from '@/components/ui/button'
import { useLang, useT, type Lang } from '@/i18n'
import { shortDateLabel } from '@/lib/dates'
import { formatMoney, type Currency } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useInvestments, useRefreshPrices, type AssetKind } from './api'
import { PriceAge } from './PriceAge'
import { TxSheet } from './TxSheet'
import { cryptoView, stockView, type HoldingView, type PortfolioView, type TxView } from './view'

/** One tab of the Investments screen (crypto in EUR, stocks in USD). */
export function PortfolioScreen({ kind }: { kind: AssetKind }) {
  const t = useT()
  const query = useInvestments()
  const [txSheet, setTxSheet] = useState<{ open: boolean; tx: TxView | null; n: number }>({
    open: false,
    tx: null,
    n: 0,
  })
  const [holding, setHolding] = useState<HoldingView | null>(null)
  const openTx = (tx: TxView | null) => setTxSheet((s) => ({ open: true, tx, n: s.n + 1 }))

  if (query.isPending) {
    return (
      <div role="status" aria-live="polite" className="space-y-4">
        <span className="sr-only">{t('common.loading')}</span>
        <CardSkeleton className="h-36" />
        <ListSkeleton rows={3} />
        <ListSkeleton rows={4} />
      </div>
    )
  }
  if (query.isError) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title={t('errors.loadFailed')}
        action={
          <Button size="touch" onClick={() => void query.refetch()}>
            <RefreshCw aria-hidden />
            {t('common.retry')}
          </Button>
        }
      />
    )
  }

  const data = query.data
  const view = kind === 'crypto' ? cryptoView(data.crypto) : stockView(data.stocks)

  return (
    <div>
      <SummaryCard view={view} />

      {!view.pricesLoaded && view.holdings.length ? (
        <Hint icon={Info} className="mt-3">
          {t('investments.pricesNotLoaded')}
        </Hint>
      ) : null}

      <RefreshRow view={view} loadedAt={query.dataUpdatedAt} onAdd={() => openTx(null)} />

      {kind === 'stocks' && !data.finnhub_configured ? (
        <Hint tone="warning" icon={TriangleAlert} className="mt-3">
          {t('investments.finnhubHint')}
        </Hint>
      ) : null}

      <SectionHeader title={t('investments.holdings')} />
      {view.holdings.length ? (
        <HoldingsList view={view} onOpen={setHolding} />
      ) : (
        <div className="rounded-2xl border bg-card shadow-card">
          <EmptyState
            icon={Wallet}
            title={t('investments.noHoldings')}
            description={t('investments.noHoldingsHint')}
            className="py-8"
          />
        </div>
      )}

      <SectionHeader title={t('investments.history')} />
      {view.transactions.length ? (
        <ListGroup label={t('investments.history')}>
          {view.transactions.map((tx) => (
            <TxRow key={tx.id} tx={tx} view={view} onOpen={() => openTx(tx)} />
          ))}
        </ListGroup>
      ) : (
        <div className="rounded-2xl border bg-card shadow-card">
          <EmptyState
            icon={TrendingUp}
            title={t('investments.noTransactions')}
            className="py-8"
            action={
              <Button size="touch" onClick={() => openTx(null)}>
                <Plus aria-hidden />
                {t('investments.addTx')}
              </Button>
            }
          />
        </div>
      )}

      <TxSheet
        key={txSheet.n}
        kind={kind}
        open={txSheet.open}
        onOpenChange={(open) => setTxSheet((s) => ({ ...s, open }))}
        tx={txSheet.tx?.raw ?? null}
      />
      <HoldingSheet
        view={view}
        holding={holding}
        onClose={() => setHolding(null)}
        onOpenTx={(tx) => {
          setHolding(null)
          openTx(tx)
        }}
      />
    </div>
  )
}

function Hint({
  children,
  icon: Icon,
  tone = 'muted',
  className,
}: {
  children: ReactNode
  icon: typeof Info
  tone?: 'muted' | 'warning'
  className?: string
}) {
  return (
    <p
      className={cn(
        'mb-3 flex gap-2 rounded-xl border px-3 py-2.5 text-[13px] leading-snug',
        tone === 'warning'
          ? 'border-warning/40 bg-warning/10 text-foreground'
          : 'bg-muted/50 text-muted-foreground',
        className,
      )}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', tone === 'warning' && 'text-warning')} />
      <span>{children}</span>
    </p>
  )
}

function SummaryCard({ view }: { view: PortfolioView }) {
  const t = useT()
  const lang = useLang()
  const cur = view.currency
  const loaded = view.pricesLoaded
  return (
    <section aria-label={t('investments.summary')} className="rounded-3xl bg-hero p-5 text-hero-foreground">
      <p className="text-[13px] opacity-80">{t('investments.portfolioValue')}</p>
      <p className="mt-1 mb-4 text-[34px] leading-tight font-bold tracking-tight">
        <Money value={loaded ? view.totalValue : null} currency={cur} tone="none" />
      </p>
      <div className="flex gap-2.5">
        <div className="min-w-0 flex-1 rounded-xl bg-white/15 px-3 py-2.5">
          <p className="truncate text-[11px] opacity-80">{t('investments.totalInvested')}</p>
          <p className="truncate text-[15px] font-semibold">
            <Money value={view.totalInvested} currency={cur} tone="none" />
          </p>
        </div>
        <div className="min-w-0 flex-1 rounded-xl bg-white/15 px-3 py-2.5">
          <p className="truncate text-[11px] opacity-80">{t('investments.pnl')}</p>
          <p className="truncate text-[15px] font-semibold">
            <Money value={loaded ? view.totalPnl : null} currency={cur} signed tone="none" />
          </p>
          {loaded && view.totalInvested > 0 && view.totalPnlPct !== null ? (
            <p className="text-xs font-medium opacity-80">
              {formatPercent(view.totalPnlPct, lang, { signed: true })}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function RefreshRow({ view, loadedAt, onAdd }: { view: PortfolioView; loadedAt: number; onAdd: () => void }) {
  const t = useT()
  const refresh = useRefreshPrices()
  const busy = refresh.isPending && refresh.variables === view.kind
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1 md:flex-row md:items-center md:gap-3">
        <Button
          variant="outline"
          size="touch"
          onClick={() => refresh.mutate(view.kind)}
          disabled={refresh.isPending}
        >
          <RefreshCw aria-hidden className={cn(busy && 'animate-spin')} />
          {t('investments.refreshPrices')}
        </Button>
        {view.pricesLoaded && view.pricesAgeSeconds !== null ? (
          <span className="ml-1 leading-tight md:ml-0">
            <PriceAge ageSeconds={view.pricesAgeSeconds} loadedAt={loadedAt} />
          </span>
        ) : null}
      </div>
      <Button size="icon-touch" className="md:hidden" onClick={onAdd} aria-label={t('investments.addTx')}>
        <Plus aria-hidden />
      </Button>
      <Button size="touch" className="hidden md:inline-flex" onClick={onAdd}>
        <Plus aria-hidden />
        {t('investments.addTx')}
      </Button>
    </div>
  )
}

function ChangeBadge({ value, lang }: { value: number | null | undefined; lang: Lang }) {
  if (value === null || value === undefined) return null
  return (
    <span className={cn('text-xs font-medium tabular-nums', value >= 0 ? 'amount-pos' : 'amount-neg')}>
      {formatPercent(value, lang, { signed: true })}
    </span>
  )
}

/** P&L text: "+514,73 € (+45,8%)", or N/A without a price. */
function Pnl({ h, currency, className }: { h: HoldingView; currency: Currency; className?: string }) {
  const t = useT()
  const lang = useLang()
  if (h.pnl === null || h.pnl === undefined)
    return <span className={cn('text-muted-foreground', className)}>{t('investments.na')}</span>
  return (
    <span className={cn('tabular-nums', h.pnl >= 0 ? 'amount-pos' : 'amount-neg', className)}>
      {formatMoney(h.pnl, { currency, signed: true })}{' '}
      <span className="text-xs">({formatPercent(h.pnlPct ?? 0, lang, { signed: true })})</span>
    </span>
  )
}

function NaOr({ value, currency }: { value: number | null | undefined; currency: Currency }) {
  const t = useT()
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">{t('investments.na')}</span>
  return <Money value={value} currency={currency} tone="none" />
}

const GRID = 'md:grid md:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))] md:items-center md:gap-3'

function HoldingsList({ view, onOpen }: { view: PortfolioView; onOpen: (h: HoldingView) => void }) {
  const t = useT()
  const lang = useLang()
  const cur = view.currency
  const isCrypto = view.kind === 'crypto'
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <div
        aria-hidden
        className={cn(
          'hidden border-b px-3.5 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase',
          GRID,
        )}
      >
        <span>{isCrypto ? t('investments.coin') : t('investments.instrument')}</span>
        <span className="text-right">{isCrypto ? t('investments.quantity') : t('investments.shares')}</span>
        <span className="text-right">{t('investments.avgBuy')}</span>
        <span className="text-right">{t('investments.price')}</span>
        <span className="text-right">{t('investments.value')}</span>
        <span className="text-right">{t('investments.pnl')}</span>
      </div>
      <ul aria-label={t('investments.holdings')} className="divide-y divide-border">
        {view.holdings.map((h) => {
          const qty = formatQuantity(h.quantity, view.quantityDigits, lang)
          return (
            <li key={h.key}>
              <button
                type="button"
                onClick={() => onOpen(h)}
                aria-label={t('investments.holdingDetails', { name: `${h.title} ${h.name}` })}
                className={cn(
                  'flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors outline-none',
                  'cursor-pointer hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted',
                  GRID,
                )}
              >
                {/* Coin / instrument (both layouts) */}
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <IconTile tone={isCrypto ? 'amber' : 'indigo'} className="text-[13px] font-bold">
                    {h.title.slice(0, 4)}
                  </IconTile>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] leading-snug font-medium">
                      {h.title} <span className="font-normal text-muted-foreground">{h.name}</span>
                    </span>
                    {/* mobile second line */}
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground md:hidden">
                      <NaOr value={h.currentPrice} currency={cur} />
                      <ChangeBadge value={h.change24h} lang={lang} />
                    </span>
                    <span className="block truncate text-xs text-muted-foreground tabular-nums md:hidden">
                      {t('investments.qtyOf', { qty, symbol: h.title })}
                    </span>
                    {h.code ? (
                      <span className="hidden truncate text-xs text-muted-foreground md:block">{h.code}</span>
                    ) : null}
                  </span>
                </span>
                {/* mobile right column */}
                <span className="shrink-0 text-right md:hidden">
                  <span className="block text-[15px] font-semibold">
                    <NaOr value={h.currentValue} currency={cur} />
                  </span>
                  <Pnl h={h} currency={cur} className="block text-xs" />
                </span>
                {/* desktop columns */}
                <span className="hidden text-right text-sm tabular-nums md:block">{qty}</span>
                <span className="hidden text-right text-sm md:block">
                  <Money value={h.avgBuyPrice} currency={cur} tone="none" />
                </span>
                <span className="hidden text-right text-sm md:block">
                  <NaOr value={h.currentPrice} currency={cur} />
                  <span className="block">
                    <ChangeBadge value={h.change24h} lang={lang} />
                  </span>
                </span>
                <span className="hidden text-right text-sm font-semibold md:block">
                  <NaOr value={h.currentValue} currency={cur} />
                </span>
                <span className="hidden text-right text-sm md:block">
                  <Pnl h={h} currency={cur} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function TxRow({ tx, view, onOpen }: { tx: TxView; view: PortfolioView; onOpen: () => void }) {
  const t = useT()
  const lang = useLang()
  const cur = view.currency
  const isBuy = tx.type === 'buy'
  const qty = formatQuantity(tx.quantity, view.quantityDigits, lang)
  const typeLabel = isBuy ? t('investments.buy') : t('investments.sell')
  const parts = [
    `${qty} × ${formatMoney(tx.price, { currency: cur })}`,
    tx.fee ? t('investments.feeShort', { fee: formatMoney(tx.fee, { currency: cur }) }) : null,
    tx.venue || null,
  ].filter(Boolean)
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t('common.edit')}: ${typeLabel} ${tx.title}, ${shortDateLabel(tx.date, lang)}`}
        className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted"
      >
        <IconTile icon={isBuy ? ArrowDownLeft : ArrowUpRight} tone={isBuy ? 'green' : 'rose'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-snug font-medium">
            <span
              className={cn(
                'mr-1.5 inline-block rounded-md px-1.5 py-px align-[1px] text-[11px] font-semibold uppercase',
                isBuy ? 'bg-positive/12 text-positive' : 'bg-negative/12 text-negative',
              )}
            >
              {typeLabel}
            </span>
            {tx.title}
            {tx.code ? <span className="ml-1 font-normal text-muted-foreground">{tx.code}</span> : null}
          </span>
          <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground tabular-nums">
            {parts.join(' · ')}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[15px] font-semibold">
            <Money value={tx.total} currency={cur} tone="none" />
          </span>
          <span className="block text-xs text-muted-foreground">{shortDateLabel(tx.date, lang)}</span>
        </span>
      </button>
    </li>
  )
}

function HoldingSheet({
  view,
  holding,
  onClose,
  onOpenTx,
}: {
  view: PortfolioView
  holding: HoldingView | null
  onClose: () => void
  onOpenTx: (tx: TxView) => void
}) {
  const t = useT()
  const lang = useLang()
  const cur = view.currency
  const h = holding
  const txs = h ? view.transactions.filter((tx) => tx.holdingKey === h.key) : []
  return (
    <ResponsiveSheet
      open={!!h}
      onOpenChange={(open) => !open && onClose()}
      title={h ? `${h.title} · ${h.name}` : t('investments.holdings')}
    >
      {h ? (
        <>
          {h.code ? <p className="-mt-1 mb-2 text-sm text-muted-foreground">{h.code}</p> : null}
          <div>
            <DetailRow label={view.kind === 'crypto' ? t('investments.quantity') : t('investments.shares')}>
              <span className="tabular-nums">{formatQuantity(h.quantity, view.quantityDigits, lang)}</span>
            </DetailRow>
            <DetailRow label={t('investments.avgBuy')}>
              <Money value={h.avgBuyPrice} currency={cur} tone="none" />
            </DetailRow>
            <DetailRow label={t('investments.costBasis')}>
              <Money value={h.totalCost} currency={cur} tone="none" />
            </DetailRow>
            <DetailRow label={t('investments.price')}>
              <NaOr value={h.currentPrice} currency={cur} />
            </DetailRow>
            <DetailRow label={t('investments.change24h')}>
              {h.change24h === null || h.change24h === undefined ? (
                <span className="text-muted-foreground">{t('investments.na')}</span>
              ) : (
                <ChangeBadge value={h.change24h} lang={lang} />
              )}
            </DetailRow>
            <DetailRow label={t('investments.value')}>
              <NaOr value={h.currentValue} currency={cur} />
            </DetailRow>
            <DetailRow label={t('investments.pnl')}>
              <Pnl h={h} currency={cur} />
            </DetailRow>
          </div>
          {txs.length ? (
            <ListGroup header={t('investments.history')} className="mt-5 mb-2">
              {txs.map((tx) => (
                <TxRow key={tx.id} tx={tx} view={view} onOpen={() => onOpenTx(tx)} />
              ))}
            </ListGroup>
          ) : null}
        </>
      ) : null}
    </ResponsiveSheet>
  )
}
