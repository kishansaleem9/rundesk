import { useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
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
  XCircle,
  BookOpen,
} from 'lucide-react'
import { CalendarSyncWizard } from '../components/calendar-sync-wizard'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../lib/i18n'

type IntegrationCategory =
  | 'comms'
  | 'storage'
  | 'dev'
  | 'calendar'
  | 'analytics'
  | 'crm'
  | 'ai'
  | 'design'
  | 'email'
  | 'finance'
  | 'knowledge'
  | 'timeTracking'

type Integration = {
  id: string
  name: string
  descKey: TranslationKey
  category: IntegrationCategory
  popular?: boolean
  comingSoon?: boolean
  /**
   * §V2-11, frame `19:07` — this app is one of the sources federated search can
   * actually reach. Not a taste judgement: it mirrors `SEARCH_SOURCES` /
   * `SOURCE_PROVIDER` in `apps/api/src/modules/search/sources.ts`, which is the
   * server's own list of what a "Connected Search" query goes out to.
   */
  connectedSearch?: boolean
  brandColor: string
  // simple wordmark/letter for the card
  logo: string
}
type ConnectionHealth = 'healthy' | 'expiring' | 'expired' | 'disconnected'

/**
 * §V2-11, frame `18:39` — the integration error card.
 *
 *   We couldn't connect your Google account.
 *   Google gave us this error: OAuth authentication timed out. Please try
 *   again. If it keeps happening, try checking your permissions — that often
 *   does the trick.
 *   [ Help center article ]
 *
 * THE CLAUSE THAT MATTERS is "Google gave us this error: …" — the provider's
 * own words, about one integration, still there tomorrow. What Rundesk had was
 * `?oauth=error&reason=` on a redirect: one page load long, attached to no
 * particular integration, and pointed at the app root rather than at the page
 * that reads it. So the card could only ever say that something had failed.
 *
 * `lastError` is now a stored column and this is its reader. Both halves had to
 * ship together: a column nothing reads is the mirror of a facade, and a card
 * that renders a constant is the facade itself.
 */
type ConnectionState = {
  status: string
  health: ConnectionHealth
  externalAccountEmail?: string | null
  tokenExpiresAt?: string | null
  updatedAt?: string
  lastError?: string | null
  lastErrorAt?: string | null
}

