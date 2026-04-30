import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  Button,
  Input,
  Label,
  LogoWordmark,
  Separator,
} from '@rundesk/ui'
import { Mail, Lock, ArrowRight, ShieldCheck } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../store/auth'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

type LoginResponse = {
  accessToken: string
  refreshToken: string
  user: { id: string; email: string; displayName: string; role: string }
  workspaces: Array<{ id: string; name: string; slug: string; role: string }>
}

function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const showSeededLogins =
    import.meta.env.DEV ||
    String(import.meta.env.VITE_SHOW_SEEDED_LOGINS).toLowerCase() === 'true'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setSession(data.user, data.accessToken, data.refreshToken)
      if (data.user.role === 'super_admin') {
        navigate({ to: '/app/admin' })
      } else {
        navigate({ to: '/app' })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed')
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
          <LogoWordmark gradient />

          <div className="max-w-md space-y-6 animate-fade-in">
            <h1 className="font-display text-5xl font-semibold leading-tight tracking-tight">
              Run work
              <br />
              <span className="text-brand-gradient">the way it should feel.</span>
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              Rundesk brings every task, doc, and conversation into one calm place —
              powered by Claude, designed for teams who care about the details.
            </p>

            <ul className="space-y-3 pt-2 text-sm text-muted-foreground">
              {[
                'AI agents trained on your workspace',
                'Real-time collaboration with your team',
                'Every feature, exactly when you need it',
              ].map((line) => (
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
            SOC 2 Type II · Data residency in your region · Encrypted at rest
          </div>
        </div>

        {/* Right form */}
        <div className="flex flex-col items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-sm space-y-7 animate-slide-up">
            <div className="flex flex-col items-center gap-2 lg:hidden">
              <LogoWordmark gradient />
            </div>

            <header className="space-y-1.5">
              <h2 className="font-display text-3xl font-semibold tracking-tight">
                Welcome back
              </h2>
              <p className="text-sm text-muted-foreground">
                Sign in to keep work flowing.
              </p>
            </header>

            {/* SSO buttons */}
            <div className="grid gap-2">
              <Button variant="glass" size="lg" className="w-full justify-center">
                <GoogleIcon />
                Continue with Google
              </Button>
              <Button variant="glass" size="lg" className="w-full justify-center">
                <MicrosoftIcon />
                Continue with Microsoft
              </Button>
            </div>

            <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground/70">
              <Separator className="flex-1" />
              or with email
              <Separator className="flex-1" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  leadingIcon={<Mail className="h-4 w-4" />}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    to="/login"
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Forgot?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  leadingIcon={<Lock className="h-4 w-4" />}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
                  {error}
                </div>
              )}

              <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>

              {showSeededLogins && (
                <div className="rounded-lg border border-border/70 bg-card/40 p-3 text-xs space-y-2">
                  <div className="font-medium text-foreground">Seeded test logins</div>
                  <div className="text-muted-foreground">
                    Super admin: <span className="text-foreground">admin@rundesk.internal / Admin@123!</span>
                  </div>
                  <div className="text-muted-foreground">
                    Organization admin: <span className="text-foreground">org-admin@rundesk.internal / OrgAdmin@123!</span>
                  </div>
                </div>
              )}
            </form>

            <p className="text-center text-sm text-muted-foreground">
              New to Rundesk?{' '}
              <Link
                to="/sign-up"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Create your workspace
              </Link>
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
