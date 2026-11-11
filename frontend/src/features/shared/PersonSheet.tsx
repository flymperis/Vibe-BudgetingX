import { useId, useState, type FormEvent } from 'react'
import { errorMessage } from '@/app/query-client'
import { useConfirm } from '@/components/confirm'
import { FieldError, FieldLabel } from '@/components/FormField'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/i18n'
import { useDeletePerson, useLinkPerson, useRenamePerson, useUnlinkPerson, type Contact } from './api'
import { Hint } from './SharedParts'

/** Rename, link / unlink and remove one of my people. */
export function PersonSheet({ person, onClose }: { person: Contact | null; onClose: () => void }) {
  const t = useT()
  // Keep showing the last person while the sheet animates closed.
  const [shown, setShown] = useState<Contact | null>(person)
  if (person && person !== shown) setShown(person)
  return (
    <ResponsiveSheet
      open={!!person}
      onOpenChange={(o) => !o && onClose()}
      title={shown?.name ?? t('shared.personTitle')}
    >
      {shown ? <PersonForm key={shown.id} person={shown} onDone={onClose} /> : null}
    </ResponsiveSheet>
  )
}

function PersonForm({ person, onDone }: { person: Contact; onDone: () => void }) {
  const t = useT()
  const id = useId()
  const confirm = useConfirm()
  const rename = useRenamePerson()
  const link = useLinkPerson()
  const unlink = useUnlinkPerson()
  const remove = useDeletePerson()
  const [name, setName] = useState(person.name)
  const [username, setUsername] = useState('')
  const free = person.group_count === 0
  const busy = rename.isPending || link.isPending || unlink.isPending || remove.isPending
  const error = [rename, link, unlink, remove].find((m) => m.isError)?.error

  const resetErrors = () => [rename, link, unlink, remove].forEach((m) => m.isError && m.reset())

  const onRename = (e: FormEvent) => {
    e.preventDefault()
    resetErrors()
    rename.mutate({ id: person.id, name: name.trim() }, { onSuccess: onDone })
  }
  const onLink = (e: FormEvent) => {
    e.preventDefault()
    resetErrors()
    link.mutate({ id: person.id, username: username.trim() }, { onSuccess: onDone })
  }
  const onRemove = async () => {
    resetErrors()
    if (
      await confirm({
        title: t('shared.removePersonConfirm', { name: person.name }),
        destructive: true,
        confirmLabel: t('shared.remove'),
      })
    )
      remove.mutate(person.id, { onSuccess: onDone })
  }

  return (
    <div className="min-w-0 pb-2">
      <form onSubmit={onRename}>
        <FieldLabel htmlFor={`${id}-name`} className="mt-1">
          {t('shared.name')}
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
            disabled={busy || !name.trim() || name.trim() === person.name}
          >
            {t('common.save')}
          </Button>
        </div>
      </form>

      {person.login ? (
        <>
          <FieldLabel>{t('shared.linkUser')}</FieldLabel>
          {free ? (
            <Button
              variant="outline"
              size="touch"
              className="w-full"
              disabled={busy}
              onClick={() => {
                resetErrors()
                unlink.mutate(person.id, { onSuccess: onDone })
              }}
            >
              {t('shared.unlink', { login: person.login })}
            </Button>
          ) : (
            <Hint className="mt-0">{t('shared.linkedTo', { login: person.login })}</Hint>
          )}
        </>
      ) : (
        <form onSubmit={onLink}>
          <FieldLabel htmlFor={`${id}-user`}>{t('shared.linkUser')}</FieldLabel>
          <div className="flex gap-2">
            <Input
              id={`${id}-user`}
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('shared.theirUsername')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              size="touch"
              className="md:h-9"
              disabled={busy || !username.trim()}
            >
              {t('shared.link')}
            </Button>
          </div>
          <Hint>{t('shared.linkHint')}</Hint>
        </form>
      )}

      <FieldError>{error ? errorMessage(error) : null}</FieldError>

      {free ? (
        <Button
          variant="destructive"
          size="block"
          className="mt-6"
          disabled={busy}
          onClick={() => void onRemove()}
        >
          {t('shared.removePerson')}
        </Button>
      ) : (
        <Hint className="mt-6">{t('shared.inGroupsNote')}</Hint>
      )}
    </div>
  )
}
