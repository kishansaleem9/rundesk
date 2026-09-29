import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  Button,
  Badge,
  Switch,
  Label,
  cn,
  toast,
} from '@rundesk/ui'
import { Bell, Smartphone, Globe, Mail, Volume2, Moon, Check, Send, Eye } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { InlineSkeleton } from './loading-skeletons'

type Channel = 'inApp' | 'web' | 'mobile' | 'email'
type EventKey = 'mention' | 'assigned' | 'comment' | 'due' | 'status' | 'doc' | 'chat' | 'activity'

// `labelKey` / `descKey` reference i18n catalog entries; the raw `key` is the
// locale-independent identifier persisted to the API.
const EVENTS: Array<{ key: EventKey; labelKey: TranslationKey; descKey: TranslationKey }> = [
  { key: 'mention', labelKey: 'pushNotifications.event.mention', descKey: 'pushNotifications.event.mentionDesc' },
  { key: 'assigned', labelKey: 'pushNotifications.event.assigned', descKey: 'pushNotifications.event.assignedDesc' },
  { key: 'comment', labelKey: 'pushNotifications.event.comment', descKey: 'pushNotifications.event.commentDesc' },
  { key: 'chat', labelKey: 'pushNotifications.event.chat', descKey: 'pushNotifications.event.chatDesc' },
  { key: 'due', labelKey: 'pushNotifications.event.due', descKey: 'pushNotifications.event.dueDesc' },
  { key: 'status', labelKey: 'pushNotifications.event.status', descKey: 'pushNotifications.event.statusDesc' },
  { key: 'activity', labelKey: 'pushNotifications.event.activity', descKey: 'pushNotifications.event.activityDesc' },
  { key: 'doc', labelKey: 'pushNotifications.event.doc', descKey: 'pushNotifications.event.docDesc' },
]

const DEFAULTS: Record<EventKey, Record<Channel, boolean>> = {
  mention:  { inApp: true, web: true, mobile: false, email: true },
  assigned: { inApp: true, web: true, mobile: false, email: true },
  comment:  { inApp: true, web: true, mobile: false, email: true },
  due:      { inApp: true, web: true, mobile: false, email: true },
  status:   { inApp: true, web: true, mobile: false, email: true },
  doc:      { inApp: true, web: true, mobile: false, email: true },
  chat:     { inApp: true, web: true, mobile: false, email: true },
  activity: { inApp: true, web: true, mobile: false, email: true },
}

const CHANNELS: Array<{ key: Channel; labelKey: TranslationKey; icon: React.ElementType }> = [
  { key: 'inApp', labelKey: 'pushNotifications.channel.inApp', icon: Bell },
  { key: 'web', labelKey: 'pushNotifications.channel.web', icon: Globe },
  { key: 'mobile', labelKey: 'pushNotifications.channel.mobile', icon: Smartphone },
  { key: 'email', labelKey: 'pushNotifications.channel.email', icon: Mail },
]

/** Per-channel verdict of a test send (§A4.7). */
type TestSendResult = {
  ok: boolean
  delivered: boolean
  inApp: boolean
  email: boolean
  quietHours: boolean
  push:
    | { status: 'not_configured' }
    | { status: 'no_subscriptions' }
    | { status: 'channel_off' }
    | { status: 'quiet_hours' }
    | { status: 'sent'; sent: number; failed: number }
}

function describePush(push: TestSendResult['push'], t: (key: TranslationKey, vars?: Record<string, string | number>) => string): string {
  switch (push.status) {
    case 'not_configured':
      return t('pushNotifications.pushNotConfigured')
    case 'no_subscriptions':
      return t('pushNotifications.pushNoDevices')
    case 'channel_off':
      return t('pushNotifications.pushChannelOff')
    case 'quiet_hours':
      return t('pushNotifications.pushQuietHours')
    case 'sent':
      return push.failed > 0
        ? t('pushNotifications.pushPartial', { sent: push.sent, failed: push.failed })
        : t('pushNotifications.pushSent', { sent: push.sent })
  }
}

