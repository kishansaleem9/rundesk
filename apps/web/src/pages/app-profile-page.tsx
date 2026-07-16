import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, Label, PersonAvatar, cn } from '@rundesk/ui'
import { User, Lock, ShieldCheck, Bell, Globe, Camera, Trash2, CalendarClock, Monitor, Sun, Moon, Sparkles } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { useThemeStore, type Theme } from '../store/theme'
import { PushNotificationsPanel } from '../components/push-notifications-panel'
import { useTranslation, type TranslationKey } from '../lib/i18n'

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
  { id: 'general', labelKey: 'profile.tabGeneral', icon: User },
  { id: 'security', labelKey: 'profile.tabSecurity', icon: Lock },
  { id: 'notifications', labelKey: 'profile.tabNotifications', icon: Bell },
] as const

export function ProfilePage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('general')
  const profileQuery = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => api<Profile>('/users/me'),
  })

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">{t('profile.eyebrow')}</div>
        <h1 className="font-display text-2xl font-semibold text-foreground">{t('profile.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('profile.subtitle')}
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto grid grid-cols-[200px_1fr] gap-8">
          <nav className="space-y-1">
            {TABS.map((navTab) => (
              <button
                key={navTab.id}
                onClick={() => setTab(navTab.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  tab === navTab.id ? 'bg-accent/15 text-foreground font-medium' : 'hover:bg-surface-50 text-muted-foreground',
                )}
              >
                <navTab.icon className="h-4 w-4" />
                {t(navTab.labelKey)}
              </button>
            ))}
          </nav>

          <div>
            {profileQuery.isLoading && <Card className="p-6 text-sm text-muted-foreground">{t('common.loading')}</Card>}
            {profileQuery.data && tab === 'general' && <GeneralTab profile={profileQuery.data} />}
            {profileQuery.data && tab === 'security' && <SecurityTab />}
            {tab === 'notifications' && <NotificationsTab />}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Image types + size cap accepted for avatar uploads (mirrors the API). */
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const AVATAR_MAX_BYTES = 5 * 1024 * 1024 // 5 MB

/** Direct-to-R2 PUT with upload progress, mirroring the clips upload flow. */
function putFileWithProgress(args: {
  url: string
  file: File
  contentType: string
  onProgress: (percent: number) => void
}): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', args.url, true)
    xhr.setRequestHeader('Content-Type', args.contentType)
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      args.onProgress(Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100))))
    }
    xhr.onerror = () => reject(new Error('Network error while uploading image'))
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status })
    xhr.send(args.file)
  })
}

