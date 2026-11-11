import { Loader2, Search } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'
import {
  SEARCH_RULES,
  useSymbolSearch,
  type AssetKind,
  type CryptoSearchItem,
  type StockSearchItem,
} from './api'
import { useDebounced } from './useDebounced'

type Item = CryptoSearchItem | StockSearchItem

export interface SymbolSearchProps {
  kind: AssetKind
  onPick: (item: Item) => void
  /** Id for the input, so a visible <label htmlFor> can name it. */
  inputId?: string
}

function itemKey(kind: AssetKind, item: Item) {
  return kind === 'crypto' ? (item as CryptoSearchItem).id : (item as StockSearchItem).symbol
}

/**
 * Search-as-you-type for a coin (CoinGecko) or a stock symbol (Finnhub), as a
 * combobox: arrows move, Enter picks (the first result when none is active,
 * like the old stock search), Escape closes.
 */
export function SymbolSearch({ kind, onPick, inputId }: SymbolSearchProps) {
  const t = useT()
  const id = useId()
  const listId = `${id}-list`
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const rules = SEARCH_RULES[kind]
  const q = useDebounced(text.trim(), rules.delay)
  const search = useSymbolSearch(kind, q)
  const tooShort = text.trim().length < rules.minLength
  const items: Item[] = !tooShort && q === text.trim() ? (search.data ?? []) : []
  const showList = open && !tooShort && items.length > 0
  const showNone = open && !tooShort && q === text.trim() && search.isSuccess && items.length === 0

  const pick = (item: Item) => {
    onPick(item)
    if (kind === 'crypto') setText('')
    else {
      const s = item as StockSearchItem
      setText(`${s.symbol} — ${s.name}`)
    }
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault()
      setOpen(true)
      setActive((a) => (a + 1) % items.length)
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault()
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1))
    } else if (e.key === 'Enter') {
      if (items.length) {
        e.preventDefault()
        pick(items[active >= 0 ? active : 0])
      }
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={inputId ?? `${id}-input`}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
        aria-label={inputId ? undefined : t(kind === 'crypto' ? 'investments.searchCoin' : 'investments.searchSymbol')}
        placeholder={t(kind === 'crypto' ? 'investments.searchCoinPlaceholder' : 'investments.searchSymbolPlaceholder')}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="pr-9 pl-9"
      />
      {search.isFetching && !tooShort ? (
        <Loader2
          aria-hidden
          className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
        />
      ) : null}
      <ul
        id={listId}
        role="listbox"
        aria-label={t('investments.searchResults')}
        hidden={!showList}
        className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg"
      >
        {items.map((item, i) => {
          const isCrypto = kind === 'crypto'
          const c = item as CryptoSearchItem
          const s = item as StockSearchItem
          return (
            <li
              key={itemKey(kind, item)}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown keeps the input focused (the list would close on blur first)
              onMouseDown={(e) => {
                e.preventDefault()
                pick(item)
              }}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm',
                i === active ? 'bg-muted' : 'hover:bg-muted/60',
              )}
            >
              {isCrypto && c.thumb ? (
                <img src={c.thumb} alt="" loading="lazy" className="size-6 shrink-0 rounded-full" />
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  <strong className="font-semibold">{isCrypto ? c.symbol.toUpperCase() : s.ticker}</strong>{' '}
                  {item.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {isCrypto ? c.id : `${s.symbol}${s.type ? ` · ${s.type}` : ''}`}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      {showNone ? (
        <p className="mt-1.5 text-xs text-muted-foreground" role="status">
          {t('common.noResults')}
        </p>
      ) : null}
    </div>
  )
}
