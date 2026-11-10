import { Loader2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { errorMessage } from '@/app/query-client'
import { FieldError } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/i18n'
import { AuthLayout } from './AuthLayout'
import { PasswordInput } from './PasswordInput'
import { useRegister, useSession } from './session'

/**
 * Registration. Hidden (redirects to /login) when the server says
 * allow_registration is false. Validation is the server's: its `detail`
 * ("Passwords do not match." ...) is shown inline.
 */
export default function RegisterPage() {
  const t = useT()
  const id = useId()
  const navigate = useNavigate()
  const session = useSession()
  const register = useRegister()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')

  if (session.data && !session.data.allow_registration) return <Navigate to="/login" replace />

  const submit = (e: FormEvent) => {
    e.preventDefault()
    register.mutate(
      { username: username.trim(), password, password2 },
      { onSuccess: () => navigate('/', { replace: true }) },
    )
  }

  const errorId = `${id}-error`
  const error = register.isError ? errorMessage(register.error) : null

  return (
    <AuthLayout
      title={t('auth.register')}
      subtitle={t('auth.registerSubtitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t('auth.login')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" aria-describedby={error ? errorId : undefined}>
        <div className="space-y-2">
          <Label htmlFor={`${id}-u`}>{t('auth.username')}</Label>
          <Input
            id={`${id}-u`}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={!!error || undefined}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-p`}>{t('auth.password')}</Label>
          <PasswordInput
            id={`${id}-p`}
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error || undefined}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-p2`}>{t('auth.password2')}</Label>
          <PasswordInput
            id={`${id}-p2`}
            name="password2"
            autoComplete="new-password"
            required
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            aria-invalid={!!error || undefined}
          />
        </div>
        <FieldError id={errorId}>{error}</FieldError>
        <Button type="submit" size="block" className="mt-2" disabled={register.isPending}>
          {register.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {register.isPending ? t('auth.creating') : t('auth.register')}
        </Button>
      </form>
    </AuthLayout>
  )
}
