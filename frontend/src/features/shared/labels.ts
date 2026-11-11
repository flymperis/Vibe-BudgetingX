/**
 * Localised text for the Shared screens. The core sends some English strings
 * ("You", "you", effect_text, method_label); these helpers build the text from
 * the raw fields instead.
 */
import type { MessageKey, TFunction } from '@/i18n'
import { formatMoney } from '@/lib/money'
import type { BillActivity, PaymentActivity } from './api'
import { isSplitMethod } from './split'

/** The core's name for the viewer's own person. */
export const CORE_SELF_NAME = 'You'
/** The core's added_by / owner_name for the viewer. */
export const CORE_SELF_USER = 'you'

export function personName(name: string, isMe: boolean, t: TFunction): string {
  return isMe ? t('shared.you') : name
}

/** member_names come "you first": only that first entry can be the core's "You". */
export function memberNames(names: string[], t: TFunction): string[] {
  return names.map((n, i) => (i === 0 && n === CORE_SELF_NAME ? t('shared.you') : n))
}

export function addedByText(addedBy: string, t: TFunction): string {
  return addedBy === CORE_SELF_USER ? t('shared.addedByYou') : addedBy
}

export function methodLabel(method: string, t: TFunction, long = false): string {
  if (!isSplitMethod(method)) return method
  return t(`shared.${long ? 'methodLong' : 'method'}.${method}` as MessageKey)
}

/** "you lent 67,50 €" / "you paid only your share" / "you borrowed 20,00 €" / "not involved". */
export function effectText(bill: Pick<BillActivity, 'effect' | 'i_paid'>, t: TFunction): string {
  const amount = formatMoney(Math.abs(bill.effect))
  if (bill.i_paid) return bill.effect > 0 ? t('shared.effect.lent', { amount }) : t('shared.effect.ownShare')
  if (bill.effect < 0) return t('shared.effect.borrowed', { amount })
  return t('shared.effect.none')
}

/** Payer / receiver names with "You" localised (i_paid / involved say which one is me). */
export function paymentNames(
  p: Pick<PaymentActivity, 'from_name' | 'to_name' | 'i_paid' | 'involved'>,
  t: TFunction,
) {
  return {
    from: personName(p.from_name, p.i_paid, t),
    to: personName(p.to_name, p.involved && !p.i_paid, t),
  }
}