function GeneralTab({ profile }: { profile: Profile }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [timezone, setTimezone] = useState(profile.timezone)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarProgress, setAvatarProgress] = useState(0)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  useEffect(() => {
    setDisplayName(profile.displayName)
    setBio(profile.bio ?? '')
    setTimezone(profile.timezone)
  }, [profile])

  // Push a fresh profile into both the query cache and the auth store so the
  // topbar avatar updates immediately (and persists across reloads).
  function applyProfile(updated: Profile) {
    qc.setQueryData(['users', 'me'], updated)
    setUser({
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role as string,
      avatarUrl: updated.avatarUrl ?? null,
    })
  }

  const save = useMutation({
    mutationFn: () =>
      api<Profile>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ displayName, bio, timezone }),
      }),
    onSuccess: applyProfile,
  })

  const removeAvatar = useMutation({
    mutationFn: () => api<Profile>('/users/me', { method: 'PATCH', body: { avatarUrl: null } }),
    onSuccess: (updated) => {
      applyProfile(updated)
      setAvatarError(null)
    },
    onError: (err) => setAvatarError(err instanceof ApiError ? err.message : t('profile.photoUploadError')),
  })

  async function onAvatarSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = ''
    if (!file) return
    setAvatarError(null)
    if (!AVATAR_TYPES.includes(file.type)) {
      setAvatarError(t('profile.photoTypeError'))
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError(t('profile.photoSizeError'))
      return
    }
    setAvatarUploading(true)
    setAvatarProgress(0)
    try {
      const presign = await api<{ uploadUrl: string; publicUrl: string; storageKey: string }>(
        '/users/me/avatar/presign',
        { method: 'POST', body: { contentType: file.type, sizeBytes: file.size } },
      )
      const put = await putFileWithProgress({
        url: presign.uploadUrl,
        file,
        contentType: file.type,
        onProgress: setAvatarProgress,
      })
      if (!put.ok) throw new Error(`Storage upload failed (${put.status})`)
      const updated = await api<Profile>('/users/me', {
        method: 'PATCH',
        body: { avatarUrl: presign.publicUrl },
      })
      applyProfile(updated)
    } catch (err) {
      setAvatarError(err instanceof ApiError ? err.message : t('profile.photoUploadError'))
    } finally {
      setAvatarUploading(false)
      setAvatarProgress(0)
    }
  }

  const dirty =
    displayName !== profile.displayName ||
    (bio || '') !== (profile.bio ?? '') ||
    timezone !== profile.timezone

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center gap-4">
        <PersonAvatar name={profile.displayName} imageUrl={profile.avatarUrl} size="xl" />
        <div className="min-w-0">
          <div className="text-base font-semibold">{profile.displayName}</div>
          <div className="text-sm text-muted-foreground">{profile.email}</div>
          <div className="text-xs text-muted-foreground mt-0.5 capitalize">{profile.role.replace('_', ' ')}</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={onAvatarSelected}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading || removeAvatar.isPending}
            >
              <Camera className="h-3.5 w-3.5" />
              {avatarUploading
                ? t('profile.uploadingPhoto')
                : profile.avatarUrl
                  ? t('profile.changePhoto')
                  : t('profile.uploadPhoto')}
            </Button>
            {profile.avatarUrl && !avatarUploading && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => removeAvatar.mutate()}
                disabled={removeAvatar.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {removeAvatar.isPending ? t('profile.removingPhoto') : t('profile.removePhoto')}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{t('profile.photoHint')}</p>
          {avatarUploading && (
            <div className="mt-2 h-1.5 w-40 rounded bg-muted overflow-hidden">
              <div
                className="h-full bg-brand-gradient transition-[width] duration-200"
                style={{ width: `${Math.max(4, avatarProgress)}%` }}
              />
            </div>
          )}
          {avatarError && <p className="text-xs text-destructive mt-1.5">{avatarError}</p>}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="displayName">{t('profile.displayName')}</Label>
        <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="bio">{t('profile.bio')}</Label>
        <textarea
          id="bio"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={t('profile.bioPlaceholder')}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="timezone">{t('profile.timezone')}</Label>
        <Input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="UTC" />
        <p className="text-xs text-muted-foreground">{t('profile.timezoneHelp')}</p>
      </div>

      <ThemeSelector />

      <div className="flex items-center justify-between pt-3 border-t border-border">
        <span className="text-xs text-muted-foreground">
          {save.isSuccess && t('profile.saved')}
          {save.error instanceof ApiError && <span className="text-destructive">{save.error.message}</span>}
        </span>
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} size="sm">
          {save.isPending ? t('common.saving') : t('profile.saveChanges')}
        </Button>
      </div>
    </Card>
  )
}

// §13.1 — appearance/theme selector. Reads and writes the shared theme store,
// which applies the theme instantly and persists it to the server (cross-device);
// the topbar toggle stays in sync because it reads the same store.
const THEME_OPTIONS: Array<{ value: Theme; labelKey: TranslationKey; icon: typeof Monitor }> = [
  { value: 'system', labelKey: 'profile.themeSystem', icon: Monitor },
  { value: 'light', labelKey: 'profile.themeLight', icon: Sun },
  { value: 'dark', labelKey: 'profile.themeDark', icon: Moon },
]