const INTEGRATIONS: Integration[] = [
  { id: 'slack', name: 'Slack', descKey: 'integrations.desc.slack', category: 'comms', popular: true, brandColor: '#4A154B', logo: 'S' },
  { id: 'discord', name: 'Discord', descKey: 'integrations.desc.discord', category: 'comms', comingSoon: true, brandColor: '#5865F2', logo: 'D' },
  { id: 'teams', name: 'Microsoft Teams', descKey: 'integrations.desc.teams', category: 'comms', comingSoon: true, brandColor: '#5059C9', logo: 'T' },
  { id: 'zoom', name: 'Zoom', descKey: 'integrations.desc.zoom', category: 'comms', popular: true, brandColor: '#2D8CFF', logo: 'Z' },

  { id: 'google-drive', name: 'Google Drive', descKey: 'integrations.desc.googleDrive', category: 'storage', popular: true, connectedSearch: true, brandColor: '#1FA463', logo: 'G' },
  { id: 'dropbox', name: 'Dropbox', descKey: 'integrations.desc.dropbox', category: 'storage', brandColor: '#0061FF', logo: 'D' },
  // `onedrive` is also the credential SharePoint search borrows — see
  // `SOURCE_PROVIDER.sharepoint` in the API's `search/sources.ts`.
  { id: 'onedrive', name: 'OneDrive', descKey: 'integrations.desc.onedrive', category: 'storage', comingSoon: true, connectedSearch: true, brandColor: '#0078D4', logo: 'O' },
  // Moved out of Cloud Storage into Design (frame `19:07` lists both): Figma is
  // not a file store here, it is the thing the Design facet is about, and it
  // was the only reason that facet would otherwise have nothing behind it.
  { id: 'figma', name: 'Figma', descKey: 'integrations.desc.figma', category: 'design', comingSoon: true, brandColor: '#F24E1E', logo: 'F' },

  { id: 'github', name: 'GitHub', descKey: 'integrations.desc.github', category: 'dev', popular: true, brandColor: '#181717', logo: 'G' },
  { id: 'gitlab', name: 'GitLab', descKey: 'integrations.desc.gitlab', category: 'dev', brandColor: '#FC6D26', logo: 'G' },
  { id: 'sentry', name: 'Sentry', descKey: 'integrations.desc.sentry', category: 'dev', comingSoon: true, brandColor: '#362D59', logo: 'S' },
  { id: 'linear', name: 'Linear', descKey: 'integrations.desc.linear', category: 'dev', comingSoon: true, brandColor: '#5E6AD2', logo: 'L' },

  { id: 'gcal', name: 'Google Calendar', descKey: 'integrations.desc.gcal', category: 'calendar', popular: true, brandColor: '#4285F4', logo: 'C' },
  { id: 'outlook', name: 'Outlook Calendar', descKey: 'integrations.desc.outlook', category: 'calendar', brandColor: '#0078D4', logo: 'O' },
  { id: 'cal', name: 'Cal.com', descKey: 'integrations.desc.cal', category: 'calendar', comingSoon: true, brandColor: '#000', logo: 'C' },

  /*
   * Gmail is not padding for the Email facet: `SEARCH_SOURCES` in the API
   * already names `gmail` as a federated search source with its own tab in the
   * search UI, so the product talks about it and had no card for it. Listed as
   * "coming soon" because `listSupportedProviders()` has no `gmail` OAuth
   * provider to connect one with — which is a defect recorded separately, not
   * a thing this card should pretend away.
   */
  { id: 'gmail', name: 'Gmail', descKey: 'integrations.desc.gmail', category: 'email', comingSoon: true, connectedSearch: true, brandColor: '#EA4335', logo: 'M' },
  { id: 'outlook-mail', name: 'Outlook Mail', descKey: 'integrations.desc.outlookMail', category: 'email', comingSoon: true, brandColor: '#0F6CBD', logo: 'O' },

  { id: 'notion', name: 'Notion', descKey: 'integrations.desc.notion', category: 'knowledge', comingSoon: true, brandColor: '#111', logo: 'N' },

  { id: 'toggl', name: 'Toggl Track', descKey: 'integrations.desc.toggl', category: 'timeTracking', comingSoon: true, brandColor: '#E57CD8', logo: 'T' },

  { id: 'amplitude', name: 'Amplitude', descKey: 'integrations.desc.amplitude', category: 'analytics', comingSoon: true, brandColor: '#1F71F4', logo: 'A' },
  { id: 'mixpanel', name: 'Mixpanel', descKey: 'integrations.desc.mixpanel', category: 'analytics', comingSoon: true, brandColor: '#7856FF', logo: 'M' },
  { id: 'posthog', name: 'PostHog', descKey: 'integrations.desc.posthog', category: 'analytics', comingSoon: true, brandColor: '#1D4AFF', logo: 'P' },

  // Stripe pays for things; it is not a CRM. Moved into Finance & Accounting,
  // which the frame lists and which its own description already describes
  // ("track billable client work and create invoices from time logs").
  { id: 'stripe', name: 'Stripe', descKey: 'integrations.desc.stripe', category: 'finance', brandColor: '#635BFF', logo: 'S' },
  { id: 'hubspot', name: 'HubSpot', descKey: 'integrations.desc.hubspot', category: 'crm', comingSoon: true, brandColor: '#FF7A59', logo: 'H' },
  { id: 'salesforce', name: 'Salesforce', descKey: 'integrations.desc.salesforce', category: 'crm', comingSoon: true, brandColor: '#00A1E0', logo: 'S' },

  { id: 'zapier', name: 'Zapier', descKey: 'integrations.desc.zapier', category: 'dev', popular: true, brandColor: '#FF4F00', logo: 'Z' },
  { id: 'make', name: 'Make (Integromat)', descKey: 'integrations.desc.make', category: 'dev', comingSoon: true, brandColor: '#6D00CC', logo: 'M' },
  { id: 'webhook', name: 'Custom webhooks', descKey: 'integrations.desc.webhook', category: 'dev', brandColor: '#0c215d', logo: 'W' },

  { id: 'openai', name: 'OpenAI', descKey: 'integrations.desc.openai', category: 'ai', brandColor: '#10A37F', logo: 'A' },
  { id: 'gemini', name: 'Google Gemini', descKey: 'integrations.desc.gemini', category: 'ai', comingSoon: true, brandColor: '#1F71F4', logo: 'G' },
]

