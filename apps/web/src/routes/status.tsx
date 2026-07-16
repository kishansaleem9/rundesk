import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, cn } from '@rundesk/ui'
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  MinusCircle,
  Loader2,
  Activity,
} from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../lib/i18n'

export const Route = createFileRoute('/status')({
  component: PublicStatusPage,
})

type ComponentStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage'
type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved'

type StatusComponent = {
  id: string
  name: string
  status: ComponentStatus
  position: number
}

type StatusIncident = {
  id: string
  title: string
  body: string
  impact: string
  status: IncidentStatus
  startedAt: string
  resolvedAt?: string | null
}

type StatusPage = {
  overall: ComponentStatus
  components: StatusComponent[]
  incidents: StatusIncident[]
}

const COMPONENT_LABEL_KEYS: Record<ComponentStatus, TranslationKey> = {
  operational: 'status.operational',
  degraded: 'status.degraded',
  partial_outage: 'status.partialOutage',
  major_outage: 'status.majorOutage',
}

const INCIDENT_LABEL_KEYS: Record<IncidentStatus, TranslationKey> = {
  investigating: 'status.investigating',
  identified: 'status.identified',
  monitoring: 'status.monitoring',
  resolved: 'status.incidentResolved',
}

const COMPONENT_META: Record<
  ComponentStatus,
  { icon: typeof CheckCircle2; dot: string; text: string }
> = {
  operational: { icon: CheckCircle2, dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  degraded: { icon: MinusCircle, dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  partial_outage: { icon: AlertTriangle, dot: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  major_outage: { icon: AlertOctagon, dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
}

const OVERALL_BANNER: Record<ComponentStatus, string> = {
  operational: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
  degraded: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300',
  partial_outage: 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-300',
  major_outage: 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300',
}

const OVERALL_MESSAGE_KEYS: Record<ComponentStatus, TranslationKey> = {
  operational: 'status.allOperational',
  degraded: 'status.someDegraded',
  partial_outage: 'status.partialOutageBanner',
  major_outage: 'status.majorOutageBanner',
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function PublicStatusPage() {
  const { t, locale } = useTranslation()

  const statusQuery = useQuery({
    queryKey: ['public-status'],
    queryFn: () => api<StatusPage>('/status', { skipAuth: true }),
    retry: false,
    refetchInterval: 60_000,
  })

  const data = statusQuery.data
  const overall = data?.overall ?? 'operational'
  const OverallIcon = COMPONENT_META[overall].icon
  const openIncidents = (data?.incidents ?? []).filter((i) => i.status !== 'resolved')
  const pastIncidents = (data?.incidents ?? []).filter((i) => i.status === 'resolved')

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-accent" />
          <h1 className="text-xl font-semibold">{t('status.title')}</h1>
        </div>

        {statusQuery.isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : statusQuery.isError ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">{t('status.loadError')}</Card>
        ) : (
          <>
            {/* Overall banner */}
            <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3.5', OVERALL_BANNER[overall])}>
              <OverallIcon className="h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">{t(OVERALL_MESSAGE_KEYS[overall])}</p>
            </div>

            {/* Active incidents */}
            {openIncidents.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground">{t('status.activeIncidents')}</h2>
                {openIncidents.map((incident) => (
                  <Card key={incident.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{incident.title}</p>
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                        {t(INCIDENT_LABEL_KEYS[incident.status])}
                      </span>
                    </div>
                    {incident.body ? <p className="mt-1.5 text-sm text-muted-foreground">{incident.body}</p> : null}
                    <p className="mt-2 text-[11px] text-muted-foreground/70">{formatDate(incident.startedAt, locale)}</p>
                  </Card>
                ))}
              </section>
            )}

            {/* Components */}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{t('status.components')}</h2>
              <Card className="divide-y divide-border/60 p-0">
                {(data?.components ?? []).length > 0 ? (
                  data!.components.map((component) => {
                    const meta = COMPONENT_META[component.status]
                    return (
                      <div key={component.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className={cn('h-2.5 w-2.5 rounded-full', meta.dot)} />
                          <span className="text-sm font-medium">{component.name}</span>
                        </div>
                        <span className={cn('text-xs font-medium', meta.text)}>
                          {t(COMPONENT_LABEL_KEYS[component.status])}
                        </span>
                      </div>
                    )
                  })
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t('status.noComponents')}</div>
                )}
              </Card>
            </section>

            {/* Past incidents */}
            {pastIncidents.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground">{t('status.pastIncidents')}</h2>
                {pastIncidents.map((incident) => (
                  <Card key={incident.id} className="p-4 opacity-80">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{incident.title}</p>
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                        {t('status.incidentResolved')}
                      </span>
                    </div>
                    {incident.body ? <p className="mt-1.5 text-sm text-muted-foreground">{incident.body}</p> : null}
                    <p className="mt-2 text-[11px] text-muted-foreground/70">
                      {formatDate(incident.resolvedAt ?? incident.startedAt, locale)}
                    </p>
                  </Card>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
