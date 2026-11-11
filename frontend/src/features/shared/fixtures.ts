/** Synthetic test data shaped like GET /api/shared/groups/{id} (tests only). */
import type { GroupDetail, Member } from './api'

const member = (id: number, name: string, extra: Partial<Member> = {}): Member => ({
  id,
  name,
  is_me: false,
  is_user: false,
  login: null,
  is_owner: false,
  status: 'active',
  net: 0,
  removable: true,
  ...extra,
})

export function sampleGroup(overrides: Partial<GroupDetail> = {}): GroupDetail {
  return {
    id: 7,
    name: 'Κρήτη',
    member_names: ['You', 'Anna', 'Kostas'],
    my_net: 0,
    shared_with_users: 0,
    is_owner: true,
    owner_name: 'you',
    me_id: 1,
    members: [
      member(1, 'You', { is_me: true, is_user: true, login: 'me', is_owner: true, removable: false }),
      member(2, 'Anna'),
      member(3, 'Kostas'),
    ],
    suggestions: [],
    activity: [],
    total_spent: 0,
    addable_contacts: [],
    expense_defaults: {
      paid_by: 1,
      split_method: 'equal',
      included: [1, 2, 3],
      spent_on: '2026-11-10',
      record_personal: true,
    },
    settlement_defaults: {
      from_person_id: 1,
      to_person_id: 2,
      amount: null,
      paid_on: '2026-11-10',
      record_personal: true,
    },
    ...overrides,
  }
}
