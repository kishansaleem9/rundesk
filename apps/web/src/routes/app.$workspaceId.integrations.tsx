import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
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

export const Route = createFileRoute('/app/$workspaceId/integrations')({
  component: IntegrationsMarketplacePage,
})

type Integration = {
  id: string
  name: string
  description: string
  category: 'comms' | 'storage' | 'dev' | 'calendar' | 'analytics' | 'crm' | 'ai'
  popular?: boolean
  installed?: boolean
  comingSoon?: boolean
  brandColor: string
  // simple wordmark/letter for the card
  logo: string
}
type ConnectionHealth = 'healthy' | 'expiring' | 'expired' | 'disconnected'

const INTEGRATIONS: Integration[] = [
  { id: 'slack', name: 'Slack', description: 'Get task updates in any channel, create tasks from messages.', category: 'comms', popular: true, installed: true, brandColor: '#4A154B', logo: 'S' },
  { id: 'discord', name: 'Discord', description: 'Receive notifications and slash-create tasks from chat.', category: 'comms', brandColor: '#5865F2', logo: 'D' },
  { id: 'teams', name: 'Microsoft Teams', description: 'Pin tasks to channels and get presence-aware notifications.', category: 'comms', brandColor: '#5059C9', logo: 'T' },

  { id: 'google-drive', name: 'Google Drive', description: 'Attach Drive files inline, preview without leaving Rundesk.', category: 'storage', popular: true, brandColor: '#1FA463', logo: 'G' },
  { id: 'dropbox', name: 'Dropbox', description: 'Browse and attach Dropbox files from any task.', category: 'storage', brandColor: '#0061FF', logo: 'D' },
  { id: 'onedrive', name: 'OneDrive', description: 'Sync OneDrive files to Rundesk attachments.', category: 'storage', brandColor: '#0078D4', logo: 'O' },
  { id: 'figma', name: 'Figma', description: 'Embed live Figma frames inside docs and tasks.', category: 'storage', popular: true, brandColor: '#F24E1E', logo: 'F' },

  { id: 'github', name: 'GitHub', description: 'Link commits/PRs/issues. PR state badge on tasks.', category: 'dev', popular: true, brandColor: '#181717', logo: 'G' },
  { id: 'gitlab', name: 'GitLab', description: 'Same as GitHub — works with self-managed instances.', category: 'dev', brandColor: '#FC6D26', logo: 'G' },
  { id: 'sentry', name: 'Sentry', description: 'Auto-create tasks from production errors.', category: 'dev', brandColor: '#362D59', logo: 'S' },
  { id: 'linear', name: 'Linear', description: 'Two-way sync issues between Linear and Rundesk.', category: 'dev', brandColor: '#5E6AD2', logo: 'L' },

  { id: 'gcal', name: 'Google Calendar', description: 'Two-way sync due dates as calendar events.', category: 'calendar', popular: true, installed: true, brandColor: '#4285F4', logo: 'C' },
  { id: 'outlook', name: 'Outlook Calendar', description: 'Sync due dates with your Microsoft calendar.', category: 'calendar', brandColor: '#0078D4', logo: 'O' },
  { id: 'cal', name: 'Cal.com', description: 'Schedule meetings inline — auto-create prep doc.', category: 'calendar', brandColor: '#000', logo: 'C' },

  { id: 'amplitude', name: 'Amplitude', description: 'Track product analytics events from Rundesk widgets.', category: 'analytics', brandColor: '#1F71F4', logo: 'A' },
  { id: 'mixpanel', name: 'Mixpanel', description: 'Pipe usage events to your dashboard.', category: 'analytics', brandColor: '#7856FF', logo: 'M' },
  { id: 'posthog', name: 'PostHog', description: 'Self-hostable analytics for product teams.', category: 'analytics', brandColor: '#1D4AFF', logo: 'P' },

  { id: 'stripe', name: 'Stripe', description: 'Track billable client work and create invoices from time logs.', category: 'crm', brandColor: '#635BFF', logo: 'S' },
  { id: 'hubspot', name: 'HubSpot', description: 'Sync deals and contacts as Rundesk tasks.', category: 'crm', brandColor: '#FF7A59', logo: 'H' },
  { id: 'salesforce', name: 'Salesforce', description: 'Bidirectional opportunity sync.', category: 'crm', brandColor: '#00A1E0', logo: 'S' },

  { id: 'zapier', name: 'Zapier', description: '5,000+ apps — wire Rundesk into your existing stack.', category: 'dev', popular: true, brandColor: '#FF4F00', logo: 'Z' },
  { id: 'make', name: 'Make (Integromat)', description: 'Visual workflow automation between Rundesk and the web.', category: 'dev', brandColor: '#6D00CC', logo: 'M' },
  { id: 'webhook', name: 'Custom webhooks', description: 'Build your own integration with the Rundesk webhook API.', category: 'dev', installed: true, brandColor: '#0c215d', logo: 'W' },

  { id: 'openai', name: 'OpenAI', description: 'Use GPT models alongside Claude for specific workflows.', category: 'ai', brandColor: '#10A37F', logo: 'A' },
  { id: 'gemini', name: 'Google Gemini', description: 'Bring Gemini Pro into your AI-powered automations.', category: 'ai', brandColor: '#1F71F4', logo: 'G' },
]

const CATEGORIES: Array<{ id: Integration['category'] | 'all' | 'installed'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'installed', label: 'Installed' },
  { id: 'comms', label: 'Communication' },
  { id: 'storage', label: 'Files & assets' },
  { id: 'dev', label: 'Developer' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'crm', label: 'CRM & sales' },
  { id: 'ai', label: 'AI' },
]

