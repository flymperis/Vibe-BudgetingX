import { Pencil, Plus, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { errorMessage } from '@/app/query-client'
import { HeroCard } from '@/components/Cards'
import { EmptyState } from '@/components/EmptyState'
import { FieldError } from '@/components/FormField'
import { ListGroup, ListRow, SectionHeader } from '@/components/ListGroup'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { CardSkeleton, ListSkeleton } from '@/components/skeletons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IconTile } from '@/components/CategoryIcon'
import { useT } from '@/i18n'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  useAcceptInvite,
  useAddPeople,
  useDeclineInvite,
  useSharedOverview,
  type Contact,
  type SharedOverview,
} from './api'
import { memberNames } from './labels'
import { NewGroupSheet } from './NewGroupSheet'
import { PersonSheet } from './PersonSheet'
import { useGroupNav } from './nav'
import { Avatar, Hint, Tag } from './SharedParts'

export function SharedOverviewScreen() {
  const t = useT()
  const overview = useSharedOverview()
  const [newGroupOpen, setNewGroupOpen] = useState(false)

  return (
    <>
      <PageHeader
        title={t('nav.shared')}
        actions={
          <Button size="touch" onClick={() => setNewGroupOpen(true)}>
            <Plus aria-hidden />
            <span className="max-sm:sr-only">{t('shared.newGroup')}</span>
          </Button>
        }
      />
      {overview.isPending ? (
        <div className="space-y-4">
          <CardSkeleton className="h-36" />
          <ListSkeleton rows={3} />
        </div>
      ) : overview.isError ? (
        <EmptyState
          title={t('errors.loadFailed')}
          action={
            <Button variant="outline" size="touch" onClick={() => void overview.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : (
        <OverviewBody data={overview.data} onNewGroup={() => setNewGroupOpen(true)} />
      )}
      {overview.data ? (
        <NewGroupSheet open={newGroupOpen} onOpenChange={setNewGroupOpen} contacts={overview.data.contacts} />
      ) : null}
    </>
  )
}

function OverviewBody({ data, onNewGroup }: { data: SharedOverview; onNewGroup: () => void }) {
  const t = useT()
  const { groupTo } = useGroupNav()
  const [person, setPerson] = useState<Contact | null>(null)

  return (
    <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-6">
      <div>
        {data.invitations.length ? <Invitations data={data} /> : null}

        <HeroCard
          label={
            data.net > 0
              ? t('shared.overallOwed')
              : data.net < 0
                ? t('shared.overallOwe')
                : t('shared.allSettled')
          }
          amount={Math.abs(data.net)}
          pills={[
            { label: t('shared.youAreOwed'), value: data.owed_to_me },
            { label: t('shared.youOwe'), value: data.i_owe },
          ]}
        />

        {data.friend_balances.length ? (
          <>
            <SectionHeader title={t('shared.friends')} />
            <ListGroup label={t('shared.friends')}>
              {data.friend_balances.map((f) => (
                <ListRow
                  key={f.name}
                  icon={<Avatar name={f.name} />}
                  title={f.name}
                  trailing={
                    <span className="flex flex-col items-end">
                      <Money
                        value={Math.abs(f.amount)}
                        tone="none"
                        className={cn(
                          'text-[15px] font-semibold',
                          f.amount > 0 ? 'text-positive' : 'text-negative',
                        )}
                      />
                      <span className="text-xs text-muted-foreground">
                        {f.amount > 0 ? t('shared.owesYou') : t('shared.youOweThem')}
                      </span>
                    </span>
                  }
                />
              ))}
            </ListGroup>
          </>
        ) : null}

        <SectionHeader title={t('shared.groups')} />
        {data.groups.length ? (
          <ListGroup label={t('shared.groups')}>
            {data.groups.map((g) => (
              <ListRow
                key={g.id}
                to={groupTo(g.id)}
                icon={<IconTile icon={Users} tone="primary" />}
                title={
                  <>
                    {g.name}
                    {g.shared_with_users > 0 ? <Tag tone="primary">{t('shared.sharedTag')}</Tag> : null}
                  </>
                }
                subtitle={memberNames(g.member_names, t).join(', ')}
                trailing={<GroupNet value={g.my_net} />}
              />
            ))}
          </ListGroup>
        ) : (
          <div className="rounded-2xl border bg-card shadow-card">
            <EmptyState
              icon={Users}
              title={t('shared.noGroups')}
              description={t('shared.noGroupsHint')}
              action={
                <Button size="touch" onClick={onNewGroup}>
                  <Plus aria-hidden />
                  {t('shared.newGroup')}
                </Button>
              }
            />
          </div>
        )}
      </div>

      <div>
        <SectionHeader title={t('shared.people')} className="md:mt-0" />
        <AddPeopleForm />
        {data.contacts.length ? (
          <ListGroup label={t('shared.people')} className="mt-3">
            {data.contacts.map((p) => (
              <ListRow
                key={p.id}
                onClick={() => setPerson(p)}
                label={t('shared.edit', { name: p.name })}
                icon={<Avatar name={p.name} />}
                title={
                  <>
                    {p.name}
                    {p.login ? <Tag tone="primary">@{p.login}</Tag> : null}
                  </>
                }
                subtitle={
                  p.group_count === 1
                    ? t('shared.groupCountOne')
                    : t('shared.groupCount', { count: p.group_count })
                }
                trailing={<Pencil aria-hidden className="size-4 text-muted-foreground" />}
              />
            ))}
          </ListGroup>
        ) : (
          <Hint>{t('shared.noPeople')}</Hint>
        )}
        <Hint className="mt-6 leading-relaxed">{t('shared.intro')}</Hint>
      </div>

      <PersonSheet person={person} onClose={() => setPerson(null)} />
    </div>
  )
}

function GroupNet({ value }: { value: number }) {
  const t = useT()
  if (value === 0) return <span className="text-[13px] text-muted-foreground">{t('shared.settledUp')}</span>
  const amount = formatMoney(Math.abs(value))
  return (
    <span className={cn('text-right text-[13px] font-medium', value > 0 ? 'text-positive' : 'text-negative')}>
      {value > 0 ? t('shared.youGetBackAmount', { amount }) : t('shared.youOweAmount', { amount })}
    </span>
  )
}

function Invitations({ data }: { data: SharedOverview }) {
  const t = useT()
  const { openGroup } = useGroupNav()
  const accept = useAcceptInvite((id) => void openGroup(id))
  const decline = useDeclineInvite()
  const busy = accept.isPending || decline.isPending
  return (
    <ListGroup header={t('shared.invitations')} label={t('shared.invitations')} className="mb-5">
      {data.invitations.map((inv) => (
        <li key={inv.id} className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={inv.owner} />
            <p className="min-w-0 text-[15px]">
              {t('shared.invitedYou', { owner: inv.owner, group: inv.name })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="touch" className="flex-1" disabled={busy} onClick={() => accept.mutate(inv.id)}>
              {t('shared.join')}
            </Button>
            <Button
              size="touch"
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => decline.mutate(inv.id)}
            >
              {t('shared.decline')}
            </Button>
          </div>
        </li>
      ))}
    </ListGroup>
  )
}

function AddPeopleForm() {
  const t = useT()
  const add = useAddPeople()
  const [name, setName] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    add.mutate(name, { onSuccess: () => setName('') })
  }
  return (
    <form onSubmit={submit}>
      <div className="flex gap-2">
        <Input
          aria-label={t('shared.addPeople')}
          placeholder={t('shared.addPeoplePlaceholder')}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (add.isError) add.reset()
          }}
          className="flex-1"
        />
        <Button type="submit" size="touch" className="md:h-9" disabled={add.isPending || !name.trim()}>
          {t('shared.add')}
        </Button>
      </div>
      <FieldError>{add.isError ? errorMessage(add.error) : null}</FieldError>
    </form>
  )
}
