import { ArrowRightLeft, Plus, Receipt, Settings2, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { HeroCard } from '@/components/Cards'
import { IconTile } from '@/components/CategoryIcon'
import { EmptyState } from '@/components/EmptyState'
import { ListGroup, SectionHeader } from '@/components/ListGroup'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { CardSkeleton, ListSkeleton } from '@/components/skeletons'
import { TagText } from '@/components/TagText'
import { Button } from '@/components/ui/button'
import { useBootstrap, useToday } from '@/bootstrap/bootstrap'
import { useLang, useT } from '@/i18n'
import { relativeDayLabel } from '@/lib/dates'
import { cn } from '@/lib/utils'
import {
  useGroupDetail,
  useSharedOverview,
  type Activity,
  type BillActivity,
  type GroupDetail,
  type PaymentActivity,
} from './api'
import { BillDetailSheet } from './BillDetailSheet'
import { BillSheet } from './BillSheet'
import type { SettlePrefill } from './forms'
import { GroupSettingsSheet } from './GroupSettingsSheet'
import { effectText, memberNames, methodLabel, paymentNames, personName } from './labels'
import { useGroupNav } from './nav'
import { PaymentDetailSheet } from './PaymentDetailSheet'
import { SettleSheet } from './SettleSheet'
import { Avatar, Hint, Tag } from './SharedParts'

export function GroupDetailScreen({ groupId }: { groupId: number }) {
  const t = useT()
  const detail = useGroupDetail(groupId)
  const { overviewTo } = useGroupNav()

  if (detail.isPending) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('nav.shared')} backTo={overviewTo} />
        <CardSkeleton className="h-36" />
        <ListSkeleton rows={4} />
      </div>
    )
  }
  if (detail.isError) {
    return (
      <>
        <PageHeader title={t('nav.shared')} backTo={overviewTo} />
        <EmptyState
          icon={Users}
          title={t('shared.groupNotFound')}
          description={t('shared.groupNotFoundHint')}
          action={
            <Button asChild size="touch" variant="outline">
              <Link to={overviewTo}>{t('common.back')}</Link>
            </Button>
          }
        />
      </>
    )
  }
  return <GroupBody group={detail.data} />
}

type Sheet =
  | { kind: 'bill'; bill: BillActivity | null }
  | { kind: 'settle'; prefill: SettlePrefill | null }
  | { kind: 'billDetail'; id: number }
  | { kind: 'paymentDetail'; id: number }
  | { kind: 'settings' }
  | null