export function IntegrationsMarketplacePage() {
  const { workspaceId } = Route.useParams()
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<typeof CATEGORIES[number]['id']>('all')
  const [activeIntegration, setActiveIntegration] = useState<Integration | null>(null)
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('')
  const [slackChannelName, setSlackChannelName] = useState('')
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
      toast.success('Access request submitted to workspace admins.')
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
      i.description.toLowerCase().includes(query.toLowerCase())
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
    if (activeIntegration.id === 'slack') {
      if (!slackWebhookUrl.trim()) return
      await connectSlack.mutateAsync()
      return
    }
    if (oauthProviders.has(activeIntegration.id)) {
      const readiness = providerAvailability.get(activeIntegration.id)
      if (readiness && !readiness.available) {
        toast.error(readiness.reason ?? 'Provider setup is incomplete on backend.')
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
    setActiveIntegration(null)
  }

  return (
    <div className="p-6 space-y-7 max-w-7xl mx-auto">
      {oauthStatus?.oauth === 'success' ? (
        <Card className="p-3 border-emerald-500/30 bg-emerald-500/5 text-sm">
          Connected `{oauthStatus.provider}` successfully.
        </Card>
      ) : oauthStatus?.oauth === 'error' ? (
        <Card className="p-3 border-rose-500/30 bg-rose-500/5 text-sm">
          OAuth connection failed{oauthStatus.reason ? `: ${oauthStatus.reason}` : '.'}
        </Card>
      ) : null}
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            Workspace integrations
          </div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
              <Plug className="h-4 w-4" />
            </span>
            Integrations
            <Badge variant="secondary" className="ml-1">Live</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Connect Rundesk to the tools your team already uses. {installed.length} active.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCalendarSyncOpen(true)}>
          <Calendar className="h-3.5 w-3.5 mr-1" /> Calendar sync
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
          placeholder="Search integrations…"
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
              {c.label}
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
            <DialogTitle>Connect {activeIntegration?.name}</DialogTitle>
            <DialogDescription>
              {activeIntegration?.id === 'slack'
                ? 'Provide Slack incoming webhook details for workspace notifications.'
                : oauthProviders.has(activeIntegration?.id ?? '') && providerAvailability.get(activeIntegration?.id ?? '')?.available === false
                ? providerAvailability.get(activeIntegration?.id ?? '')?.reason ?? 'Provider setup is required on backend before connecting.'
                : oauthProviders.has(activeIntegration?.id ?? '')
                ? 'You will be redirected to the provider OAuth screen and returned after authorization.'
                : 'This provider is not available in your current backend integration catalog.'}
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
                  placeholder="Channel name (optional)"
                  value={slackChannelName}
                  onChange={(e) => setSlackChannelName(e.target.value)}
                />
                {slackQuery.data?.webhookUrlHint ? (
                  <p className="text-xs text-muted-foreground">
                    Current webhook: <span className="font-mono">{slackQuery.data.webhookUrlHint}</span>
                  </p>
                ) : null}
              </>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setActiveIntegration(null)}>
                Cancel
              </Button>
              <Button
                onClick={runConnectFlow}
                disabled={
                  startOAuth.isPending ||
                  connectSlack.isPending ||
                  !(activeIntegration && isSupportedIntegration(activeIntegration) && isProviderReady(activeIntegration))
                }
              >
                {startOAuth.isPending || connectSlack.isPending ? 'Connecting…' : 'Authorize & Connect'}
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
                <Badge variant="info" className="text-[9px] uppercase">Popular</Badge>
              )}
              {integration.comingSoon ? (
                <Badge variant="soft" className="text-[9px] uppercase">Soon</Badge>
              ) : !supported && accessRequest?.status === 'rejected' ? (
                <Badge variant="destructive" className="text-[9px] uppercase">Rejected</Badge>
              ) : !supported && accessRequest?.status === 'approved' ? (
                <Badge variant="success" className="text-[9px] uppercase">Approved</Badge>
              ) : !supported && accessRequest?.status === 'pending' ? (
                <Badge variant="info" className="text-[9px] uppercase">Requested</Badge>
              ) : !supported ? (
                <Badge variant="secondary" className="text-[9px] uppercase">Unavailable</Badge>
              ) : !providerReady ? (
                <Badge variant="warning" className="text-[9px] uppercase">Setup required</Badge>
              ) : connection?.health === 'expired' ? (
                <Badge variant="destructive" className="text-[9px] uppercase">Expired</Badge>
              ) : connection?.health === 'expiring' ? (
                <Badge variant="warning" className="text-[9px] uppercase">Expiring</Badge>
              ) : connected ? (
                <Badge variant="success" className="text-[9px] uppercase">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Connected
                </Badge>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
            {integration.description}
          </p>
          {supported && !providerReady && setupReason && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
              {setupReason}
            </p>
          )}
          {supported && connection?.externalAccountEmail && (
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              Account: {connection.externalAccountEmail}
            </p>
          )}
          {supported && connection?.tokenExpiresAt && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Token expires: {new Date(connection.tokenExpiresAt).toLocaleString()}
            </p>
          )}
          {!supported && accessRequest?.note ? (
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              Admin note: {accessRequest.note}
            </p>
          ) : null}
          {!supported && accessRequest?.updatedAt ? (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Decision updated: {new Date(accessRequest.updatedAt).toLocaleString()}
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
                  ? 'Request again'
                  : accessRequest?.status === 'approved'
                  ? 'Approved'
                  : accessRequest?.status === 'pending'
                  ? 'Requested'
                  : 'Request access'
                : connected
                ? 'Configure'
                : 'Connect'}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