export function PushNotificationsPanel() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const prefsQuery = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api<{
      channels: {
        webEnabled: boolean
        mobileEnabled: boolean
        dndOn: boolean
        dndStart: string
        dndEnd: string
        muteSounds: boolean
      }
      events: Record<EventKey, Record<Channel, boolean>>
      digest?: { enabled: boolean; frequency: 'daily' | 'weekly'; hour: number }
      autoFollow?: boolean
    }>('/notifications/preferences'),
  })

  /*
   * Merged onto the defaults field by field, not swapped for them.
   *
   * `data ?? defaults` only catches null and undefined, so a payload that
   * arrives in any other shape — an empty array, an object without `channels`,
   * a partial written by an older release — passed straight through and the
   * next line read `.channels.webEnabled` off it. That throws, and this panel
   * renders inside the profile page, so one malformed field took the whole
   * page to the error boundary: /app/profile?tab=notifications became a screen
   * saying "Something went wrong" with no sidebar and no way back.
   *
   * Same failure the plan payload had in the sidebar, and the same remedy.
   */
  const prefs = useMemo(() => {
    const fallback = {
      channels: {
        webEnabled: true,
        mobileEnabled: false,
        dndOn: false,
        dndStart: '21:00',
        dndEnd: '08:00',
        muteSounds: false,
      },
      events: DEFAULTS,
      digest: { enabled: false, frequency: 'daily' as const, hour: 8 },
      autoFollow: true,
    }
    const data = prefsQuery.data
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fallback
    return {
      ...fallback,
      ...data,
      channels: { ...fallback.channels, ...(data.channels ?? {}) },
      events: { ...fallback.events, ...(data.events ?? {}) },
    }
  }, [prefsQuery.data])
  const [matrix, setMatrix] = useState<Record<EventKey, Record<Channel, boolean>>>(prefs.events)
  const [webEnabled, setWebEnabled] = useState(prefs.channels.webEnabled)
  const [mobileEnabled, setMobileEnabled] = useState(prefs.channels.mobileEnabled)
  const [dndStart, setDndStart] = useState(prefs.channels.dndStart)
  const [dndEnd, setDndEnd] = useState(prefs.channels.dndEnd)
  const [dndOn, setDndOn] = useState(prefs.channels.dndOn)
  const [muteSounds, setMuteSounds] = useState(prefs.channels.muteSounds)
  const [digestEnabled, setDigestEnabled] = useState(prefs.digest?.enabled ?? false)
  const [digestFrequency, setDigestFrequency] = useState<'daily' | 'weekly'>(prefs.digest?.frequency ?? 'daily')
  const [digestHour, setDigestHour] = useState(prefs.digest?.hour ?? 8)
  const [autoFollow, setAutoFollow] = useState(prefs.autoFollow ?? true)

  useEffect(() => {
    setMatrix(prefs.events)
    setWebEnabled(prefs.channels.webEnabled)
    setMobileEnabled(prefs.channels.mobileEnabled)
    setDndStart(prefs.channels.dndStart)
    setDndEnd(prefs.channels.dndEnd)
    setDndOn(prefs.channels.dndOn)
    setMuteSounds(prefs.channels.muteSounds)
    setDigestEnabled(prefs.digest?.enabled ?? false)
    setDigestFrequency(prefs.digest?.frequency ?? 'daily')
    setDigestHour(prefs.digest?.hour ?? 8)
    setAutoFollow(prefs.autoFollow ?? true)
  }, [prefs])

  function toggle(event: EventKey, channel: Channel) {
    setMatrix((m) => ({
      ...m,
      [event]: { ...m[event], [channel]: !m[event][channel] },
    }))
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api('/notifications/preferences', {
        method: 'POST',
        body: {
          channels: {
            webEnabled,
            mobileEnabled,
            dndOn,
            dndStart,
            dndEnd,
            muteSounds,
          },
          events: matrix,
          digest: { enabled: digestEnabled, frequency: digestFrequency, hour: digestHour },
          autoFollow,
        },
      }),
    onSuccess: async () => {
      toast.success(t('pushNotifications.savedToast'))
      await qc.invalidateQueries({ queryKey: ['notification-preferences'] })
    },
    onError: (err: Error) => {
      toast.error(t('pushNotifications.saveFailedToast'), { description: err.message })
    },
  })

  const sendTest = useMutation({
    mutationFn: () => api<TestSendResult>('/notifications/test', { method: 'POST', body: {} }),
    onSuccess: async (res) => {
      // §A4.7 — report each channel separately. "Delivered" used to mean only
      // that the in-app row was written, which is exactly the case where push
      // quietly went nowhere.
      const pushLine = describePush(res.push, t)
      if (res.delivered) toast.success(t('pushNotifications.testSentToast'), { description: pushLine })
      else toast.error(t('pushNotifications.testMutedToast'), { description: pushLine })
      await qc.invalidateQueries({ queryKey: ['notifications'] })
      await qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      await qc.invalidateQueries({ queryKey: ['notification-counts'] })
    },
    onError: (err: Error) => {
      toast.error(t('pushNotifications.testFailedToast'), { description: err.message })
    },
  })

  const webPushKeyQuery = useQuery({
    queryKey: ['web-push-public-key'],
    queryFn: () => api<{ publicKey: string | null; enabled: boolean }>('/notifications/web-push/public-key'),
  })

  const subscribeWebPush = useMutation({
    mutationFn: async () => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return
      const key = webPushKeyQuery.data?.publicKey
      if (!key) return
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error(t('pushNotifications.permissionDenied'))
      const reg = await navigator.serviceWorker.register('/push-sw.js')
      let subscription = await reg.pushManager.getSubscription()
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
        })
      }
      await api('/notifications/web-push/subscribe', {
        method: 'POST',
        body: { subscription: subscription.toJSON() },
      })
    },
  })

  const unsubscribeWebPush = useMutation({
    mutationFn: async () => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
      const reg = await navigator.serviceWorker.getRegistration('/push-sw.js')
      const subscription = await reg?.pushManager.getSubscription()
      if (subscription) {
        await api('/notifications/web-push/unsubscribe', {
          method: 'POST',
          body: { endpoint: subscription.endpoint },
        })
        await subscription.unsubscribe()
      }
    },
  })

  if (prefsQuery.isLoading) {
    return <Card variant="glass" className="p-5 text-sm text-muted-foreground"><InlineSkeleton /></Card>
  }

  return (
    <div className="space-y-5">
      <Card variant="glass" className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-glow">
            <Bell className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold">{t('pushNotifications.channelsTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('pushNotifications.channelsSubtitle')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ChannelRow
            icon={Globe}
            title={t('pushNotifications.channel.web')}
            description={t('pushNotifications.webDescription')}
            checked={webEnabled}
            onChange={(next) => {
              setWebEnabled(next)
              if (next) {
                void subscribeWebPush.mutateAsync().catch((err: Error) => {
                  toast.error(t('pushNotifications.enableFailedToast'), { description: err.message })
                })
              } else {
                void unsubscribeWebPush.mutateAsync().catch(() => undefined)
              }
            }}
            badge={webEnabled ? t('pushNotifications.enabled') : t('pushNotifications.off')}
          />
          <ChannelRow
            icon={Smartphone}
            title={t('pushNotifications.channel.mobile')}
            description={t('pushNotifications.mobileDescription')}
            checked={mobileEnabled}
            onChange={setMobileEnabled}
            badge={mobileEnabled ? t('pushNotifications.enabled') : t('pushNotifications.installPwaFirst')}
            ctaLabel={!mobileEnabled ? t('pushNotifications.install') : undefined}
          />
        </div>

        {/* Permission CTA */}
        {!webEnabled && (
          <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2 flex items-center gap-2 text-xs">
            <Bell className="h-3.5 w-3.5 text-accent" />
            <span className="flex-1">{t('pushNotifications.permissionPrompt')}</span>
            <Button variant="gradient" size="sm" className="h-7">
              {t('pushNotifications.allowNotifications')}
            </Button>
          </div>
        )}
      </Card>

      <Card variant="glass" className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-glow">
            <Mail className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold">{t('pushNotifications.digestTitle')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('pushNotifications.digestSubtitle')}
            </p>
          </div>
          <Switch checked={digestEnabled} onCheckedChange={setDigestEnabled} />
        </div>
        {digestEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-xs font-medium text-muted-foreground mb-1">{t('pushNotifications.frequency')}</span>
              <select
                value={digestFrequency}
                onChange={(e) => setDigestFrequency(e.target.value as 'daily' | 'weekly')}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="daily">{t('pushNotifications.daily')}</option>
                <option value="weekly">{t('pushNotifications.weekly')}</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-muted-foreground mb-1">{t('pushNotifications.sendAt')}</span>
              <select
                value={digestHour}
                onChange={(e) => setDigestHour(Number(e.target.value))}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <DigestPreview frequency={digestFrequency} />
            </div>
          </div>
        )}
      </Card>

      <Card variant="glass" className="p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40">
          <h3 className="font-display text-lg font-semibold">{t('pushNotifications.perEventTitle')}</h3>
          <p className="text-xs text-muted-foreground">{t('pushNotifications.perEventSubtitle')}</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/40">
                <th className="px-5 py-2 text-left font-semibold">{t('pushNotifications.eventColumn')}</th>
                {CHANNELS.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-center font-semibold">
                    <div className="flex flex-col items-center gap-1">
                      <c.icon className="h-3.5 w-3.5" />
                      {t(c.labelKey)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVENTS.map((e) => (
                <tr key={e.key} className="border-b border-border/30 last:border-0 hover:bg-card/40 transition-colors">
                  <td className="px-5 py-2.5">
                    <div className="text-sm font-medium">{t(e.labelKey)}</div>
                    <div className="text-[11px] text-muted-foreground">{t(e.descKey)}</div>
                  </td>
                  {CHANNELS.map((c) => (
                    <td key={c.key} className="px-3 py-2.5 text-center">
                      <Switch
                        checked={matrix[e.key][c.key]}
                        onCheckedChange={() => toggle(e.key, c.key)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card variant="glass" className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gradient-soft text-white">
            <Moon className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold">{t('pushNotifications.quietHoursTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('pushNotifications.quietHoursSubtitle')}</p>
          </div>
          <Switch checked={dndOn} onCheckedChange={setDndOn} />
        </div>
        {dndOn && (
          <div className="grid grid-cols-2 gap-3 animate-fade-in">
            <div>
              <Label className="text-xs text-muted-foreground">{t('pushNotifications.from')}</Label>
              <input type="time" value={dndStart} onChange={(e) => setDndStart(e.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('pushNotifications.to')}</Label>
              <input type="time" value={dndEnd} onChange={(e) => setDndEnd(e.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm mt-1" />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <div className="flex items-center gap-2 text-sm">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            {t('pushNotifications.muteSounds')}
          </div>
          <Switch checked={muteSounds} onCheckedChange={setMuteSounds} />
        </div>
      </Card>

      {/* §A4.7 — auto-follow always worked; it was simply invisible, so people
          could not tell why a notification reached them, let alone stop it. */}
      <Card variant="glass" className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gradient-soft text-white">
            <Eye className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold">{t('pushNotifications.autoFollowTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('pushNotifications.autoFollowSubtitle')}</p>
          </div>
          <Switch checked={autoFollow} onCheckedChange={setAutoFollow} />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            setMatrix(DEFAULTS)
            setWebEnabled(true)
            setMobileEnabled(false)
            setDndOn(false)
            setDndStart('21:00')
            setDndEnd('08:00')
            setMuteSounds(false)
            setAutoFollow(true)
          }}
        >
          {t('pushNotifications.resetDefaults')}
        </Button>
        {/* §A2.11 — a matrix of toggles is only trustworthy if you can prove it
            fires. Delivery runs the real dispatch path, so a muted channel
            reports itself as muted rather than silently doing nothing. */}
        <Button
          variant="outline"
          onClick={() => sendTest.mutate()}
          disabled={sendTest.isPending}
        >
          <Send className="h-3.5 w-3.5" /> {t('pushNotifications.sendTest')}
        </Button>
        <Button variant="gradient" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Check className="h-3.5 w-3.5" /> {t('pushNotifications.savePreferences')}
        </Button>
      </div>
    </div>
  )
}

function ChannelRow({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
  badge,
  ctaLabel,
}: {
  icon: React.ElementType
  title: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  badge?: string
  ctaLabel?: string
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/30 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent shrink-0">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{title}</span>
            {badge && (
              <Badge variant={checked ? 'success' : 'soft'} className="text-[9px] uppercase">
                {badge}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          {ctaLabel && (
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs">{ctaLabel}</Button>
          )}
        </div>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * WHAT THE DIGEST WOULD SAY NOW — `GET /notifications/digest/preview`, which no
 * page read (`product-siblings/other-get-routes-without-reader`): the
 * notifications of the last day or week, grouped as the email groups them.
 * Asked for, not fetched with the settings: it reads a person's whole window.
 */
function DigestPreview({ frequency }: { frequency: 'daily' | 'weekly' }) {
  const { t, tCount } = useTranslation()
  const [asked, setAsked] = useState(false)
  const query = useQuery({
    queryKey: ['digest-preview', frequency],
    queryFn: () =>
      api<{ total: number; groups: Array<{ type: string; count: number; items: Array<{ title: string }> }> }>(
        `/notifications/digest/preview?frequency=${frequency}`,
      ),
    enabled: asked,
  })
  return (
    <div data-testid="digest-preview" className="rounded-md border border-border/60 p-3">
      <Button type="button" size="sm" variant="outline" data-testid="digest-preview-open" onClick={() => setAsked(true)} disabled={asked && query.isFetching}>
        <Eye className="h-3.5 w-3.5 mr-1.5" />
        {t('pushNotifications.digestPreview')}
      </Button>
      {asked && (
        <div className="mt-2 text-sm">
          {query.isLoading ? (
            <InlineSkeleton />
          ) : query.isError ? (
            <p className="text-destructive">{t('pushNotifications.digestPreviewFailed')}</p>
          ) : query.data && query.data.total === 0 ? (
            <p className="text-muted-foreground" data-testid="digest-preview-empty">{t('pushNotifications.digestPreviewEmpty')}</p>
          ) : (
            <div>
              <p className="font-medium" data-testid="digest-preview-total">{tCount('pushNotifications.digestPreviewTotal', query.data?.total ?? 0)}</p>
              <ul className="mt-1 space-y-1">
                {(query.data?.groups ?? []).map((g) => (
                  <li key={g.type} data-testid="digest-preview-group" className="text-xs">
                    <span className="font-mono">{g.type}</span>
                    <span className="text-muted-foreground"> · {g.count}</span>
                    {g.items[0] && <span className="text-muted-foreground"> · {g.items[0].title}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
