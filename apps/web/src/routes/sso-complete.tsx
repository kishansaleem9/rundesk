import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { LogoWordmark } from '@rundesk/ui'
import { ShieldCheck, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { api, ApiError } from '../lib/api'
import { reconnectRealtime } from '../lib/realtime'

export const Route = createFileRoute('/sso-complete' as any)({
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
      const hash = window.location.hash.replace(/^#/, '')
      if (!hash) {
        setError('Missing SSO response')
        return
      }
      const params = new URLSearchParams(hash)
      const refreshToken = params.get('refreshToken')
      const workspaceId = params.get('workspaceId')
      if (!refreshToken) {
        setError('SSO response is missing tokens')
        return
      }
      window.history.replaceState({}, '', '/sso-complete')

      try {
        // Exchange the SSO-issued refresh token for a full login bundle. This
        // rotates the refresh token (the original is invalidated) and returns
        // the same payload shape as POST /auth/login, including orgs and
        // workspaces, so the auth store hydrates the same way as a password
        // sign-in.
        const bundle = await api<LoginBundle>('/auth/refresh', {
          method: 'POST',
          body: { refreshToken },
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
