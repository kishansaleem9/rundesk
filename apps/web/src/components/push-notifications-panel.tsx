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
import { Bell, Smartphone, Globe, Mail, Volume2, Moon, Check } from 'lucide-react'
import { api } from '../lib/api'

type Channel = 'inApp' | 'web' | 'mobile' | 'email'
type EventKey = 'mention' | 'assigned' | 'comment' | 'due' | 'status' | 'doc' | 'chat' | 'activity'

const EVENTS: Array<{ key: EventKey; label: string; description: string }> = [
  { key: 'mention', label: '@mentions', description: 'Someone mentions you in a comment, doc, or chat' },
  { key: 'assigned', label: 'Task assigned', description: 'You are added as an assignee' },
  { key: 'comment', label: 'New comment', description: 'On tasks you watch' },
  { key: 'chat', label: 'Chat messages', description: 'New messages in channels you are in' },
  { key: 'due', label: 'Due-date reminders', description: '24h, 1h, and overdue alerts' },
  { key: 'status', label: 'Status changes', description: 'Done / blocked / in review on watched tasks' },
  { key: 'activity', label: 'Other task activity', description: 'Title, priority, and other task updates' },
  { key: 'doc', label: 'Doc updates', description: 'Edits to docs you\'re subscribed to' },
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

const CHANNELS: Array<{ key: Channel; label: string; icon: React.ElementType }> = [
  { key: 'inApp', label: 'In-app', icon: Bell },
  { key: 'web', label: 'Web push', icon: Globe },
  { key: 'mobile', label: 'Mobile push', icon: Smartphone },
  { key: 'email', label: 'Email', icon: Mail },
]

export function PushNotificationsPanel() {
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
    }>('/notifications/preferences'),
  })

  const prefs = useMemo(
    () =>
      prefsQuery.data ?? {
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
      },
    [prefsQuery.data],
  )
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
        },
      }),
    onSuccess: async () => {
      toast.success('Notification preferences saved')
      await qc.invalidateQueries({ queryKey: ['notification-preferences'] })
    },
    onError: (err: Error) => {
      toast.error('Failed to save preferences', { description: err.message })
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
      if (permission !== 'granted') throw new Error('Notification permission not granted')
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
    return <Card variant="glass" className="p-5 text-sm text-muted-foreground">Loading notification preferences…</Card>
  }

  return (
    <div className="space-y-5">
      <Card variant="glass" className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-glow">
            <Bell className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold">Channels</h3>
            <p className="text-sm text-muted-foreground">Decide where notifications land.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ChannelRow
            icon={Globe}
            title="Web push"
            description="Notifications when this browser is open"
            checked={webEnabled}
            onChange={(next) => {
              setWebEnabled(next)
              if (next) {
                void subscribeWebPush.mutateAsync().catch((err: Error) => {
                  toast.error('Could not enable web push', { description: err.message })
                })
              } else {
                void unsubscribeWebPush.mutateAsync().catch(() => undefined)
              }
            }}
            badge={webEnabled ? 'Enabled' : 'Off'}
          />
          <ChannelRow
            icon={Smartphone}
            title="Mobile push"
            description="Install Rundesk PWA to enable"
            checked={mobileEnabled}
            onChange={setMobileEnabled}
            badge={mobileEnabled ? 'Enabled' : 'Install PWA first'}
            ctaLabel={!mobileEnabled ? 'Install' : undefined}
          />
        </div>

        {/* Permission CTA */}
        {!webEnabled && (
          <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2 flex items-center gap-2 text-xs">
            <Bell className="h-3.5 w-3.5 text-accent" />
            <span className="flex-1">Grant permission to receive web push notifications.</span>
            <Button variant="gradient" size="sm" className="h-7">
              Allow notifications
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
            <h3 className="font-display text-lg font-semibold">Email digest</h3>
            <p className="text-sm text-muted-foreground">
              Get a periodic email summarising your unread notifications.
            </p>
          </div>
          <Switch checked={digestEnabled} onCheckedChange={setDigestEnabled} />
        </div>
        {digestEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-xs font-medium text-muted-foreground mb-1">Frequency</span>
              <select
                value={digestFrequency}
                onChange={(e) => setDigestFrequency(e.target.value as 'daily' | 'weekly')}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (Mondays)</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-muted-foreground mb-1">Send at</span>
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
          </div>
        )}
      </Card>

      <Card variant="glass" className="p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40">
          <h3 className="font-display text-lg font-semibold">Per-event preferences</h3>
          <p className="text-xs text-muted-foreground">Pick which events go to which channel.</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/40">
                <th className="px-5 py-2 text-left font-semibold">Event</th>
                {CHANNELS.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-center font-semibold">
                    <div className="flex flex-col items-center gap-1">
                      <c.icon className="h-3.5 w-3.5" />
                      {c.label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVENTS.map((e) => (
                <tr key={e.key} className="border-b border-border/30 last:border-0 hover:bg-card/40 transition-colors">
                  <td className="px-5 py-2.5">
                    <div className="text-sm font-medium">{e.label}</div>
                    <div className="text-[11px] text-muted-foreground">{e.description}</div>
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
            <h3 className="font-display text-lg font-semibold">Quiet hours</h3>
            <p className="text-sm text-muted-foreground">Mute push and email outside these hours.</p>
          </div>
          <Switch checked={dndOn} onCheckedChange={setDndOn} />
        </div>
        {dndOn && (
          <div className="grid grid-cols-2 gap-3 animate-fade-in">
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <input type="time" value={dndStart} onChange={(e) => setDndStart(e.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <input type="time" value={dndEnd} onChange={(e) => setDndEnd(e.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm mt-1" />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <div className="flex items-center gap-2 text-sm">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            Mute notification sounds
          </div>
          <Switch checked={muteSounds} onCheckedChange={setMuteSounds} />
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
          }}
        >
          Reset to defaults
        </Button>
        <Button variant="gradient" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Check className="h-3.5 w-3.5" /> Save preferences
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
