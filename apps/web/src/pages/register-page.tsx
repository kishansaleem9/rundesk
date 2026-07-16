import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  LogoWordmark,
} from '@rundesk/ui'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { useTranslation } from '../lib/i18n'
import { LanguageSwitcher } from '../components/language-switcher'

type RegisterResponse = {
  accessToken: string
  refreshToken: string
  user: { id: string; email: string; displayName: string; role: string }
  workspaces: Array<{ id: string; name: string; slug: string; role: string }>
}

export function RegisterPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const setSession = useAuthStore((s) => s.setSession)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await api<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ displayName, email, password }),
      })
      setSession(data.user, data.accessToken, data.refreshToken)
      navigate({ to: '/app' })
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 429 ? t('auth.tooManyAttempts') : err.message) : t('auth.registrationFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-50 via-brand-200/40 to-brand-300/30 p-4">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <LogoWordmark />
          <LanguageSwitcher />
        </div>

        <Card className="border-brand-200/80 shadow-xl shadow-brand-500/10">
          <CardHeader className="space-y-2 text-center">
            <CardTitle>{t('auth.signUpTitle')}</CardTitle>
            <CardDescription>
              {t('auth.registerSubtitle')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">{t('auth.displayName')}</Label>
                <Input
                  id="displayName"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('auth.displayNamePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('auth.creatingAccount') : t('auth.createAccount')}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {t('auth.haveAccount')}{' '}
              <Link
                to="/login"
                className="font-medium text-primary hover:underline"
              >
                {t('auth.signInLink')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