function GroupBody({ group }: { group: GroupDetail }) {
  const t = useT()
  const lang = useLang()
  const today = useToday()
  const boot = useBootstrap()
  const overview = useSharedOverview()
  const { overviewTo } = useGroupNav()
  const [sheet, setSheet] = useState<Sheet>(null)
  // The sheet that is closing keeps its content during the animation.
  const [lastSheet, setLastSheet] = useState<Sheet>(null)
  if (sheet && sheet !== lastSheet) setLastSheet(sheet)
  const close = () => setSheet(null)

  const accounts = overview.data?.own_accounts ?? []
  const categories = boot.categories
  const eyebrow = [
    memberNames(group.member_names, t).join(' · '),
    group.is_owner ? null : t('shared.createdBy', { name: group.owner_name }),
  ]
    .filter(Boolean)
    .join(' · ')

  const days = useMemo(() => {
    const out: { date: string; items: Activity[] }[] = []
    for (const a of group.activity) {
      const last = out[out.length - 1]
      if (last && last.date === a.date) last.items.push(a)
      else out.push({ date: a.date, items: [a] })
    }
    return out
  }, [group.activity])

  // Detail sheets read the live item so they refresh after record/unrecord.
  const shownBill =
    lastSheet?.kind === 'billDetail'
      ? (group.activity.find((a) => a.kind === 'expense' && a.id === lastSheet.id) as
          BillActivity | undefined)
      : undefined
  const shownPayment =
    lastSheet?.kind === 'paymentDetail'
      ? (group.activity.find((a) => a.kind === 'settlement' && a.id === lastSheet.id) as
          PaymentActivity | undefined)
      : undefined

  return (
    <>
      <PageHeader
        title={group.name}
        backTo={overviewTo}
        eyebrow={<span className="line-clamp-2">{eyebrow}</span>}
        actions={
          <Button
            variant="outline"
            size="icon-touch"
            aria-label={t('shared.settings')}
            onClick={() => setSheet({ kind: 'settings' })}
          >
            <Settings2 aria-hidden />
          </Button>
        }
      />

      <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-6">
        <div>
          <HeroCard
            label={
              group.my_net > 0
                ? t('shared.youGetBack')
                : group.my_net < 0
                  ? t('shared.youOwe')
                  : t('shared.youAreSettled')
            }
            amount={Math.abs(group.my_net)}
            pills={[{ label: t('shared.groupSpending'), value: group.total_spent }]}
          />
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Button
              size="touch"
              className="h-12 rounded-2xl"
              onClick={() => setSheet({ kind: 'bill', bill: null })}
            >
              <Plus aria-hidden />
              {t('shared.addBill')}
            </Button>
            <Button
              size="touch"
              variant="outline"
              className="h-12 rounded-2xl"
              onClick={() => setSheet({ kind: 'settle', prefill: null })}
            >
              <ArrowRightLeft aria-hidden />
              {t('shared.settleUp')}
            </Button>
          </div>

          <SectionHeader title={t('shared.balances')} />
          <ListGroup label={t('shared.balances')}>
            {group.members.map((m) => (
              <li key={m.id} className="flex min-h-14 items-center gap-3 px-3.5 py-2.5">
                <Avatar name={personName(m.name, m.is_me, t)} me={m.is_me} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                  {personName(m.name, m.is_me, t)}
                  {m.status === 'invited' ? (
                    <Tag tone="warn">{t('shared.invited')}</Tag>
                  ) : m.status === 'declined' ? (
                    <Tag tone="warn">{t('shared.declined')}</Tag>
                  ) : m.is_user && !m.is_me ? (
                    <Tag tone="primary">@{m.login}</Tag>
                  ) : null}
                </span>
                {m.net === 0 ? (
                  <span className="text-[13px] text-muted-foreground">{t('shared.settled')}</span>
                ) : (
                  <span className="flex flex-col items-end">
                    <Money
                      value={Math.abs(m.net)}
                      tone="none"
                      className={cn(
                        'text-[15px] font-semibold',
                        m.net > 0 ? 'text-positive' : 'text-negative',
                      )}
                    />
                    <span className="text-xs text-muted-foreground">
                      {m.net > 0 ? t('shared.getsBack') : t('shared.owes')}
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ListGroup>

          {group.suggestions.length ? (
            <>
              <SectionHeader title={t('shared.suggestions')} />
              <ListGroup label={t('shared.suggestions')}>
                {group.suggestions.map((s) => {
                  const from = personName(s.from_name, s.from_id === group.me_id, t)
                  const to = personName(s.to_name, s.to_id === group.me_id, t)
                  return (
                    <li
                      key={`${s.from_id}-${s.to_id}`}
                      className={cn(
                        'flex min-h-14 items-center gap-3 px-3.5 py-2',
                        s.involves_me && 'bg-primary/5',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[15px] font-medium break-words">
                          {t('shared.paysLabel', { from, to })}
                        </span>
                        <Money value={s.amount} tone="none" className="text-[13px] text-muted-foreground" />
                      </span>
                      <Button
                        variant={s.involves_me ? 'default' : 'outline'}
                        size="touch"
                        aria-label={`${t('shared.record')}: ${t('shared.paysLabel', { from, to })}`}
                        onClick={() =>
                          setSheet({
                            kind: 'settle',
                            prefill: { from_id: s.from_id, to_id: s.to_id, amount: s.amount },
                          })
                        }
                      >
                        {t('shared.record')}
                      </Button>
                    </li>
                  )
                })}
              </ListGroup>
              <Hint>{t('shared.suggestionsHint')}</Hint>
            </>
          ) : null}
        </div>

        <div>
          <SectionHeader title={t('shared.activity')} className="md:mt-0" />
          {days.length ? (
            <div className="space-y-4">
              {days.map((day) => (
                <ListGroup key={day.date} header={relativeDayLabel(day.date, lang, today)}>
                  {day.items.map((a) =>
                    a.kind === 'expense' ? (
                      <BillRow
                        key={`e${a.id}`}
                        bill={a}
                        meId={group.me_id}
                        onOpen={() => setSheet({ kind: 'billDetail', id: a.id })}
                      />
                    ) : (
                      <PaymentRow
                        key={`s${a.id}`}
                        payment={a}
                        onOpen={() => setSheet({ kind: 'paymentDetail', id: a.id })}
                      />
                    ),
                  )}
                </ListGroup>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border bg-card shadow-card">
              <EmptyState
                icon={Receipt}
                title={t('shared.noActivity')}
                description={t('shared.noActivityHint')}
              />
            </div>
          )}
        </div>
      </div>

      <BillSheet
        open={sheet?.kind === 'bill'}
        onOpenChange={(o) => !o && close()}
        group={group}
        bill={lastSheet?.kind === 'bill' ? lastSheet.bill : null}
        categories={categories}
        accounts={accounts}
      />
      <SettleSheet
        open={sheet?.kind === 'settle'}
        onOpenChange={(o) => !o && close()}
        group={group}
        prefill={lastSheet?.kind === 'settle' ? lastSheet.prefill : null}
        accounts={accounts}
      />
      <BillDetailSheet
        open={sheet?.kind === 'billDetail' && !!shownBill}
        onOpenChange={(o) => !o && close()}
        bill={shownBill ?? null}
        group={group}
        categories={categories}
        accounts={accounts}
        onEdit={(bill) => setSheet({ kind: 'bill', bill })}
      />
      <PaymentDetailSheet
        open={sheet?.kind === 'paymentDetail' && !!shownPayment}
        onOpenChange={(o) => !o && close()}
        payment={shownPayment ?? null}
        group={group}
        accounts={accounts}
      />
      <GroupSettingsSheet
        open={sheet?.kind === 'settings'}
        onOpenChange={(o) => !o && close()}
        group={group}
      />
    </>
  )
}

function BillRow({ bill, meId, onOpen }: { bill: BillActivity; meId: number | null; onOpen: () => void }) {
  const t = useT()
  const method = methodLabel(bill.split_method, t, true)
  const payer = bill.payload.paid_by === meId ? null : bill.paid_by_name
  const effectClass =
    bill.effect > 0 ? 'text-positive' : bill.effect < 0 ? 'text-negative' : 'text-muted-foreground'
  const flag =
    bill.involved && !bill.recorded
      ? t('shared.notInBudget')
      : bill.record_incomplete
        ? t('shared.partlyInBudget')
        : null
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted"
      >
        <IconTile icon={Receipt} tone="muted" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <TagText
              asText
              text={bill.description}
              className="min-w-0 flex-1 truncate text-[15px] font-medium"
            />
            <Money value={bill.amount} tone="none" className="text-[15px] font-semibold" />
          </span>
          <span className="mt-0.5 flex items-baseline gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {payer === null
                ? t('shared.youPaidSplit', { method })
                : t('shared.paidSplit', { name: payer, method })}
            </span>
            <span className={cn('shrink-0 font-medium', effectClass)}>{effectText(bill, t)}</span>
          </span>
          {flag ? (
            <span className="mt-1.5 inline-flex rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
              {flag}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  )
}

function PaymentRow({ payment, onOpen }: { payment: PaymentActivity; onOpen: () => void }) {
  const t = useT()
  const { from, to } = paymentNames(payment, t)
  const parts = [t('shared.payment'), payment.notes || null, payment.recorded ? t('shared.inAccounts') : null]
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted"
      >
        <IconTile icon={ArrowRightLeft} tone="primary" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
              {t('shared.paymentTitle', { from, to })}
            </span>
            <Money value={payment.amount} tone="none" className="text-[15px] font-semibold" />
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {parts.filter(Boolean).join(' · ')}
          </span>
          {payment.involved && !payment.recorded ? (
            <span className="mt-1.5 inline-flex rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
              {t('shared.notInAccounts')}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  )
}
