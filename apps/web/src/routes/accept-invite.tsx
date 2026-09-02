import { useState, useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { 
  Button, 
  Input, 
  Label, 
  LogoWordmark,
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
  LifeBuoy,
} from 'lucide-react'
import { api } from '../lib/api'
import { PasswordChecklist, isPasswordStrong } from '../lib/password'
import { useAuthStore } from '../store/auth'
import { useTranslation } from '../lib/i18n'
import { supportMailto } from '../lib/support'

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

/**
 * G01-6 [00:18] — the "Need help?" link at the foot of ClickUp's join page.
 *
 * The invitation screen is the one screen in the product reached by somebody
 * who has no account, so the SupportWidget — mounted inside the authenticated
 * shell — is not available to exactly the person most likely to be stuck. This
 * is that person's only way to reach a human, so it appears on every state of
 * this route, including the two dead ends.
 *
 * The mailto carries the reason in its subject; someone who could not get in
 * should not also have to explain the category of their problem.
 */
function NeedHelp({ reason }: { reason: string }) {
  const { t } = useTranslation()
  return (
    <a
      href={supportMailto(reason)}
      data-testid="invite-help"
      className="inline-flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <LifeBuoy className="h-3 w-3" />
      {t('acceptInvite.needHelp')}
    </a>
  )
}

function AcceptInvite() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token } = Route.useSearch()
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [invite, setInvite] = useState<InvitePreview | null>(null)
  
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')

  const { isAuthenticated, setSession } = useAuthStore()

  useEffect(() => {
    if (!token) {
      toast.error(t('acceptInvite.missingToken'))
      navigate({ to: '/login' })
      return
    }

    async function fetchPreview() {
      try {
        const data = await api<InvitePreview>(`/invitations/preview?token=${token}`, { skipAuth: true })
        setInvite(data)
      } catch (err: any) {
        /*
         * G01-6 — this used to toast and redirect to /login.
         *
         * Which means the one person who genuinely needs help — their link
         * expired, or the URL got mangled by their mail client — was bounced
         * to a sign-in form for an account they do not have, with the
         * explanation already fading out of the corner of the screen. Stay
         * put, say what happened, and offer the way to a human.
         */
        setPreviewError(err?.message ?? '')
      } finally {
        setLoading(false)
      }
    }

    fetchPreview()
  }, [token, navigate])

  /**
   * Decline, and say so plainly.
   *
   * No login required — the person declining is exactly the person who is not
   * about to make an account — and the screen then STAYS on a declined state
   * rather than bouncing to a login they never wanted. Idempotent server-side,
   * so pressing it twice is somebody making sure, not an error.
   */
  async function handleDecline() {
    if (!token) return
    setDeclining(true)
    try {
      await api('/invitations/decline', { method: 'POST', body: { token } })
      setDeclined(true)
      toast.success(t('acceptInvite.declinedToast'))
    } catch (err: any) {
      toast.error(t('acceptInvite.declineFailed'), { description: err?.message })
    } finally {
      setDeclining(false)
    }
  }

  async function handleClaim() {
    if (!invite?.requiresAccountCreation && !isAuthenticated()) {
      toast.info(t('acceptInvite.signInFirst'))
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

      toast.success(t('acceptInvite.acceptedToast'))
      const wsId = session.workspaces[0]?.id
      if (wsId) navigate({ to: '/app/$workspaceId', params: { workspaceId: wsId } })
      else navigate({ to: '/login' })
    } catch (err: any) {
      toast.error(t('acceptInvite.failedToast'), { description: err.message })
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

  /*
   * The invitation could not be read. A named dead end beats a silent one: it
   * says which of the two things went wrong (expired, or not a real link), it
   * keeps the server's reason rather than swallowing it, and it offers both
   * ways forward — ask for a new invitation, or sign in if you already have an
   * account here.
   */
  if (previewError !== null || !invite) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background">
        <div className="bg-aurora pointer-events-none absolute inset-0" />
        <header className="relative z-10 flex items-center justify-center p-8">
          <LogoWordmark gradient />
        </header>
        <main className="relative z-10 mx-auto flex max-w-md flex-col gap-6 px-6 pb-20 pt-4">
          <div className="card-glass space-y-4 p-8 text-center" data-testid="invite-unusable">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {t('acceptInvite.unusableTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('acceptInvite.unusableBody')}</p>
            {previewError && (
              <p className="text-xs text-muted-foreground/80" data-testid="invite-unusable-reason">
                {previewError}
              </p>
            )}
            <Button variant="outline" className="w-full" onClick={() => navigate({ to: '/login' })}>
              {t('acceptInvite.unusableSignIn')}
            </Button>
          </div>
          <p className="text-center">
            <NeedHelp reason={t('acceptInvite.helpSubjectUnusable')} />
          </p>
        </main>
      </div>
    )
  }

  /*
   * Declined stays on screen.
   *
   * The alternative — bouncing to the login page — sends somebody who just
   * said "I don't want this" to a form asking them to sign in, which reads as
   * the app ignoring them. This says the answer was received, and leaves the
   * door open, because people decline invitations by accident.
   */
  if (declined) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background">
        <div className="bg-aurora pointer-events-none absolute inset-0" />
        <header className="relative z-10 flex items-center justify-center p-8">
          <LogoWordmark gradient />
        </header>
        <main className="relative z-10 mx-auto flex max-w-md flex-col gap-6 px-6 pb-20 pt-4">
          <div className="card-glass space-y-4 p-8 text-center" data-testid="invite-declined">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {t('acceptInvite.declinedTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('acceptInvite.declinedBody', { org: invite.orgName })}
            </p>
          </div>
          <p className="text-center">
            <NeedHelp reason={t('acceptInvite.helpSubjectDeclined')} />
          </p>
        </main>
      </div>
    )
  }

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
                {t('acceptInvite.title')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t('acceptInvite.invitedBody', { inviter: invite.inviterName, org: invite.orgName })}
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
              <span>{t('acceptInvite.expires', { date: new Date(invite.expiresAt).toLocaleDateString() })}</span>
            </div>
          </div>

          {invite.requiresAccountCreation ? (
            <div className="space-y-4 pt-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('acceptInvite.createAccountPrompt')}
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('acceptInvite.fullName')}</Label>
                  <Input
                    id="name"
                    placeholder={t('acceptInvite.fullNamePlaceholder')}
                    leadingIcon={<User className="h-4 w-4" />}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('acceptInvite.createPassword')}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder={t('acceptInvite.passwordPlaceholder')}
                    leadingIcon={<Lock className="h-4 w-4" />}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <PasswordChecklist value={password} />
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-sm text-blue-200">
              {t('acceptInvite.existingAccount')}
            </div>
          )}

          <Button
            variant="gradient"
            size="lg"
            className="w-full"
            onClick={handleClaim}
            disabled={claiming || (invite.requiresAccountCreation && (!fullName || !isPasswordStrong(password)))}
          >
            {claiming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('acceptInvite.joining')}
              </>
            ) : (
              <>
                {t('acceptInvite.acceptButton')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          {/*
            * Saying no is an answer — `[00:18]`.
            *
            * Without this the only ways out of an invitation you did not want
            * were to accept it or to close the tab, which leaves it pending in
            * the sender's list forever and tells them nothing. Quiet by
            * design: it is the secondary action, not a second call to action.
            */}
          <button
            type="button"
            data-testid="invite-decline"
            onClick={handleDecline}
            disabled={declining || claiming}
            className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
          >
            {declining ? t('acceptInvite.declining') : t('acceptInvite.declineButton')}
          </button>
        </motion.div>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-3 w-3" /> {t('acceptInvite.secureFooter')}
        </p>

        {/* Below the fold in her frame, and below the seal here: present, not competing. */}
        <p className="text-center">
          <NeedHelp reason={t('acceptInvite.helpSubjectInvite')} />
        </p>
      </main>
    </div>
  )
}
