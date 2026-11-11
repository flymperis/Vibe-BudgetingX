import { useId, useState, type FormEvent } from 'react'
import { useMutationLock } from '@/hooks/useMutationLock'
import { errorMessage } from '@/app/query-client'
import { FieldError, FieldLabel } from '@/components/FormField'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/i18n'
import { useCreateGroup, type Contact } from './api'
import { useGroupNav } from './nav'
import { ToggleChips } from '@/components/ToggleChips'

export function NewGroupSheet({
  open,
  onOpenChange,
  contacts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contacts: Contact[]
}) {
  const t = useT()
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={t('shared.newGroup')}>
      {open ? <NewGroupForm contacts={contacts} onDone={() => onOpenChange(false)} /> : null}
    </ResponsiveSheet>
  )
}

function NewGroupForm({ contacts, onDone }: { contacts: Contact[]; onDone: () => void }) {
  const t = useT()
  const id = useId()
  const create = useCreateGroup()
  const lock = useMutationLock(create)
  const { openGroup } = useGroupNav()
  const [name, setName] = useState('')
  const [memberIds, setMemberIds] = useState<number[]>([])
  const [usernames, setUsernames] = useState('')
  const [newMembers, setNewMembers] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (create.isPending) return
    if (!lock.take()) return
    create.mutate(
      { name: name.trim(), member_ids: memberIds, usernames, new_members: newMembers },
      {
        onSuccess: (res) => {
          onDone()
          if (res.group_id) void openGroup(res.group_id)
        },
      },
    )
  }

  return (
    <form onSubmit={submit}>
      <FieldLabel htmlFor={`${id}-name`} className="mt-1">
        {t('shared.groupName')}
      </FieldLabel>
      <Input
        id={`${id}-name`}
        maxLength={60}
        required
        autoComplete="off"
        placeholder={t('shared.groupNamePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {contacts.length ? (
        <>
          <FieldLabel id={`${id}-members`}>{t('shared.membersPick')}</FieldLabel>
          <ToggleChips
            labelledBy={`${id}-members`}
            options={contacts.map((c) => ({
              value: c.id,
              label: c.login ? `${c.name} @${c.login}` : c.name,
            }))}
            selected={memberIds}
            onToggle={(v) => setMemberIds((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
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
      <FieldError>{create.isError ? errorMessage(create.error) : null}</FieldError>
      <Button type="submit" size="block" className="mt-5" disabled={create.isPending || !name.trim()}>
        {t('shared.createGroup')}
      </Button>
    </form>
  )
}
