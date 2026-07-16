import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Button,
  Input,
  Label,
  LogoWordmark,
  Separator,
} from '@rundesk/ui'
import { Mail, Lock, ArrowRight, ShieldCheck, KeyRound } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { PasswordChecklist, passwordPolicyError } from '../lib/password'
import { useAuthStore } from '../store/auth'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { LanguageSwitcher } from '../components/language-switcher'
import { CustomDomainBrandMark } from '../components/custom-domain-mark'

type SsoLookupResponse = {
  connection: { workspaceId: string; provider: 'oidc' | 'saml'; displayName: string } | null
}

// Per-field validation helpers — return a translation key, or null when valid.
// The caller resolves the key with t(...) at the display site.
const EMAIL_RE = /^.+@.+\..+$/

function validateEmail(value: string): TranslationKey | null {
  const v = value.trim()
  if (!v) return 'auth.emailRequired'
  if (!EMAIL_RE.test(v)) return 'auth.emailInvalid'
  return null
}

function validatePassword(value: string): TranslationKey | null {
  if (!value) return 'auth.passwordRequired'
  return null
}

function validateNewPassword(value: string): string | null {
  return passwordPolicyError(value)
}

function validateConfirmPassword(value: string, original: string): TranslationKey | null {
  if (!value) return 'auth.confirmPasswordRequired'
  if (value !== original) return 'auth.passwordsMismatch'
  return null
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null
  return <p className="text-xs text-destructive">{message}</p>
}

type LoginResponse = {
  accessToken: string
  refreshToken: string
  user: { id: string; email: string; displayName: string; role: string }
  organizations: Array<{ id: string; name: string; slug: string; role: string }>
  workspaces: Array<{ id: string; name: string; slug: string; organizationId: string; role: string }>
}

