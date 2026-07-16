import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { LogoWordmark } from '@rundesk/ui'
import { ShieldCheck, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { api, ApiError } from '../lib/api'
import { reconnectRealtime } from '../lib/realtime'

export const Route = createFileRoute('/sso-complete')({
  component: SsoCompletePage,
})

type LoginBundle = {
  accessToken: string
  refreshToken: string
  user: { id: string; email: string; displayName: string; role: string }
  organizations: Array<{ id: string; name: string; slug: string; role: string }>
  workspaces: Array<{ id: string; name: string; slug: string; organizationId: string; role: string }>
}

function SsoCompletePage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const finalize = async () => {
      // The API set httpOnly session cookies (access + refresh) and the CSRF
      // cookie before redirecting here — tokens are NO LONGER in the URL hash.
      // Only the target workspace comes through as a query param.
      const workspaceId = new URLSearchParams(window.location.search).get('workspaceId')

      try {
        // Exchange the cookie session for a full login bundle. Refresh rotates
        // the SSO-issued refresh token and returns the same payload shape as
        // POST /auth/login (user + orgs + workspaces) so the store hydrates the
        // same way as a password sign-in. The refresh_token cookie is read
        // server-side (no body token needed); credentials + the CSRF header are
        // attached by the api() layer.
        const bundle = await api<LoginBundle>('/auth/refresh', {
          method: 'POST',
          body: {},
          skipAuth: true,
        })
        setSession(
          bundle.user,
          bundle.accessToken,
          bundle.refreshToken,
          bundle.organizations ?? [],
          bundle.workspaces ?? [],
        )
        reconnectRealtime()
        if (workspaceId) {
          navigate({ to: '/app/$workspaceId', params: { workspaceId } as any })
        } else {
          navigate({ to: '/app' })
        }
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : 'Failed to finalize SSO sign-in'
        setError(message)
      }
    }
    void finalize()
  }, [navigate, setSession])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="bg-aurora pointer-events-none absolute inset-0" />
      <div className="relative z-10 flex flex-col items-center gap-6 max-w-md text-center">
        <LogoWordmark gradient />
        {error ? (
          <>
            <AlertTriangle className="h-10 w-10 text-amber-400" />
            <h1 className="font-display text-2xl font-semibold">Sign-in failed</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <a className="text-sm text-foreground underline" href="/login">
              Return to sign in
            </a>
          </>
        ) : (
          <>
            <ShieldCheck className="h-10 w-10 text-emerald-400 animate-pulse" />
            <h1 className="font-display text-2xl font-semibold">Finishing sign-in…</h1>
            <p className="text-sm text-muted-foreground">
              We are securing your session and pulling your workspaces.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
