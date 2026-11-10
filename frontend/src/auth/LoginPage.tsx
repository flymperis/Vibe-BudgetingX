import { Loader2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { errorMessage } from '@/app/query-client'
import { FieldError } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/i18n'
import { AuthLayout } from './AuthLayout'
import { safeNext } from './next'
import { PasswordInput } from './PasswordInput'
import { useLogin, useSession } from './session'

export default function LoginPage() {
  const t = useT()
  const id = useId()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const session = useSession()
  const login = useLogin()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate(
      { username: username.trim(), password },
      { onSuccess: () => navigate(safeNext(params.get('next')), { replace: true }) },
    )
  }

  const errorId = `${id}-error`
  const error = login.isError ? errorMessage(login.error) : null

  return (
    <AuthLayout
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        session.data?.allow_registration ? (
          <>
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">
              {t('auth.register')}
            </Link>
          </>
        ) : null
      }
    >
      <form
        onSubmit={submit}
        noValidate={false}
        className="space-y-4"
        aria-describedby={error ? errorId : undefined}
      >
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error || undefined}
          />
        </div>
        <FieldError id={errorId}>{error}</FieldError>
        <Button type="submit" size="block" className="mt-2" disabled={login.isPending}>
          {login.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {login.isPending ? t('auth.signingIn') : t('auth.login')}
        </Button>
      </form>
    </AuthLayout>
  )
}
