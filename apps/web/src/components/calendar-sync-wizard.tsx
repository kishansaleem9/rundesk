import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Badge,
  Input,
  cn,
} from '@rundesk/ui'
import { Calendar, Check, Copy, RefreshCcw, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'

type ConnectionRow = {
  provider: string
  status: 'connected' | 'disconnected' | string
  health: 'healthy' | 'expiring' | 'expired' | 'disconnected' | string
  externalAccountEmail: string | null
  tokenExpiresAt: string | null
}

type IcalToken = { token: string; url: string }

const CALENDAR_PROVIDERS: Array<{ id: 'gcal' | 'outlook'; label: string; brand: string; icon: string }> = [
  { id: 'gcal',    label: 'Google Calendar',  brand: '#4285F4', icon: 'G' },
  { id: 'outlook', label: 'Outlook Calendar', brand: '#0078D4', icon: 'O' },
]

/**
 * Real calendar-sync configuration panel. Replaces the previous cosmetic
 * wizard — exposes connection status, push/pull triggers, and the user's
 * personal iCal subscription URL.
 */
export function CalendarSyncWizard({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceId: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data: connections = [] } = useQuery({
    queryKey: ['integration-connections', workspaceId],
    queryFn: () => api<ConnectionRow[]>(`/workspaces/${workspaceId}/integrations/connections`),
    enabled: open,
  })

  const { data: ical, refetch: refetchIcal } = useQuery({
    queryKey: ['ical-token', workspaceId],
    queryFn: () => api<IcalToken | null>(`/workspaces/${workspaceId}/calendar-sync/ical-token`),
    enabled: open,
  })

  const pull = useMutation({
    mutationFn: (provider: 'gcal' | 'outlook') =>
      api<{ created: number; updated: number; skipped: number }>(
        `/workspaces/${workspaceId}/calendar-sync/${provider}/pull`,
        { method: 'POST' },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const rotateIcal = useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}/calendar-sync/ical-token`, { method: 'POST' }),
    onSuccess: () => void refetchIcal(),
  })

  const calendarConnections = connections.filter(
    (c) => c.provider === 'gcal' || c.provider === 'outlook',
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-gradient text-white shadow-sm">
              <Calendar className="h-3.5 w-3.5" />
            </span>
            {t('calendarSync.title')}
          </DialogTitle>
          <DialogDescription>
            {t('calendarSync.description')}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3 mt-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('calendarSync.twoWaySync')}
          </h4>
          {CALENDAR_PROVIDERS.map((p) => {
            const conn = calendarConnections.find((c) => c.provider === p.id)
            const isConnected = conn?.status === 'connected'
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-3"
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-md text-white font-bold text-sm shrink-0"
                  style={{ background: p.brand }}
                >
                  {p.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {isConnected
                      ? t('calendarSync.connectedAs', {
                          account: conn!.externalAccountEmail ?? t('calendarSync.unknownAccount'),
                        })
                      : t('calendarSync.notConnected')}
                  </div>
                </div>
                {isConnected ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => pull.mutate(p.id)}
                    disabled={pull.isPending}
                  >
                    <RefreshCcw className={cn('h-3.5 w-3.5 mr-1', pull.isPending && 'animate-spin')} />
                    {t('calendarSync.syncNow')}
                  </Button>
                ) : (
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {t('calendarSync.off')}
                  </Badge>
                )}
              </div>
            )
          })}
          {pull.data && (
            <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              {t('calendarSync.syncResult', {
                created: pull.data.created,
                updated: pull.data.updated,
                skipped: pull.data.skipped,
              })}
            </div>
          )}
          {pull.isError && (
            <div className="rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs flex items-center gap-2 text-rose-700 dark:text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('calendarSync.syncFailed')}
            </div>
          )}
        </section>

        <section className="space-y-2 mt-1">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('calendarSync.icalTitle')}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t('calendarSync.icalDescription')}
          </p>
          {ical ? (
            <IcalRow url={ical.url} onRotate={() => rotateIcal.mutate()} rotating={rotateIcal.isPending} />
          ) : (
            <Button variant="outline" size="sm" onClick={() => void refetchIcal()}>
              {t('calendarSync.generateIcal')}
            </Button>
          )}
        </section>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t('calendarSync.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function IcalRow({
  url,
  onRotate,
  rotating,
}: {
  url: string
  onRotate: () => void
  rotating: boolean
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard may be unavailable (non-secure context); user can manually copy
    }
  }
  return (
    <div className="flex items-center gap-2">
      <Input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="h-8 text-xs font-mono"
      />
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={copy}>
        {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
        {copied ? t('calendarSync.copied') : t('calendarSync.copy')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={onRotate}
        disabled={rotating}
        title={t('calendarSync.rotateIcalTitle')}
      >
        <RefreshCcw className={cn('h-3.5 w-3.5', rotating && 'animate-spin')} />
      </Button>
    </div>
  )
}
