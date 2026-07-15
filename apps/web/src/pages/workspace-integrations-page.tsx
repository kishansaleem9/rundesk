import { useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  Button,
  Badge,
  Input,
  Switch,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  cn,
  toast,
} from '@rundesk/ui'
import { api } from '../lib/api'
import {
  Search,
  Plug,
  CheckCircle2,
  Calendar,
} from 'lucide-react'
import { CalendarSyncWizard } from '../components/calendar-sync-wizard'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../lib/i18n'

type Integration = {
  id: string
  name: string
  descKey: TranslationKey
  category: 'comms' | 'storage' | 'dev' | 'calendar' | 'analytics' | 'crm' | 'ai'
  popular?: boolean
  comingSoon?: boolean
  brandColor: string
  // simple wordmark/letter for the card
  logo: string
}
type ConnectionHealth = 'healthy' | 'expiring' | 'expired' | 'disconnected'

const INTEGRATIONS: Integration[] = [
  { id: 'slack', name: 'Slack', descKey: 'integrations.desc.slack', category: 'comms', popular: true, brandColor: '#4A154B', logo: 'S' },
  { id: 'discord', name: 'Discord', descKey: 'integrations.desc.discord', category: 'comms', brandColor: '#5865F2', logo: 'D' },
  { id: 'teams', name: 'Microsoft Teams', descKey: 'integrations.desc.teams', category: 'comms', brandColor: '#5059C9', logo: 'T' },

  { id: 'google-drive', name: 'Google Drive', descKey: 'integrations.desc.googleDrive', category: 'storage', popular: true, brandColor: '#1FA463', logo: 'G' },
  { id: 'dropbox', name: 'Dropbox', descKey: 'integrations.desc.dropbox', category: 'storage', brandColor: '#0061FF', logo: 'D' },
  { id: 'onedrive', name: 'OneDrive', descKey: 'integrations.desc.onedrive', category: 'storage', brandColor: '#0078D4', logo: 'O' },
  { id: 'figma', name: 'Figma', descKey: 'integrations.desc.figma', category: 'storage', popular: true, brandColor: '#F24E1E', logo: 'F' },

  { id: 'github', name: 'GitHub', descKey: 'integrations.desc.github', category: 'dev', popular: true, brandColor: '#181717', logo: 'G' },
  { id: 'gitlab', name: 'GitLab', descKey: 'integrations.desc.gitlab', category: 'dev', brandColor: '#FC6D26', logo: 'G' },
  { id: 'sentry', name: 'Sentry', descKey: 'integrations.desc.sentry', category: 'dev', brandColor: '#362D59', logo: 'S' },
  { id: 'linear', name: 'Linear', descKey: 'integrations.desc.linear', category: 'dev', brandColor: '#5E6AD2', logo: 'L' },

  { id: 'gcal', name: 'Google Calendar', descKey: 'integrations.desc.gcal', category: 'calendar', popular: true, brandColor: '#4285F4', logo: 'C' },
  { id: 'outlook', name: 'Outlook Calendar', descKey: 'integrations.desc.outlook', category: 'calendar', brandColor: '#0078D4', logo: 'O' },
  { id: 'cal', name: 'Cal.com', descKey: 'integrations.desc.cal', category: 'calendar', brandColor: '#000', logo: 'C' },

  { id: 'amplitude', name: 'Amplitude', descKey: 'integrations.desc.amplitude', category: 'analytics', brandColor: '#1F71F4', logo: 'A' },
  { id: 'mixpanel', name: 'Mixpanel', descKey: 'integrations.desc.mixpanel', category: 'analytics', brandColor: '#7856FF', logo: 'M' },
  { id: 'posthog', name: 'PostHog', descKey: 'integrations.desc.posthog', category: 'analytics', brandColor: '#1D4AFF', logo: 'P' },

  { id: 'stripe', name: 'Stripe', descKey: 'integrations.desc.stripe', category: 'crm', brandColor: '#635BFF', logo: 'S' },
  { id: 'hubspot', name: 'HubSpot', descKey: 'integrations.desc.hubspot', category: 'crm', brandColor: '#FF7A59', logo: 'H' },
  { id: 'salesforce', name: 'Salesforce', descKey: 'integrations.desc.salesforce', category: 'crm', brandColor: '#00A1E0', logo: 'S' },

  { id: 'zapier', name: 'Zapier', descKey: 'integrations.desc.zapier', category: 'dev', popular: true, brandColor: '#FF4F00', logo: 'Z' },
  { id: 'make', name: 'Make (Integromat)', descKey: 'integrations.desc.make', category: 'dev', brandColor: '#6D00CC', logo: 'M' },
  { id: 'webhook', name: 'Custom webhooks', descKey: 'integrations.desc.webhook', category: 'dev', brandColor: '#0c215d', logo: 'W' },

  { id: 'openai', name: 'OpenAI', descKey: 'integrations.desc.openai', category: 'ai', brandColor: '#10A37F', logo: 'A' },
  { id: 'gemini', name: 'Google Gemini', descKey: 'integrations.desc.gemini', category: 'ai', brandColor: '#1F71F4', logo: 'G' },
]

