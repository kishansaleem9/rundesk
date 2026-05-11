import { useState, useEffect } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { 
  Button, 
  Input, 
  Label, 
  LogoWordmark, 
  PersonAvatar, 
  toast
} from '@rundesk/ui'
import { 
  Check, 
  ArrowRight, 
  ShieldCheck, 
  Lock, 
  User,
  Mail,
  Calendar,
  Loader2,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'

export const Route = createFileRoute('/accept-invite')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  component: AcceptInvite,
})

type InvitePreview = {
  orgName: string
  inviterName: string
  email: string
  expiresAt: string
  requiresAccountCreation: boolean
}

type ClaimResponse = {
  accessToken: string
  refreshToken: string
  user: { id: string; email: string; displayName: string; role: string }
  organizations: Array<{ id: string; name: string; slug: string; role: string }>
  workspaces: Array<{ id: string; name: string; slug: string; organizationId: string; role: string }>
}

function AcceptInvite() {
  const navigate = useNavigate()
  const { token } = Route.useSearch()
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [invite, setInvite] = useState<InvitePreview | null>(null)
  
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')

  const { isAuthenticated, setSession } = useAuthStore()

  useEffect(() => {
    if (!token) {
      toast.error('Missing invitation token')
      navigate({ to: '/login' })
      return
    }

    async function fetchPreview() {
      try {
        const data = await api<InvitePreview>(`/invitations/preview?token=${token}`, { skipAuth: true })
        setInvite(data)
      } catch (err: any) {
        toast.error('Invalid invitation', { description: err.message })
        navigate({ to: '/login' })
      } finally {
        setLoading(false)
      }
    }

    fetchPreview()
  }, [token, navigate])

  async function handleClaim() {
    if (!invite?.requiresAccountCreation && !isAuthenticated()) {
      toast.info('Please sign in first to accept this invite')
      window.location.href = `/login?next=${encodeURIComponent(`/accept-invite?token=${token}`)}`
      return
    }

    setClaiming(true)
    try {
      const session = await api<ClaimResponse>('/invitations/claim', {
        method: 'POST',
        body: {
          token,
          fullName: invite?.requiresAccountCreation ? fullName : undefined,
          password: invite?.requiresAccountCreation ? password : undefined,
        },
      })

      setSession(
        session.user,
        session.accessToken,
        session.refreshToken,
        session.organizations,
        session.workspaces,
      )

      toast.success('Invitation accepted!')
      const wsId = session.workspaces[0]?.id
      if (wsId) navigate({ to: '/app/$workspaceId', params: { workspaceId: wsId } })
      else navigate({ to: '/login' })
    } catch (err: any) {
      toast.error('Failed to accept invitation', { description: err.message })
    } finally {
      setClaiming(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!invite) return null

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="bg-aurora pointer-events-none absolute inset-0" />
      <div className="bg-grid-dim pointer-events-none absolute inset-0 opacity-30" />

      <header className="relative z-10 flex items-center justify-center p-8">
        <LogoWordmark gradient />
      </header>

      <main className="relative z-10 mx-auto flex max-w-md flex-col gap-6 px-6 pb-20 pt-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-glass space-y-8 p-8"
        >
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient shadow-glow">
              <Check className="h-8 w-8 text-white" />
            </div>
            <div className="space-y-1.5">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                You&apos;re invited!
              </h1>
              <p className="text-sm text-muted-foreground">
                <strong>{invite.inviterName}</strong> invited you to join <strong>{invite.orgName}</strong> on Rundesk.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">{invite.email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
            </div>
          </div>

          {invite.requiresAccountCreation ? (
            <div className="space-y-4 pt-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Create your account to join
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    placeholder="Ada Lovelace"
                    leadingIcon={<User className="h-4 w-4" />}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Create a password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    leadingIcon={<Lock className="h-4 w-4" />}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-sm text-blue-200">
              You already have an account with this email. Click accept to join the organization.
            </div>
          )}

          <Button
            variant="gradient"
            size="lg"
            className="w-full"
            onClick={handleClaim}
            disabled={claiming || (invite.requiresAccountCreation && (!fullName || password.length < 8))}
          >
            {claiming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Joining...
              </>
            ) : (
              <>
                Accept Invitation
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </motion.div>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-3 w-3" /> Secure invitation link valid for 7 days.
        </p>
      </main>
    </div>
  )
}