function ThemeSelector() {
  const { t } = useTranslation()
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  return (
    <div className="space-y-1.5 pt-1">
      <Label>{t('profile.theme')}</Label>
      <p className="text-xs text-muted-foreground">{t('profile.themeDesc')}</p>
      <div className="grid grid-cols-3 gap-2 pt-1">
        {THEME_OPTIONS.map((opt) => {
          const active = theme === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-md border px-3 py-3 text-sm transition-colors',
                active ? 'border-accent bg-accent/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40',
              )}
            >
              <opt.icon className="h-4 w-4" />
              {t(opt.labelKey)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SecurityTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const clear = useAuthStore((s) => s.clear)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const sessionsQuery = useQuery({
    queryKey: ['auth-sessions', refreshToken],
    queryFn: () => api<Array<{
      id: string
      userAgent?: string | null
      ipAddress?: string | null
      isRevoked: boolean
      isCurrent: boolean
      createdAt: string
      expiresAt: string
    }>>(`/auth/sessions${refreshToken ? `?currentRefreshToken=${encodeURIComponent(refreshToken)}` : ''}`),
  })
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
  const revokeSession = useMutation({
    mutationFn: (sessionId: string) => api(`/auth/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['auth-sessions'] })
    },
  })
  const revokeOthers = useMutation({
    mutationFn: () =>
      api('/auth/sessions/revoke-others', {
        method: 'POST',
        body: { currentRefreshToken: refreshToken ?? undefined },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['auth-sessions'] })
    },
  })

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <h2 className="font-semibold mb-1">{t('profile.changePassword')}</h2>
        <p className="text-xs text-muted-foreground mb-4">
          {t('profile.passwordHint')}
        </p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t('profile.currentPassword')}</Label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('profile.newPassword')}</Label>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('profile.confirmNewPassword')}</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {next && confirm && next !== confirm && (
              <p className="text-xs text-destructive">{t('profile.passwordsMismatch')}</p>
            )}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs">
              {change.isSuccess && <span className="text-emerald-600">{t('profile.passwordUpdated')}</span>}
              {change.error instanceof ApiError && <span className="text-destructive">{change.error.message}</span>}
            </span>
            <Button onClick={() => change.mutate()} disabled={!valid || change.isPending} size="sm">
              {change.isPending ? t('profile.updating') : t('profile.updatePassword')}
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
              {t('profile.activeSessions')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('profile.sessionsSubtitle')}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => revokeOthers.mutate()}
            disabled={revokeOthers.isPending || !sessionsQuery.data?.some((s) => !s.isCurrent && !s.isRevoked)}
          >
            {revokeOthers.isPending ? t('profile.revoking') : t('profile.signOutOthers')}
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {sessionsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t('profile.loadingSessions')}</p>
          ) : (sessionsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('profile.noSessions')}</p>
          ) : (
            (sessionsQuery.data ?? []).map((session) => (
              <div key={session.id} className="flex items-center gap-3 border border-border rounded-md p-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {session.userAgent || t('profile.unknownDevice')} {session.isCurrent ? t('profile.current') : ''}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {session.ipAddress || t('profile.unknownIp')} · {new Date(session.createdAt).toLocaleString()}
                  </div>
                </div>
                {session.isRevoked ? (
                  <span className="text-xs text-muted-foreground">{t('profile.revoked')}</span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={async () => {
                      await revokeSession.mutateAsync(session.id)
                      if (session.isCurrent) clear()
                    }}
                    disabled={revokeSession.isPending}
                  >
                    {t('profile.revoke')}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}

function TotpCard() {
  const { t } = useTranslation()
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
            {t('profile.twoFactor')}
            {enabled && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{t('profile.enabled')}</span>}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('profile.twoFactorDesc')}
          </p>
        </div>
        {!enabled && step === 'idle' && (
          <Button variant="outline" size="sm" onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending}>
            {setupMutation.isPending ? t('common.loading') : t('profile.setup2fa')}
          </Button>
        )}
        {enabled && (
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => disableMutation.mutate()} disabled={disableMutation.isPending}>
            {t('profile.disable')}
          </Button>
        )}
      </div>

      {step === 'setup' && setupData && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium">{t('profile.scanQr')}</p>
          <img src={setupData.qrCodeUrl} alt={t('profile.qrAlt')} className="h-40 w-40 border border-border rounded" />
          <p className="text-xs text-muted-foreground">{t('profile.cantScan')} <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{setupData.secret}</code></p>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('profile.sixDigitCode')}
              maxLength={6}
              className="w-36"
              onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) verifyMutation.mutate() }}
            />
            <Button size="sm" onClick={() => verifyMutation.mutate()} disabled={code.length !== 6 || verifyMutation.isPending}>
              {verifyMutation.isPending ? t('profile.verifying') : t('profile.verify')}
            </Button>
          </div>
          {verifyMutation.isError && <p className="text-xs text-destructive">{t('profile.invalidCode')}</p>}
        </div>
      )}

      {step === 'backup' && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <p className="text-sm font-semibold text-emerald-600">{t('profile.twoFactorEnabledSave')}</p>
          <p className="text-xs text-muted-foreground">{t('profile.backupCodesDesc')}</p>
          <div className="grid grid-cols-2 gap-1">
            {backupCodes.map((c) => (
              <code key={c} className="bg-muted px-2 py-1 rounded text-xs font-mono">{c}</code>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setStep('idle')}>{t('profile.done')}</Button>
        </div>
      )}
    </Card>
  )
}

function NotificationsTab() {
  return (
    <div className="space-y-5">
      <PushNotificationsPanel />
      <BriefingCard />
      <ReminderLeadTimeCard />
    </div>
  )
}

// §7.11 — daily AI briefing preferences. An enabled toggle + delivery hour that
// persist to the notification-preferences endpoint as `briefing: { enabled, hour }`.
// The hourly briefing cron reads these back to decide who to brief and when.
function BriefingCard() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const prefsQuery = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api<{ briefing?: { enabled?: boolean; hour?: number } }>('/notifications/preferences'),
  })

  const [enabled, setEnabled] = useState(false)
  const [hour, setHour] = useState(8)

  useEffect(() => {
    if (prefsQuery.data?.briefing) {
      setEnabled(Boolean(prefsQuery.data.briefing.enabled))
      setHour(typeof prefsQuery.data.briefing.hour === 'number' ? prefsQuery.data.briefing.hour : 8)
    }
  }, [prefsQuery.data])

  const save = useMutation({
    mutationFn: () =>
      api('/notifications/preferences', {
        method: 'POST',
        body: { briefing: { enabled, hour } },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notification-preferences'] })
    },
  })

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-semibold mb-0.5">{t('profile.briefingTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('profile.briefingSubtitle')}</p>
        </div>
      </div>

      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="text-sm font-medium">{t('profile.briefingEnable')}</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors',
            enabled ? 'bg-brand-700' : 'bg-muted',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
              enabled && 'translate-x-5',
            )}
          />
        </button>
      </label>

      <div className={cn('mt-4 space-y-1', !enabled && 'opacity-50')}>
        <Label htmlFor="briefing-hour">{t('profile.briefingHour')}</Label>
        <select
          id="briefing-hour"
          value={hour}
          disabled={!enabled}
          onChange={(e) => setHour(parseInt(e.target.value, 10))}
          className="h-9 w-40 rounded-md border border-border bg-background px-3 text-sm"
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t('profile.briefingHourHelp')}</p>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <Button variant="gradient" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? t('common.saving') : t('profile.briefingSave')}
        </Button>
        {save.isSuccess && <span className="text-xs text-emerald-600">{t('profile.briefingSaved')}</span>}
      </div>
    </Card>
  )
}

// §10.4 — per-user due-date reminder lead time. Checkboxes for 1 day / 2 days /
// 1 week persist to the notification-preferences endpoint as `reminderLeadDays`.
const LEAD_OPTIONS: Array<{ days: number; labelKey: TranslationKey }> = [
  { days: 1, labelKey: 'profile.reminderLead1Day' },
  { days: 2, labelKey: 'profile.reminderLead2Days' },
  { days: 7, labelKey: 'profile.reminderLead1Week' },
]

function ReminderLeadTimeCard() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const prefsQuery = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api<{ reminderLeadDays?: number[] }>('/notifications/preferences'),
  })

  const [selected, setSelected] = useState<number[]>([1, 2])

  useEffect(() => {
    if (prefsQuery.data) setSelected(prefsQuery.data.reminderLeadDays ?? [1, 2])
  }, [prefsQuery.data])

  const toggle = (day: number) =>
    setSelected((cur) =>
      cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort((a, b) => a - b),
    )

  const save = useMutation({
    mutationFn: () =>
      api('/notifications/preferences', {
        method: 'POST',
        body: { reminderLeadDays: [...selected].sort((a, b) => a - b) },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notification-preferences'] })
    },
  })

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shrink-0">
          <CalendarClock className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-semibold mb-0.5">{t('profile.reminderLeadTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('profile.reminderLeadSubtitle')}</p>
        </div>
      </div>

      <div className="space-y-2">
        {LEAD_OPTIONS.map((opt) => {
          const checked = selected.includes(opt.days)
          return (
            <label
              key={opt.days}
              className={cn(
                'flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors',
                checked ? 'border-accent/50 bg-accent/5' : 'border-border hover:bg-muted/40',
              )}
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={checked}
                onChange={() => toggle(opt.days)}
              />
              <span className="text-sm">{t(opt.labelKey)}</span>
            </label>
          )
        })}
      </div>

      {selected.length === 0 && (
        <p className="text-xs text-muted-foreground mt-3">{t('profile.reminderLeadNone')}</p>
      )}

      <div className="flex items-center gap-3 mt-4">
        <Button variant="gradient" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? t('common.saving') : t('profile.reminderLeadSave')}
        </Button>
        {save.isSuccess && (
          <span className="text-xs text-emerald-600">{t('profile.reminderLeadSaved')}</span>
        )}
      </div>
    </Card>
  )
}