const CATEGORIES: Array<{ id: Integration['category'] | 'all' | 'installed'; labelKey: TranslationKey }> = [
  { id: 'all', labelKey: 'integrations.category.all' },
  { id: 'installed', labelKey: 'integrations.category.installed' },
  { id: 'comms', labelKey: 'integrations.category.comms' },
  { id: 'storage', labelKey: 'integrations.category.storage' },
  { id: 'dev', labelKey: 'integrations.category.dev' },
  { id: 'calendar', labelKey: 'integrations.category.calendar' },
  { id: 'analytics', labelKey: 'integrations.category.analytics' },
  { id: 'crm', labelKey: 'integrations.category.crm' },
  { id: 'ai', labelKey: 'integrations.category.ai' },
]

export function IntegrationsMarketplacePage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/integrations' })
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<typeof CATEGORIES[number]['id']>('all')
  const [activeIntegration, setActiveIntegration] = useState<Integration | null>(null)
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('')
  const [slackChannelName, setSlackChannelName] = useState('')
  // Per-channel routing rule draft.
  const [ruleWebhook, setRuleWebhook] = useState('')
  const [ruleEvents, setRuleEvents] = useState('')
  const [ruleSpaceId, setRuleSpaceId] = useState('')
  const [ruleProjectId, setRuleProjectId] = useState('')
  const [calendarSyncOpen, setCalendarSyncOpen] = useState(false)
  const providersQuery = useQuery({
    queryKey: ['integration-provider-catalog', workspaceId],
    queryFn: () =>
      api<string[]>(
        `/workspaces/${workspaceId}/integrations/connections/providers`,
      ),
  })
  const providerStatusQuery = useQuery({
    queryKey: ['integration-provider-status', workspaceId],
    queryFn: () =>
      api<Array<{ provider: string; available: boolean; reason?: string }>>(
        `/workspaces/${workspaceId}/integrations/connections/providers/status`,
      ),
  })
  const oauthProviders = useMemo(
    () => new Set(providersQuery.data ?? ['github', 'gitlab', 'gcal', 'google-drive', 'outlook', 'onedrive', 'linear', 'salesforce']),
    [providersQuery.data],
  )
  const providerAvailability = useMemo(() => {
    const map = new Map<string, { available: boolean; reason?: string }>()
    for (const row of providerStatusQuery.data ?? []) {
      map.set(row.provider, { available: row.available, reason: row.reason })
    }
    return map
  }, [providerStatusQuery.data])
  const oauthStatus = useMemo(() => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    const oauth = params.get('oauth')
    if (!oauth) return null
    return {
      oauth,
      provider: params.get('provider') ?? '',
      reason: params.get('reason') ?? '',
    }
  }, [])
  const slackQuery = useQuery({
    queryKey: ['slack', workspaceId],
    queryFn: () =>
      api<{
        id: string
        isEnabled: boolean
        channelName: string | null
        webhookUrlHint: string
      } | null>(`/workspaces/${workspaceId}/integrations/slack`),
  })
  const connectionsQuery = useQuery({
    queryKey: ['integration-connections', workspaceId],
    queryFn: () =>
      api<Array<{
        provider: string
        status: string
        health?: ConnectionHealth
        externalAccountEmail?: string | null
        tokenExpiresAt?: string | null
        updatedAt?: string
      }>>(
        `/workspaces/${workspaceId}/integrations/connections`,
      ),
  })
  const accessRequestsQuery = useQuery({
    queryKey: ['integration-access-requests', workspaceId],
    queryFn: () =>
      api<Array<{ provider: string; status: 'pending' | 'approved' | 'rejected'; note?: string | null; updatedAt?: string }>>(
        `/workspaces/${workspaceId}/integrations/connections/access-requests`,
      ),
  })
  const startOAuth = useMutation({
    mutationFn: async (provider: string) =>
      api<{ authUrl: string }>(
        `/workspaces/${workspaceId}/integrations/connections/${provider}/oauth/start`,
        { method: 'POST' },
      ),
    onSuccess: ({ authUrl }) => {
      window.location.href = authUrl
    },
  })
  const disconnectOAuth = useMutation({
    mutationFn: (provider: string) =>
      api(`/workspaces/${workspaceId}/integrations/connections/${provider}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['integration-connections', workspaceId] })
    },
  })
  const slackRulesQuery = useQuery({
    queryKey: ['slack-rules', workspaceId],
    queryFn: () =>
      api<Array<{ id: string; channelName: string | null; projectId: string | null; eventFilters: string[]; webhookUrlHint: string }>>(
        `/workspaces/${workspaceId}/integrations/slack/rules`,
      ),
    enabled: !!slackQuery.data,
  })
  const ruleSpacesQuery = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/spaces/workspace/${workspaceId}`),
    enabled: !!slackQuery.data,
  })
  const ruleProjectsQuery = useQuery({
    queryKey: ['projects', ruleSpaceId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/projects/space/${ruleSpaceId}`),
    enabled: !!ruleSpaceId,
  })
  const addSlackRule = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/integrations/slack/rules`, {
        method: 'POST',
        body: {
          webhookUrl: ruleWebhook,
          projectId: ruleProjectId || null,
          eventFilters: ruleEvents.split(',').map((s) => s.trim()).filter(Boolean),
        },
      }),
    onSuccess: async () => {
      setRuleWebhook('')
      setRuleEvents('')
      setRuleSpaceId('')
      setRuleProjectId('')
      await qc.invalidateQueries({ queryKey: ['slack-rules', workspaceId] })
    },
  })
  const removeSlackRule = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/integrations/slack/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slack-rules', workspaceId] }),
  })
  const connectSlack = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/integrations/slack`, {
        method: 'POST',
        body: {
          webhookUrl: slackWebhookUrl,
          channelName: slackChannelName || undefined,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['slack', workspaceId] })
      setActiveIntegration(null)
      setSlackWebhookUrl('')
      setSlackChannelName('')
    },
  })
  const disconnectSlack = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/integrations/slack`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['slack', workspaceId] })
    },
  })
  const requestAccess = useMutation({
    mutationFn: (provider: string) =>
      api(`/workspaces/${workspaceId}/integrations/connections/access-requests?provider=${encodeURIComponent(provider)}`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['integration-access-requests', workspaceId] })
      toast.success(t('integrations.toastAccessRequested'))
    },
  })
  const serverConnected = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const row of connectionsQuery.data ?? []) {
      map.set(row.provider, row.status === 'connected')
    }
    return map
  }, [connectionsQuery.data])
  const connectionByProvider = useMemo(() => {
    const map = new Map<
      string,
      {
        status: string
        health: ConnectionHealth
        externalAccountEmail?: string | null
        tokenExpiresAt?: string | null
        updatedAt?: string
      }
    >()
    for (const row of connectionsQuery.data ?? []) {
      map.set(row.provider, {
        status: row.status,
        health: row.health ?? (row.status === 'connected' ? 'healthy' : 'disconnected'),
        externalAccountEmail: row.externalAccountEmail,
        tokenExpiresAt: row.tokenExpiresAt,
        updatedAt: row.updatedAt,
      })
    }
    return map
  }, [connectionsQuery.data])
  const accessRequestByProvider = useMemo(() => {
    const map = new Map<string, { status: 'pending' | 'approved' | 'rejected'; note?: string | null; updatedAt?: string }>()
    for (const row of accessRequestsQuery.data ?? []) {
      map.set(row.provider, { status: row.status, note: row.note, updatedAt: row.updatedAt })
    }
    return map
  }, [accessRequestsQuery.data])

  const filtered = INTEGRATIONS.filter((i) => {
    if (filter === 'installed') {
      if (i.id === 'slack') return Boolean(slackQuery.data?.isEnabled)
      if (oauthProviders.has(i.id)) return Boolean(serverConnected.get(i.id))
      return false
    }
    if (filter !== 'all' && i.category !== filter) return false
    return (
      i.name.toLowerCase().includes(query.toLowerCase()) ||
      t(i.descKey).toLowerCase().includes(query.toLowerCase())
    )
  })

  const installed = INTEGRATIONS.filter((i) => {
    if (i.id === 'slack') return Boolean(slackQuery.data?.isEnabled)
    if (oauthProviders.has(i.id)) return Boolean(serverConnected.get(i.id))
    return false
  })
  const isSupportedIntegration = (integration: Integration) =>
    integration.id === 'slack' || oauthProviders.has(integration.id) || Boolean(integration.comingSoon)
  const isProviderReady = (integration: Integration) =>
    integration.id === 'slack' || !oauthProviders.has(integration.id)
      ? true
      : (providerAvailability.get(integration.id)?.available ?? true)

  const runConnectFlow = async () => {
    if (!activeIntegration) return
    if (!isSupportedIntegration(activeIntegration)) return
    if (activeIntegration.id === 'slack') {
      if (!slackWebhookUrl.trim()) return
      await connectSlack.mutateAsync()
      return
    }
    if (oauthProviders.has(activeIntegration.id)) {
      const readiness = providerAvailability.get(activeIntegration.id)
      if (readiness && !readiness.available) {
        toast.error(readiness.reason ?? t('integrations.providerSetupIncomplete'))
        return
      }
      setActiveProvider(activeIntegration.id)
      try {
        await startOAuth.mutateAsync(activeIntegration.id)
      } finally {
        setActiveProvider(null)
      }
      return
    }
  }

  return (
    <div className="p-6 space-y-7 max-w-7xl mx-auto">
      {oauthStatus?.oauth === 'success' ? (
        <Card className="p-3 border-emerald-500/30 bg-emerald-500/5 text-sm">
          {t('integrations.connectedSuccess', { provider: oauthStatus.provider })}
        </Card>
      ) : oauthStatus?.oauth === 'error' ? (
        <Card className="p-3 border-rose-500/30 bg-rose-500/5 text-sm">
          {t('integrations.oauthFailed')}{oauthStatus.reason ? `: ${oauthStatus.reason}` : '.'}
        </Card>
      ) : null}
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            {t('integrations.eyebrow')}
          </div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
              <Plug className="h-4 w-4" />
            </span>
            {t('nav.integrations')}
            <Badge variant="secondary" className="ml-1">{t('integrations.liveBadge')}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            {t('integrations.subtitle', { count: installed.length })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCalendarSyncOpen(true)}>
          <Calendar className="h-3.5 w-3.5 mr-1" /> {t('integrations.calendarSync')}
        </Button>
      </header>
      <CalendarSyncWizard
        open={calendarSyncOpen}
        onOpenChange={setCalendarSyncOpen}
        workspaceId={workspaceId}
      />

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <Input
          leadingIcon={<Search className="h-4 w-4" />}
          placeholder={t('integrations.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none bg-card/40 border border-border/60 rounded-lg p-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-md font-medium transition-all whitespace-nowrap',
                filter === c.id
                  ? 'bg-brand-gradient text-white shadow-sm'
                  : 'hover:bg-card/60 text-muted-foreground hover:text-foreground',
              )}
            >
              {t(c.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
              connected={
                integration.id === 'slack'
                  ? Boolean(slackQuery.data?.isEnabled)
                  : oauthProviders.has(integration.id)
                  ? Boolean(serverConnected.get(integration.id))
                  : false
              }
              isLoading={
                startOAuth.isPending || disconnectOAuth.isPending
                  ? activeProvider === integration.id
                  : false
              }
              onToggle={(next) => {
                if (!isSupportedIntegration(integration)) return
                if (integration.id === 'slack') {
                  if (next) {
                    setActiveIntegration(integration)
                  } else {
                    disconnectSlack.mutate()
                  }
                  return
                }
                if (oauthProviders.has(integration.id)) {
                  setActiveProvider(integration.id)
                  if (next) {
                    startOAuth.mutate(integration.id, {
                      onSettled: () => setActiveProvider(null),
                    })
                  } else {
                    disconnectOAuth.mutate(integration.id, {
                      onSettled: async () => {
                        setActiveProvider(null)
                        await qc.invalidateQueries({
                          queryKey: ['integration-connections', workspaceId],
                        })
                      },
                    })
                  }
                  return
                }
              }}
            onOpenConnect={() => setActiveIntegration(integration)}
            supported={isSupportedIntegration(integration)}
            connection={connectionByProvider.get(integration.id)}
            setupReason={oauthProviders.has(integration.id) ? providerAvailability.get(integration.id)?.reason : undefined}
            providerReady={isProviderReady(integration)}
            accessRequest={accessRequestByProvider.get(integration.id)}
            onRequestAccess={() => requestAccess.mutate(integration.id)}
          />
        ))}
      </div>

      <Dialog open={Boolean(activeIntegration)} onOpenChange={(open) => !open && setActiveIntegration(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('integrations.connectDialogTitle', { name: activeIntegration?.name ?? '' })}</DialogTitle>
            <DialogDescription>
              {activeIntegration?.id === 'slack'
                ? t('integrations.slackDialogDesc')
                : oauthProviders.has(activeIntegration?.id ?? '') && providerAvailability.get(activeIntegration?.id ?? '')?.available === false
                ? providerAvailability.get(activeIntegration?.id ?? '')?.reason ?? t('integrations.providerSetupRequired')
                : oauthProviders.has(activeIntegration?.id ?? '')
                ? t('integrations.oauthRedirectDesc')
                : t('integrations.notInCatalog')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {activeIntegration?.id === 'slack' ? (
              <>
                <Input
                  placeholder="https://hooks.slack.com/services/T.../B.../..."
                  value={slackWebhookUrl}
                  onChange={(e) => setSlackWebhookUrl(e.target.value)}
                />
                <Input
                  placeholder={t('integrations.channelNamePlaceholder')}
                  value={slackChannelName}
                  onChange={(e) => setSlackChannelName(e.target.value)}
                />
                {slackQuery.data?.webhookUrlHint ? (
                  <p className="text-xs text-muted-foreground">
                    {t('integrations.currentWebhook')} <span className="font-mono">{slackQuery.data.webhookUrlHint}</span>
                  </p>
                ) : null}

                {slackQuery.data ? (
                  <div className="mt-2 rounded-md border border-border/60 p-3 space-y-2">
                    <div className="text-xs font-medium">{t('integrations.routingRulesTitle')}</div>
                    <p className="text-[11px] text-muted-foreground">
                      {t('integrations.routingRulesDesc')}
                    </p>
                    {(slackRulesQuery.data ?? []).map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-xs rounded border border-border/50 px-2 py-1.5">
                        <span className="font-mono">{r.webhookUrlHint}</span>
                        <span className="text-muted-foreground">
                          {r.eventFilters.length ? r.eventFilters.join(', ') : t('integrations.allEvents')}
                          {r.projectId ? ` · ${t('integrations.oneProject')}` : ''}
                        </span>
                        <button
                          className="ml-auto text-rose-500 hover:text-rose-600"
                          onClick={() => removeSlackRule.mutate(r.id)}
                        >
                          {t('integrations.remove')}
                        </button>
                      </div>
                    ))}
                    <Input
                      placeholder={t('integrations.ruleWebhookPlaceholder')}
                      value={ruleWebhook}
                      onChange={(e) => setRuleWebhook(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      placeholder={t('integrations.eventsPlaceholder')}
                      value={ruleEvents}
                      onChange={(e) => setRuleEvents(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={ruleSpaceId}
                        onChange={(e) => {
                          setRuleSpaceId(e.target.value)
                          setRuleProjectId('')
                        }}
                        className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs"
                      >
                        <option value="">{t('integrations.allProjects')}</option>
                        {(ruleSpacesQuery.data ?? []).map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <select
                        value={ruleProjectId}
                        onChange={(e) => setRuleProjectId(e.target.value)}
                        disabled={!ruleSpaceId}
                        className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-50"
                      >
                        <option value="">{t('integrations.wholeSpace')}</option>
                        {(ruleProjectsQuery.data ?? []).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={!ruleWebhook.trim() || addSlackRule.isPending}
                        onClick={() => addSlackRule.mutate()}
                      >
                        {t('integrations.addRule')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setActiveIntegration(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={runConnectFlow}
                title={
                  activeIntegration && !isSupportedIntegration(activeIntegration)
                    ? t('integrations.notAvailableYetTitle')
                    : undefined
                }
                disabled={
                  startOAuth.isPending ||
                  connectSlack.isPending ||
                  !(activeIntegration && isSupportedIntegration(activeIntegration) && isProviderReady(activeIntegration))
                }
              >
                {startOAuth.isPending || connectSlack.isPending
                  ? t('integrations.connecting')
                  : activeIntegration && !isSupportedIntegration(activeIntegration)
                  ? t('integrations.notAvailableYet')
                  : t('integrations.authorizeConnect')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function IntegrationCard({
  integration,
  connected,
  isLoading,
  onToggle,
  onOpenConnect,
  supported,
  connection,
  setupReason,
  providerReady,
  accessRequest,
  onRequestAccess,
}: {
  integration: Integration
  connected: boolean
  isLoading?: boolean
  onToggle: (next: boolean) => void
  onOpenConnect: () => void
  supported: boolean
  providerReady: boolean
  setupReason?: string
  accessRequest?: { status: 'pending' | 'approved' | 'rejected'; note?: string | null; updatedAt?: string }
  onRequestAccess: () => void
  connection?: {
    status: string
    health: ConnectionHealth
    externalAccountEmail?: string | null
    tokenExpiresAt?: string | null
    updatedAt?: string
  }
}) {
  const { t } = useTranslation()
  return (
    <Card variant="glass" className="p-4 group transition-all hover:border-accent/40">
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white font-bold text-sm shadow-sm"
          style={{ background: integration.brandColor }}
        >
          {integration.logo}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <span className="font-medium truncate flex-1">{integration.name}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {integration.popular && !connected && (
                <Badge variant="info" className="text-[9px] uppercase">{t('integrations.popular')}</Badge>
              )}
              {integration.comingSoon ? (
                <Badge variant="soft" className="text-[9px] uppercase">{t('integrations.soon')}</Badge>
              ) : !supported && accessRequest?.status === 'rejected' ? (
                <Badge variant="destructive" className="text-[9px] uppercase">{t('integrations.rejected')}</Badge>
              ) : !supported && accessRequest?.status === 'approved' ? (
                <Badge variant="success" className="text-[9px] uppercase">{t('integrations.approved')}</Badge>
              ) : !supported && accessRequest?.status === 'pending' ? (
                <Badge variant="info" className="text-[9px] uppercase">{t('integrations.requested')}</Badge>
              ) : !supported ? (
                <Badge variant="secondary" className="text-[9px] uppercase">{t('integrations.unavailable')}</Badge>
              ) : !providerReady ? (
                <Badge variant="warning" className="text-[9px] uppercase">{t('integrations.setupRequired')}</Badge>
              ) : connection?.health === 'expired' ? (
                <Badge variant="destructive" className="text-[9px] uppercase">{t('integrations.expired')}</Badge>
              ) : connection?.health === 'expiring' ? (
                <Badge variant="warning" className="text-[9px] uppercase">{t('integrations.expiring')}</Badge>
              ) : connected ? (
                <Badge variant="success" className="text-[9px] uppercase">
                  <CheckCircle2 className="h-2.5 w-2.5" /> {t('integrations.connected')}
                </Badge>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
            {t(integration.descKey)}
          </p>
          {supported && !providerReady && setupReason && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
              {setupReason}
            </p>
          )}
          {supported && connection?.externalAccountEmail && (
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              {t('integrations.accountLabel')} {connection.externalAccountEmail}
            </p>
          )}
          {supported && connection?.tokenExpiresAt && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t('integrations.tokenExpires')} {new Date(connection.tokenExpiresAt).toLocaleString()}
            </p>
          )}
          {!supported && accessRequest?.note ? (
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              {t('integrations.adminNote')} {accessRequest.note}
            </p>
          ) : null}
          {!supported && accessRequest?.updatedAt ? (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t('integrations.decisionUpdated')} {new Date(accessRequest.updatedAt).toLocaleString()}
            </p>
          ) : null}
          <div className="mt-3 flex items-center justify-between">
            <Switch
              checked={connected}
              onCheckedChange={onToggle}
              disabled={integration.comingSoon || isLoading || !supported || !providerReady}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={
                integration.comingSoon ||
                isLoading ||
                (!supported &&
                  (accessRequest?.status === 'pending' || accessRequest?.status === 'approved'))
              }
              onClick={() => {
                if (!supported && !integration.comingSoon) {
                  onRequestAccess()
                  return
                }
                onOpenConnect()
              }}
            >
              {!supported && !integration.comingSoon
                ? accessRequest?.status === 'rejected'
                  ? t('integrations.requestAgain')
                  : accessRequest?.status === 'approved'
                  ? t('integrations.approved')
                  : accessRequest?.status === 'pending'
                  ? t('integrations.requested')
                  : t('integrations.requestAccess')
                : connected
                ? t('integrations.configure')
                : t('integrations.connect')}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