export function LoginPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { setSession } = useAuthStore()
  const searchParams = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  )
  const resetToken = searchParams.get('token') ?? ''
  const nextUrl = searchParams.get('next') ?? ''
  const mode = searchParams.get('mode') === 'forgot' ? 'forgot' : resetToken ? 'reset' : 'login'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [ssoHint, setSsoHint] = useState<SsoLookupResponse['connection']>(null)
  // Optimistically show both social buttons; the providers probe below hides any
  // that the backend reports as unconfigured. If the probe fails we degrade
  // gracefully by leaving both visible (an unconfigured click just bounces back).
  const [oauthProviders, setOauthProviders] = useState<{ google: boolean; microsoft: boolean }>({
    google: true,
    microsoft: true,
  })
  const [touched, setTouched] = useState({
    email: false,
    password: false,
    newPassword: false,
    confirmPassword: false,
  })

  const emailError = validateEmail(email)
  const passwordError = validatePassword(password)
  const newPasswordError = validateNewPassword(newPassword)
  const confirmPasswordError = validateConfirmPassword(confirmPassword, newPassword)
  const showSeededLogins =
    import.meta.env.DEV ||
    String(import.meta.env.VITE_SHOW_SEEDED_LOGINS).toLowerCase() === 'true'

  // Surface SSO / OAuth errors propagated back from a provider callback redirect.
  useEffect(() => {
    const ssoError = searchParams.get('ssoError')
    const oauthError = searchParams.get('error')
    if (ssoError) {
      setError(ssoError)
      window.history.replaceState({}, '', '/login')
    } else if (oauthError) {
      // Backend uses short codes (e.g. oauth_unconfigured); show a generic
      // localized failure rather than the raw code.
      setError(t('auth.loginFailed'))
      window.history.replaceState({}, '', '/login')
    }
  }, [searchParams, t])

  // Probe which social login providers are configured (env creds present) so we
  // only render buttons that can actually complete a sign-in.
  useEffect(() => {
    let cancelled = false
    api<{ google: boolean; microsoft: boolean }>('/auth/oauth/providers', {
      method: 'GET',
      skipAuth: true,
    })
      .then((res) => {
        if (!cancelled) setOauthProviders(res)
      })
      .catch(() => {
        /* degrade gracefully — leave both buttons visible */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced lookup: ask whether the email domain has SSO enforced.
  useEffect(() => {
    if (mode !== 'login' || !email.includes('@')) {
      setSsoHint(null)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api<SsoLookupResponse>(
          `/auth/sso/lookup?email=${encodeURIComponent(email)}`,
          { method: 'GET', skipAuth: true },
        )
        setSsoHint(res.connection)
      } catch {
        setSsoHint(null)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [email, mode])

  function startSso() {
    if (!ssoHint) return
    const params = new URLSearchParams({ workspaceId: ssoHint.workspaceId })
    if (nextUrl) params.set('redirectTo', nextUrl)
    window.location.href = `/api/v1/auth/sso/${ssoHint.provider}/start?${params.toString()}`
  }

  // Full-page redirect into the backend OAuth start route (same /api/v1 base the
  // rest of the app uses). The backend bounces the browser to the provider, then
  // back to /sso-complete with the session already set as cookies.
  function startOAuth(provider: 'google' | 'microsoft') {
    window.location.href = `/api/v1/auth/oauth/${provider}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      
      setSession(data.user, data.accessToken, data.refreshToken, data.organizations, data.workspaces)

      if (nextUrl && nextUrl.startsWith('/')) {
        window.location.href = nextUrl
      } else if (data.user.role === 'super_admin') {
        navigate({ to: '/app/admin' })
      } else {
        navigate({ to: '/app' })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: { email },
        skipAuth: true,
      })
      setNotice(t('auth.resetLinkSent'))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.resetLinkFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!resetToken) {
      setError(t('auth.missingResetToken'))
      return
    }
    // Surface field-level problems inline rather than in the shared block.
    if (newPasswordError || confirmPasswordError) {
      setTouched((prev) => ({ ...prev, newPassword: true, confirmPassword: true }))
      return
    }
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: { token: resetToken, password: newPassword },
        skipAuth: true,
      })
      setNotice(t('auth.passwordUpdated'))
      window.history.replaceState({}, '', '/login')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.resetPasswordFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Aurora background */}
      <div className="bg-aurora pointer-events-none absolute inset-0" />
      <div className="bg-grid-dim pointer-events-none absolute inset-0 opacity-30" />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1fr_minmax(420px,520px)]">
        {/* Left brand panel — hidden on small screens */}
        <div className="hidden flex-col justify-between p-12 lg:flex">
          <div className="space-y-6">
            <LogoWordmark gradient />
            {/* Co-branding when served from a verified custom domain */}
            <CustomDomainBrandMark />
          </div>

          <div className="max-w-md space-y-6 animate-fade-in">
            <h1 className="font-display text-5xl font-semibold leading-tight tracking-tight">
              {t('auth.heroTitle1')}
              <br />
              <span className="text-brand-gradient">{t('auth.heroTitle2')}</span>
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              {t('auth.heroDesc')}
            </p>

            <ul className="space-y-3 pt-2 text-sm text-muted-foreground">
              {[t('auth.heroFeature1'), t('auth.heroFeature2'), t('auth.heroFeature3')].map((line) => (
                <li key={line} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-gradient text-[10px] text-white">
                    ✓
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t('auth.heroSecurity')}
          </div>
        </div>

        {/* Right form */}
        <div className="relative flex flex-col items-center justify-center px-6 py-12 sm:px-12">
          <div className="absolute right-4 top-4 rtl:right-auto rtl:left-4">
            <LanguageSwitcher />
          </div>
          <div className="w-full max-w-sm space-y-7 animate-slide-up">
            <div className="flex flex-col items-center gap-2 lg:hidden">
              <LogoWordmark gradient />
              <CustomDomainBrandMark className="items-center text-center" />
            </div>

            <header className="space-y-1.5">
              <h2 className="font-display text-3xl font-semibold tracking-tight">
                {t('auth.signInTitle')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {mode === 'forgot'
                  ? t('auth.forgotSubtitle')
                  : mode === 'reset'
                    ? t('auth.resetSubtitle')
                    : t('auth.loginSubtitle')}
              </p>
            </header>

            {/* SSO buttons */}
            <div className="grid gap-2">
              {ssoHint && (
                <Button
                  variant="gradient"
                  size="lg"
                  className="w-full justify-center"
                  onClick={startSso}
                  type="button"
                >
                  <KeyRound className="h-4 w-4" />
                  {t('auth.continueWithProvider', { provider: ssoHint.displayName })}
                </Button>
              )}
              {oauthProviders.google && (
                <Button
                  variant="glass"
                  size="lg"
                  className="w-full justify-center"
                  type="button"
                  onClick={() => startOAuth('google')}
                >
                  <GoogleIcon />
                  {t('auth.continueWithGoogle')}
                </Button>
              )}
              {oauthProviders.microsoft && (
                <Button
                  variant="glass"
                  size="lg"
                  className="w-full justify-center"
                  type="button"
                  onClick={() => startOAuth('microsoft')}
                >
                  <MicrosoftIcon />
                  {t('auth.continueWithMicrosoft')}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground/70">
              <Separator className="flex-1" />
              {t('auth.orWithEmail')}
              <Separator className="flex-1" />
            </div>

            <form
              onSubmit={
                mode === 'forgot'
                  ? handleForgotSubmit
                  : mode === 'reset'
                    ? handleResetSubmit
                    : handleSubmit
              }
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  leadingIcon={<Mail className="h-4 w-4" />}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                  aria-invalid={mode !== 'reset' && touched.email && emailError ? true : undefined}
                  placeholder={t('auth.emailPlaceholder')}
                  disabled={mode === 'reset'}
                />
                {mode !== 'reset' && touched.email && <FieldError message={emailError ? t(emailError) : null} />}
              </div>

              {mode === 'login' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">{t('auth.password')}</Label>
                    <a
                      href="/login?mode=forgot"
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t('auth.forgotShort')}
                    </a>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    leadingIcon={<Lock className="h-4 w-4" />}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                    aria-invalid={touched.password && passwordError ? true : undefined}
                    placeholder="••••••••"
                  />
                  {touched.password && <FieldError message={passwordError ? t(passwordError) : null} />}
                </div>
              )}

              {mode === 'reset' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">{t('auth.newPassword')}</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      leadingIcon={<Lock className="h-4 w-4" />}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      onBlur={() => setTouched((prev) => ({ ...prev, newPassword: true }))}
                      aria-invalid={touched.newPassword && newPasswordError ? true : undefined}
                      placeholder={t('auth.newPasswordPlaceholder')}
                    />
                    <PasswordChecklist value={newPassword} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">{t('auth.confirmPassword')}</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      leadingIcon={<Lock className="h-4 w-4" />}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
                      aria-invalid={touched.confirmPassword && confirmPasswordError ? true : undefined}
                      placeholder={t('auth.confirmPasswordPlaceholder')}
                    />
                    {touched.confirmPassword && <FieldError message={confirmPasswordError ? t(confirmPasswordError) : null} />}
                  </div>
                </>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
                  {error}
                </div>
              )}
              {notice && (
                <div className="rounded-lg border border-border/70 bg-card/40 px-3 py-2 text-xs text-muted-foreground" role="status">
                  {notice}
                </div>
              )}

              <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={loading}>
                {loading
                  ? mode === 'login'
                    ? t('auth.signingIn')
                    : mode === 'forgot'
                      ? t('auth.sending')
                      : t('auth.updating')
                  : mode === 'login'
                    ? t('auth.signIn')
                    : mode === 'forgot'
                      ? t('auth.sendResetLink')
                      : t('auth.updatePassword')}
                {!loading && mode === 'login' && <ArrowRight className="h-4 w-4 rtl:rotate-180" />}
              </Button>

              {showSeededLogins && (
                <div className="rounded-lg border border-border/70 bg-card/40 p-3 text-xs space-y-2">
                  <div className="font-medium text-foreground">{t('auth.seededLogins')}</div>
                  <div className="text-muted-foreground">
                    {t('topbar.superAdmin')}: <span className="text-foreground">admin@rundesk.internal / Admin@123!</span>
                  </div>
                  <div className="text-muted-foreground">
                    {t('auth.seededOrgAdmin')}: <span className="text-foreground">org-admin@rundesk.internal / OrgAdmin@123!</span>
                  </div>
                </div>
              )}
            </form>

            <p className="text-center text-sm text-muted-foreground">
              {mode === 'login' ? (
                <>
                  {t('auth.newToRundesk')}{' '}
                  <Link
                    to="/sign-up"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {t('auth.createWorkspace')}
                  </Link>
                </>
              ) : (
                <a href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
                  {t('auth.backToLogin')}
                </a>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.8h5.4c-.2 1.4-1.7 4-5.4 4-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3.1.8 3.8 1.4l2.6-2.5C16.7 3.5 14.6 2.5 12 2.5 6.7 2.5 2.5 6.8 2.5 12s4.2 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6 0-1.1-.1-1.6L12 10.2z" />
      <path fill="#34A853" d="M3.6 7.6l3.1 2.3C7.6 8 9.6 6 12 6c1.8 0 3.1.8 3.8 1.4l2.6-2.5C16.7 3.5 14.6 2.5 12 2.5 8.4 2.5 5.3 4.5 3.6 7.6z" />
      <path fill="#FBBC04" d="M12 21.5c2.6 0 4.7-.9 6.3-2.3l-3-2.4c-.8.6-2 1.2-3.3 1.2-2.7 0-4.9-1.7-5.7-4.1l-3.1 2.4c1.5 3 4.7 5.2 8.8 5.2z" />
      <path fill="#4285F4" d="M21.1 12.2c0-.6 0-1.1-.1-1.6H12v3.8h5.4c-.2 1.4-1.7 4-5.4 4l3 2.4c2.4-2.2 3.9-5.4 3.9-8.6z" />
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#F25022" d="M3 3h8v8H3z" />
      <path fill="#7FBA00" d="M13 3h8v8h-8z" />
      <path fill="#00A4EF" d="M3 13h8v8H3z" />
      <path fill="#FFB900" d="M13 13h8v8h-8z" />
    </svg>
  )
}
