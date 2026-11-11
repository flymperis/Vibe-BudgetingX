import { Trash2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { errorMessage } from '@/app/query-client'
import { useConfirm } from '@/components/confirm'
import { FieldError, FieldLabel } from '@/components/FormField'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/i18n'
import {
  useAddMembers,
  useDeleteGroup,
  useRemoveMember,
  useRenameGroup,
  type GroupDetail,
  type Member,
} from './api'
import { personName } from './labels'
import { useGroupNav } from './nav'
import { Avatar, Tag, ToggleChips } from './SharedParts'

export function GroupSettingsSheet({
  open,
  onOpenChange,
  group,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: GroupDetail
}) {
  const t = useT()
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={t('shared.settings')}>
      {open ? <GroupSettings group={group} onClose={() => onOpenChange(false)} /> : null}
    </ResponsiveSheet>
  )
}

function GroupSettings({ group, onClose }: { group: GroupDetail; onClose: () => void }) {
  const t = useT()
  const id = useId()
  const confirm = useConfirm()
  const { leaveToOverview } = useGroupNav()
  const rename = useRenameGroup()
  const add = useAddMembers()
  const gone = () => {
    onClose()
    void leaveToOverview()
  }
  const removeMember = useRemoveMember(gone)
  const del = useDeleteGroup(gone)
  const [name, setName] = useState(group.name)
  const [picked, setPicked] = useState<number[]>([])
  const [usernames, setUsernames] = useState('')
  const [newMembers, setNewMembers] = useState('')

  const onRename = (e: FormEvent) => {
    e.preventDefault()
    rename.mutate({ id: group.id, name: name.trim() })
  }
  const onAdd = (e: FormEvent) => {
    e.preventDefault()
    add.mutate(
      { groupId: group.id, body: { member_ids: picked, usernames, new_members: newMembers } },
      {
        onSuccess: () => {
          setPicked([])
          setUsernames('')
          setNewMembers('')
        },
      },
    )
  }
  const onRemove = async (m: Member) => {
    const leaving = m.is_me
    const ok = await confirm({
      title: leaving
        ? t('shared.leaveConfirm', { name: group.name })
        : t('shared.removeMemberConfirm', { name: m.name }),
      destructive: true,
      confirmLabel: leaving ? t('shared.leave') : t('shared.remove'),
    })
    if (!ok) return
    removeMember.mutate({ groupId: group.id, personId: m.id, leaving })
  }
  const onDelete = async () => {
    const ok = await confirm({
      title: t('shared.deleteGroupConfirm', { name: group.name }),
      description: t('shared.deleteGroupHint'),
      destructive: true,
      confirmLabel: t('common.delete'),
    })
    if (ok) del.mutate(group.id)
  }

  return (
    <div className="min-w-0 pb-2">
      <form onSubmit={onRename}>
        <FieldLabel htmlFor={`${id}-name`} className="mt-1">
          {t('shared.groupName')}
        </FieldLabel>
        <div className="flex gap-2">
          <Input
            id={`${id}-name`}
            maxLength={60}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            size="touch"
            className="md:h-9"
            disabled={rename.isPending || !name.trim() || name.trim() === group.name}
          >
            {t('shared.rename')}
          </Button>
        </div>
        <FieldError>{rename.isError ? errorMessage(rename.error) : null}</FieldError>
      </form>

      <FieldLabel>{t('shared.members')}</FieldLabel>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-card">
        {group.members.map((m) => {
          const display = personName(m.name, m.is_me, t)
          return (
            <li key={m.id} className="flex min-h-14 items-center gap-3 px-3.5 py-2">
              <Avatar name={display} me={m.is_me} className="size-8 text-[13px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">
                  {display}
                  {m.login && !m.is_me ? <Tag tone="primary">@{m.login}</Tag> : null}
                </span>
                {m.is_owner || m.status !== 'active' ? (
                  <span className="block text-xs text-muted-foreground">
                    {[
                      m.is_owner ? t('shared.creator') : null,
                      m.status === 'invited'
                        ? t('shared.invited')
                        : m.status === 'declined'
                          ? t('shared.declined')
                          : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                ) : null}
              </span>
              {m.removable ? (
                <Button
                  size="touch"
                  variant="ghost"
                  className="text-destructive"
                  disabled={removeMember.isPending}
                  onClick={() => void onRemove(m)}
                  aria-label={m.is_me ? t('shared.leave') : `${t('shared.remove')}: ${display}`}
                >
                  {m.is_me ? t('shared.leave') : t('shared.remove')}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>

      <form onSubmit={onAdd} className="mt-2">
        <h3 className="mx-0.5 mt-5 text-[15px] font-semibold">{t('shared.addMembers')}</h3>
        {group.addable_contacts.length ? (
          <>
            <FieldLabel id={`${id}-contacts`}>{t('shared.fromContacts')}</FieldLabel>
            <ToggleChips
              labelledBy={`${id}-contacts`}
              options={group.addable_contacts.map((c) => ({
                value: c.id,
                label: c.login ? `${c.name} @${c.login}` : c.name,
              }))}
              selected={picked}
              onToggle={(v) => setPicked((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
            />
          </>
        ) : null}
        <FieldLabel htmlFor={`${id}-users`}>{t('shared.inviteUsers')}</FieldLabel>
        <Input
          id={`${id}-users`}
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('shared.usernamesPlaceholder')}
          value={usernames}
          onChange={(e) => setUsernames(e.target.value)}
        />
        <FieldLabel htmlFor={`${id}-names`}>{t('shared.newNames')}</FieldLabel>
        <Input
          id={`${id}-names`}
          autoComplete="off"
          placeholder={t('shared.newNamesPlaceholder')}
          value={newMembers}
          onChange={(e) => setNewMembers(e.target.value)}
        />
        <FieldError>{add.isError ? errorMessage(add.error) : null}</FieldError>
        <Button
          type="submit"
          size="touch"
          variant="secondary"
          className="mt-3 w-full"
          disabled={add.isPending || (!picked.length && !usernames.trim() && !newMembers.trim())}
        >
          {t('shared.add')}
        </Button>
      </form>

      {group.is_owner ? (
        <Button
          variant="destructive"
          size="block"
          className="mt-8"
          disabled={del.isPending}
          onClick={() => void onDelete()}
        >
          <Trash2 aria-hidden />
          {t('shared.deleteGroup')}
        </Button>
      ) : null}
    </div>
  )
}
