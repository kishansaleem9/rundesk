import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, Label, cn } from '@rundesk/ui'
import { User, Lock, ShieldCheck, Bell, Globe } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { PushNotificationsPanel } from '../components/push-notifications-panel'

export const Route = createFileRoute('/app/profile')({
  component: ProfilePage,
})

type Profile = {
  id: string
  email: string
  displayName: string
  avatarUrl?: string | null
  bio?: string | null
  timezone: string
  role: string
  emailVerified: boolean
}

const TABS = [
  { id: 'general', label: 'General', icon: User },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'notifications', label: 'Notifications', icon: Bell },
] as const

function ProfilePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('general')
  const profileQuery = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => api<Profile>('/users/me'),
  })

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">Account</div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Your profile</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage how others see you and how you sign in.
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto grid grid-cols-[200px_1fr] gap-8">
          <nav className="space-y-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  tab === t.id ? 'bg-accent/15 text-foreground font-medium' : 'hover:bg-surface-50 text-muted-foreground',
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </nav>

          <div>
            {profileQuery.isLoading && <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>}
            {profileQuery.data && tab === 'general' && <GeneralTab profile={profileQuery.data} />}
            {profileQuery.data && tab === 'security' && <SecurityTab />}
            {tab === 'notifications' && <NotificationsTab />}
          </div>
        </div>
      </div>
    </div>
  )
}

function GeneralTab({ profile }: { profile: Profile }) {
  const qc = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [timezone, setTimezone] = useState(profile.timezone)

  useEffect(() => {
    setDisplayName(profile.displayName)
    setBio(profile.bio ?? '')
    setTimezone(profile.timezone)
  }, [profile])

  const save = useMutation({
    mutationFn: () =>
      api<Profile>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ displayName, bio, timezone }),
      }),
    onSuccess: (updated) => {
      qc.setQueryData(['users', 'me'], updated)
      setUser({ id: updated.id, email: updated.email, displayName: updated.displayName, role: updated.role as string })
    },
  })

  const dirty =
    displayName !== profile.displayName ||
    (bio || '') !== (profile.bio ?? '') ||
    timezone !== profile.timezone

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-brand-700 text-white flex items-center justify-center text-xl font-semibold">
          {profile.displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="text-base font-semibold">{profile.displayName}</div>
          <div className="text-sm text-muted-foreground">{profile.email}</div>
          <div className="text-xs text-muted-foreground mt-0.5 capitalize">{profile.role.replace('_', ' ')}</div>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="displayName">Display name</Label>
        <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="bio">Bio</Label>
        <textarea
          id="bio"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="A short blurb your teammates will see."
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="timezone">Timezone</Label>
        <Input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="UTC" />
        <p className="text-xs text-muted-foreground">e.g. America/New_York, Asia/Karachi, Europe/London.</p>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border">
        <span className="text-xs text-muted-foreground">
          {save.isSuccess && 'Saved.'}
          {save.error instanceof ApiError && <span className="text-destructive">{save.error.message}</span>}
        </span>
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} size="sm">
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Card>
  )
}

function SecurityTab() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const change = useMutation({
    mutationFn: () =>
      api('/users/me/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      }),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setConfirm('')
    },
  })

  const valid = current.length >= 1 && next.length >= 8 && next === confirm

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <h2 className="font-semibold mb-1">Change password</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Use at least 8 characters. Mix letters, numbers, and symbols.
        </p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Current password</Label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>New password</Label>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Confirm new password</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {next && confirm && next !== confirm && (
              <p className="text-xs text-destructive">Passwords don't match.</p>
            )}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs">
              {change.isSuccess && <span className="text-emerald-600">Password updated.</span>}
              {change.error instanceof ApiError && <span className="text-destructive">{change.error.message}</span>}
            </span>
            <Button onClick={() => change.mutate()} disabled={!valid || change.isPending} size="sm">
              {change.isPending ? 'Updating…' : 'Update password'}
            </Button>
          </div>
        </div>
      </Card>

      <TotpCard />

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold mb-1 flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              Active sessions
            </h2>
            <p className="text-sm text-muted-foreground">
              See where you're signed in and sign out of other devices.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled>Manage (coming soon)</Button>
        </div>
      </Card>
    </div>
  )
}

function TotpCard() {
  const qc = useQueryClient()
  const [step, setStep] = useState<'idle' | 'setup' | 'verify' | 'done' | 'backup'>('idle')
  const [setupData, setSetupData] = useState<{ qrCodeUrl: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])

  const statusQuery = useQuery({
    queryKey: ['totp-status'],
    queryFn: () => api<{ enabled: boolean }>('/security/totp/status'),
    retry: false,
  })

  const setupMutation = useMutation({
    mutationFn: () => api<{ qrCodeUrl: string; secret: string; otpauthUrl: string }>('/security/totp/setup', { method: 'POST' }),
    onSuccess: (data) => {
      setSetupData(data)
      setStep('setup')
    },
  })

  const verifyMutation = useMutation({
    mutationFn: () => api<{ backupCodes: string[] }>('/security/totp/verify', { method: 'POST', body: { code } }),
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes)
      setStep('backup')
      qc.invalidateQueries({ queryKey: ['totp-status'] })
    },
  })

  const disableMutation = useMutation({
    mutationFn: () => api('/security/totp/disable', { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['totp-status'] })
      setStep('idle')
      setSetupData(null)
      setCode('')
    },
  })

  const enabled = statusQuery.data?.enabled

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold mb-1 flex items-center gap-2">
            <ShieldCheck className={cn('h-4 w-4', enabled ? 'text-emerald-600' : 'text-muted-foreground')} />
            Two-factor authentication
            {enabled && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Enabled</span>}
          </h2>
          <p className="text-sm text-muted-foreground">
            Add an extra layer of security with a TOTP authenticator app (Google Authenticator, Authy, etc.).
          </p>
        </div>
        {!enabled && step === 'idle' && (
          <Button variant="outline" size="sm" onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending}>
            {setupMutation.isPending ? 'Loading…' : 'Set up 2FA'}
          </Button>
        )}
        {enabled && (
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => disableMutation.mutate()} disabled={disableMutation.isPending}>
            Disable
          </Button>
        )}
      </div>

      {step === 'setup' && setupData && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium">Scan with your authenticator app:</p>
          <img src={setupData.qrCodeUrl} alt="TOTP QR code" className="h-40 w-40 border border-border rounded" />
          <p className="text-xs text-muted-foreground">Can't scan? Enter this code manually: <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{setupData.secret}</code></p>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              maxLength={6}
              className="w-36"
              onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) verifyMutation.mutate() }}
            />
            <Button size="sm" onClick={() => verifyMutation.mutate()} disabled={code.length !== 6 || verifyMutation.isPending}>
              {verifyMutation.isPending ? 'Verifying…' : 'Verify'}
            </Button>
          </div>
          {verifyMutation.isError && <p className="text-xs text-destructive">Invalid code. Try again.</p>}
        </div>
      )}

      {step === 'backup' && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <p className="text-sm font-semibold text-emerald-600">2FA enabled! Save your backup codes:</p>
          <p className="text-xs text-muted-foreground">These one-time backup codes can be used if you lose access to your authenticator app. Store them securely.</p>
          <div className="grid grid-cols-2 gap-1">
            {backupCodes.map((c) => (
              <code key={c} className="bg-muted px-2 py-1 rounded text-xs font-mono">{c}</code>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setStep('idle')}>Done</Button>
        </div>
      )}
    </Card>
  )
}

function NotificationsTab() {
  return <PushNotificationsPanel />
}