/**
 * §V2-11, frame `19:07` — the App Center's facet rail, all FOURTEEN of it.
 *
 * What the frame draws, under an "INTEGRATIONS" heading and in this order:
 * All Apps · Featured · Analytics · Calendars · Cloud Storage · Communication ·
 * Connected Search · CRM & Support · Design · Development · Email ·
 * Finance & Accounting · Knowledge Base · Time Tracking. (A separate "AI"
 * heading below it carries "Suggest an app", which is its own ledger row.)
 *
 * This page shipped NINE, and the gap was not cosmetic: a category is how you
 * find an app you cannot name, so seven missing facets are seven directories
 * with no door. Two of the nine — "Installed" and "AI" — are not facets in the
 * frame at all; connection state is shown on the card (the green check on
 * Google Calendar at `19:07`), and the installed count is still in this page's
 * subtitle. The `ai` CATEGORY is kept on the two model connectors so the data
 * stays truthful; they are reached through All Apps and search.
 *
 * THE RULE THAT MATTERS, and the reason this is derived rather than written
 * out: a facet with nothing behind it is a checkbox that can only ever empty
 * the grid. `FACETS` below is `FRAME_FACETS` filtered to the ones that match at
 * least one integration, so a facet cannot outlive its apps — delete the last
 * Design app and the Design chip goes with it, instead of becoming a dead
 * control nobody notices until a customer clicks it.
 */
type FacetId =
  | 'all'
  | 'featured'
  | 'connectedSearch'
  | IntegrationCategory

const FRAME_FACETS: Array<{ id: FacetId; labelKey: TranslationKey }> = [
  { id: 'all', labelKey: 'integrations.category.all' },
  { id: 'featured', labelKey: 'integrations.category.featured' },
  { id: 'analytics', labelKey: 'integrations.category.analytics' },
  { id: 'calendar', labelKey: 'integrations.category.calendar' },
  { id: 'storage', labelKey: 'integrations.category.storage' },
  { id: 'comms', labelKey: 'integrations.category.comms' },
  { id: 'connectedSearch', labelKey: 'integrations.category.connectedSearch' },
  { id: 'crm', labelKey: 'integrations.category.crm' },
  { id: 'design', labelKey: 'integrations.category.design' },
  { id: 'dev', labelKey: 'integrations.category.dev' },
  { id: 'email', labelKey: 'integrations.category.email' },
  { id: 'finance', labelKey: 'integrations.category.finance' },
  { id: 'knowledge', labelKey: 'integrations.category.knowledge' },
  { id: 'timeTracking', labelKey: 'integrations.category.timeTracking' },
]

/**
 * Does this app belong under this facet?
 *
 * "Featured" and "Connected Search" are not categories — an app has exactly one
 * category and can be featured as well — so they read their own flags. Stated
 * once here, and used both to render the grid and to decide which facets exist
 * at all, so the two can never disagree about what a facet means.
 */
function matchesFacet(integration: Integration, facet: FacetId): boolean {
  if (facet === 'all') return true
  if (facet === 'featured') return Boolean(integration.popular)
  if (facet === 'connectedSearch') return Boolean(integration.connectedSearch)
  return integration.category === facet
}

const FACETS = FRAME_FACETS.filter((facet) => INTEGRATIONS.some((i) => matchesFacet(i, facet.id)))

/**
 * §V2-11, frame `18:39` — the "Help center article" button under the error.
 *
 * Points at `/app/help`, the page, and NOT at `/app/help#help-integrations`.
 * The help page builds its anchors from the curated topic list and there is no
 * integrations topic in it, so an anchored link would scroll to nothing —
 * which is the failure that page's own notes call out: "a source you can click
 * and that does nothing is worse than one that is not offered."
 */
function HelpCentreLink({ testId }: { testId: string }) {
  const { t } = useTranslation()
  return (
    <Link
      to="/app/help"
      data-testid={testId}
      className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-2 py-1 text-[11px] font-medium hover:bg-muted/50"
    >
      <BookOpen className="h-3 w-3" aria-hidden />
      {t('integrations.helpArticle')}
    </Link>
  )
}

export function IntegrationsMarketplacePage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/integrations' })
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FacetId>('all')
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
    () => new Set(providersQuery.data ?? ['github', 'gitlab', 'gcal', 'google-drive', 'outlook', 'onedrive', 'linear', 'salesforce', 'dropbox', 'zoom']),
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
        /** §V2-11 `18:39` — what the provider actually said, verbatim. */
        lastError?: string | null
        lastErrorAt?: string | null
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
    const map = new Map<string, ConnectionState>()
    for (const row of connectionsQuery.data ?? []) {
      map.set(row.provider, {
        status: row.status,
        health: row.health ?? (row.status === 'connected' ? 'healthy' : 'disconnected'),
        externalAccountEmail: row.externalAccountEmail,
        tokenExpiresAt: row.tokenExpiresAt,
        updatedAt: row.updatedAt,
        lastError: row.lastError ?? null,
        lastErrorAt: row.lastErrorAt ?? null,
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
    if (!matchesFacet(i, filter)) return false
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
    <div className="p-6 space-y-7 max-w-7xl mx-auto" data-testid="integrations-page">
      {oauthStatus?.oauth === 'success' ? (
        <Card className="p-3 border-emerald-500/30 bg-emerald-500/5 text-sm" data-testid="integrations-oauth-success">
          {t('integrations.connectedSuccess', { provider: oauthStatus.provider })}
        </Card>
      ) : oauthStatus?.oauth === 'error' ? (
        <Card className="p-3 border-rose-500/30 bg-rose-500/5 text-sm space-y-2" data-testid="integrations-oauth-error">
          <div>
            {t('integrations.oauthFailed')}{oauthStatus.reason ? `: ${oauthStatus.reason}` : '.'}
          </div>
          {/*
            §V2-11 `18:39` — the banner gets the same way out as the card. The
            redirect that produces it now lands HERE rather than on the app
            root, which is what made this banner reachable at all.
          */}
          <HelpCentreLink testId="integrations-oauth-error-help" />
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCalendarSyncOpen(true)}
          data-testid="integrations-calendar-sync"
        >
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
          data-testid="integrations-search"
        />
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none bg-card/40 border border-border/60 rounded-lg p-1">
          {FACETS.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              data-testid={`integrations-category-${c.id}`}
              aria-pressed={filter === c.id}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="integrations-grid">
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
        <DialogContent data-testid="integration-connect-dialog" data-provider={activeIntegration?.id ?? ''}>
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
                  data-testid="integration-slack-webhook"
                />
                <Input
                  placeholder={t('integrations.channelNamePlaceholder')}
                  value={slackChannelName}
                  onChange={(e) => setSlackChannelName(e.target.value)}
                  data-testid="integration-slack-channel"
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
                          data-testid="integration-slack-rule-remove"
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
                      data-testid="integration-rule-webhook"
                    />
                    <Input
                      placeholder={t('integrations.eventsPlaceholder')}
                      value={ruleEvents}
                      onChange={(e) => setRuleEvents(e.target.value)}
                      className="h-8 text-xs"
                      data-testid="integration-rule-events"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={ruleSpaceId}
                        onChange={(e) => {
                          setRuleSpaceId(e.target.value)
                          setRuleProjectId('')
                        }}
                        aria-label={t('integrations.allProjects')}
                        data-testid="integration-rule-space"
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
                        aria-label={t('integrations.wholeSpace')}
                        data-testid="integration-rule-project"
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
                        data-testid="integration-rule-add"
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
              <Button
                variant="outline"
                onClick={() => setActiveIntegration(null)}
                data-testid="integration-connect-cancel"
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={runConnectFlow}
                data-testid="integration-connect-confirm"
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
  connection?: ConnectionState
}) {
  const { t } = useTranslation()
  return (
    <Card
      variant="glass"
      className="p-4 group transition-all hover:border-accent/40"
      data-testid="integration-card"
      data-provider={integration.id}
      data-health={connection?.health ?? 'none'}
    >
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

          {/*
            §V2-11, frame `18:39`. Rendered on the STORED message, so a card is
            only ever on screen because a provider actually said something —
            and it says what was said. A card that rendered a constant would be
            the facade defect wearing this exact layout.
          */}
          {connection?.lastError ? (
            <div
              className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/5 p-2.5 space-y-1.5"
              data-testid="integration-error-card"
              data-provider={integration.id}
            >
              <div className="flex items-start gap-1.5 text-[12px] font-medium" data-testid="integration-error-title">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden />
                <span>{t('integrations.errorTitle', { provider: integration.name })}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground" data-testid="integration-error-body">
                {t('integrations.errorBody', { provider: integration.name, error: connection.lastError })}
              </p>
              {connection.lastErrorAt ? (
                <p className="text-[10px] text-muted-foreground" data-testid="integration-error-when">
                  {t('integrations.errorWhen', { when: new Date(connection.lastErrorAt).toLocaleString() })}
                </p>
              ) : null}
              <HelpCentreLink testId="integration-error-help" />
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between">
            <Switch
              checked={connected}
              onCheckedChange={onToggle}
              disabled={integration.comingSoon || isLoading || !supported || !providerReady}
              data-testid="integration-toggle"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              data-testid="integration-action"
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
              {integration.comingSoon
                ? t('integrations.notAvailableYet')
                : !supported
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
