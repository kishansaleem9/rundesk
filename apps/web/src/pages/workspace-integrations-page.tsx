import { useMemo, useState } from 'react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
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
import { usePermissions } from '../hooks/use-permissions'
import {
  Search,
  Plug,
  CheckCircle2,
  Calendar,
  XCircle,
  BookOpen,
  // §V2-11 frame `19:07` — the MCP banner's glyph and chevron, and the icon on
  // the rail's "Suggest an app" (a message box with a plus in it).
  Server,
  ChevronRight,
  MessageSquarePlus,
  Info,
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
type ConnectionHealth = 'healthy' | 'expiring' | 'expired' | 'disconnected' | 'owner_left'

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

/*
 * §V2-11, frame `19:07` — THE SIX APPS THE FRAME DRAWS AND THIS PAGE DID NOT.
 *
 * Box · Confluence · Jira · Gmail · Microsoft SharePoint · Outlook Mail. The
 * question a new tile has to answer first is not "what should it say" but
 * "what happens when somebody presses it", and the two honest answers are
 * different features:
 *
 *   CONNECTABLE — Gmail and SharePoint. Both were already federated search
 *   sources with a tab in the command palette and a "Connect" link beside it;
 *   `listSupportedProviders()` now holds a provider for each and
 *   `search.service.ts` a query path, so pressing Connect starts a real grant
 *   and the tab it feeds can answer. See `search/sources.ts` for the whole
 *   story, including why SharePoint stopped borrowing OneDrive's credential.
 *
 *   NOT CONNECTABLE, AND SAYING SO — Box, Confluence, Jira, and the Outlook
 *   Mail tile that was already here. Writing four more OAuth flows is a
 *   morning's work and would have been the WRONG morning: nothing in this
 *   product reads a Box or an Atlassian token. `tasks.service.ts` and
 *   `external-link-refresh.service.ts` refresh github / gitlab / google_drive /
 *   dropbox links, `search.service.ts` queries the three federated sources, and
 *   that is the complete list of readers. A grant stored for anything else is
 *   the mirror defect — the database standing as evidence for a feature that
 *   does not exist — and it is worse than the gap, because the gap is visible.
 *   So these tiles carry the plain sentence that Rundesk has no connector for
 *   them yet, and the one action that is real: telling the admins you want it.
 *
 * `comingSoon` is gone from this file. It was a hand-maintained second opinion
 * about connectability that had drifted from the server's: OneDrive, Linear and
 * Salesforce are all in `listSupportedProviders()` and all three were drawn
 * with a "Soon" badge over a disabled switch — three working connectors the
 * product told you it did not have. Connectability is now one fact, read from
 * the server, and no flag here can contradict it.
 */
const INTEGRATIONS: Integration[] = [
  { id: 'slack', name: 'Slack', descKey: 'integrations.desc.slack', category: 'comms', popular: true, brandColor: '#4A154B', logo: 'S' },
  { id: 'discord', name: 'Discord', descKey: 'integrations.desc.discord', category: 'comms', brandColor: '#5865F2', logo: 'D' },
  { id: 'teams', name: 'Microsoft Teams', descKey: 'integrations.desc.teams', category: 'comms', brandColor: '#5059C9', logo: 'T' },
  { id: 'zoom', name: 'Zoom', descKey: 'integrations.desc.zoom', category: 'comms', popular: true, brandColor: '#2D8CFF', logo: 'Z' },

  { id: 'google-drive', name: 'Google Drive', descKey: 'integrations.desc.googleDrive', category: 'storage', popular: true, connectedSearch: true, brandColor: '#1FA463', logo: 'G' },
  { id: 'dropbox', name: 'Dropbox', descKey: 'integrations.desc.dropbox', category: 'storage', brandColor: '#0061FF', logo: 'D' },
  // No longer `connectedSearch`. It carried that flag only because SharePoint
  // search borrowed this credential; SharePoint now has its own, and OneDrive
  // is not a member of `SEARCH_SOURCES`.
  { id: 'onedrive', name: 'OneDrive', descKey: 'integrations.desc.onedrive', category: 'storage', brandColor: '#0078D4', logo: 'O' },
  /*
   * Frame `19:07`, tile 10: "Microsoft SharePoint · Easily attach, create, and
   * search for SharePoint files dir…". A federated search source with its own
   * palette tab, its own Microsoft provider, and `Sites.Read.All` — the scope
   * that can actually answer a site-wide query.
   */
  { id: 'sharepoint', name: 'Microsoft SharePoint', descKey: 'integrations.desc.sharepoint', category: 'storage', connectedSearch: true, brandColor: '#038387', logo: 'S' },
  /*
   * Frame `19:07`, tile 1: "Box · Attach Box files to tasks, comments and
   * search for Box…". Not connectable: no reader anywhere consumes a Box
   * token, and an OAuth flow that stores one would be evidence for a feature
   * that does not exist.
   */
  { id: 'box', name: 'Box', descKey: 'integrations.desc.box', category: 'storage', brandColor: '#0061D5', logo: 'B' },
  // Moved out of Cloud Storage into Design (frame `19:07` lists both): Figma is
  // not a file store here, it is the thing the Design facet is about, and it
  // was the only reason that facet would otherwise have nothing behind it.
  { id: 'figma', name: 'Figma', descKey: 'integrations.desc.figma', category: 'design', brandColor: '#F24E1E', logo: 'F' },

  { id: 'github', name: 'GitHub', descKey: 'integrations.desc.github', category: 'dev', popular: true, brandColor: '#181717', logo: 'G' },
  { id: 'gitlab', name: 'GitLab', descKey: 'integrations.desc.gitlab', category: 'dev', brandColor: '#FC6D26', logo: 'G' },
  { id: 'sentry', name: 'Sentry', descKey: 'integrations.desc.sentry', category: 'dev', brandColor: '#362D59', logo: 'S' },
  { id: 'linear', name: 'Linear', descKey: 'integrations.desc.linear', category: 'dev', brandColor: '#5E6AD2', logo: 'L' },
  // Frame `19:07`, tile 8: "Jira · Preview, create, and search Jira issues all
  // within ClickUp." Atlassian, and nothing here reads an Atlassian token.
  { id: 'jira', name: 'Jira', descKey: 'integrations.desc.jira', category: 'dev', brandColor: '#0052CC', logo: 'J' },

  { id: 'gcal', name: 'Google Calendar', descKey: 'integrations.desc.gcal', category: 'calendar', popular: true, brandColor: '#4285F4', logo: 'C' },
  { id: 'outlook', name: 'Outlook Calendar', descKey: 'integrations.desc.outlook', category: 'calendar', brandColor: '#0078D4', logo: 'O' },
  { id: 'cal', name: 'Cal.com', descKey: 'integrations.desc.cal', category: 'calendar', brandColor: '#000', logo: 'C' },

  /*
   * Frame `19:07`, tile 5, and enlisted out loud at [19:18] — "Main is se
   * kahoongi meri Gmail pe jaa ke EMAIL kar do". `SEARCH_SOURCES` named `gmail`
   * from the start and there was no provider to connect it with; there is one
   * now, and a query behind it.
   */
  { id: 'gmail', name: 'Gmail', descKey: 'integrations.desc.gmail', category: 'email', connectedSearch: true, brandColor: '#EA4335', logo: 'M' },
  { id: 'outlook-mail', name: 'Outlook Mail', descKey: 'integrations.desc.outlookMail', category: 'email', brandColor: '#0F6CBD', logo: 'O' },

  { id: 'notion', name: 'Notion', descKey: 'integrations.desc.notion', category: 'knowledge', brandColor: '#111', logo: 'N' },
  // Frame `19:07`, tile 2: "Confluence · Search Confluence inside ClickUp."
  { id: 'confluence', name: 'Confluence', descKey: 'integrations.desc.confluence', category: 'knowledge', brandColor: '#172B4D', logo: 'C' },

  { id: 'toggl', name: 'Toggl Track', descKey: 'integrations.desc.toggl', category: 'timeTracking', brandColor: '#E57CD8', logo: 'T' },

  { id: 'amplitude', name: 'Amplitude', descKey: 'integrations.desc.amplitude', category: 'analytics', brandColor: '#1F71F4', logo: 'A' },
  { id: 'mixpanel', name: 'Mixpanel', descKey: 'integrations.desc.mixpanel', category: 'analytics', brandColor: '#7856FF', logo: 'M' },
  { id: 'posthog', name: 'PostHog', descKey: 'integrations.desc.posthog', category: 'analytics', brandColor: '#1D4AFF', logo: 'P' },

  // Stripe pays for things; it is not a CRM. Moved into Finance & Accounting,
  // which the frame lists and which its own description already describes
  // ("track billable client work and create invoices from time logs").
  { id: 'stripe', name: 'Stripe', descKey: 'integrations.desc.stripe', category: 'finance', brandColor: '#635BFF', logo: 'S' },
  { id: 'hubspot', name: 'HubSpot', descKey: 'integrations.desc.hubspot', category: 'crm', brandColor: '#FF7A59', logo: 'H' },
  { id: 'salesforce', name: 'Salesforce', descKey: 'integrations.desc.salesforce', category: 'crm', brandColor: '#00A1E0', logo: 'S' },

  { id: 'zapier', name: 'Zapier', descKey: 'integrations.desc.zapier', category: 'dev', popular: true, brandColor: '#FF4F00', logo: 'Z' },
  { id: 'make', name: 'Make (Integromat)', descKey: 'integrations.desc.make', category: 'dev', brandColor: '#6D00CC', logo: 'M' },
  { id: 'webhook', name: 'Custom webhooks', descKey: 'integrations.desc.webhook', category: 'dev', brandColor: '#0c215d', logo: 'W' },

  { id: 'openai', name: 'OpenAI', descKey: 'integrations.desc.openai', category: 'ai', brandColor: '#10A37F', logo: 'A' },
  { id: 'gemini', name: 'Google Gemini', descKey: 'integrations.desc.gemini', category: 'ai', brandColor: '#1F71F4', logo: 'G' },
]

/**
 * §V2-11, frame `19:07` — the banner above the grid, and the rail item below
 * the facets. Both write through the access-request path, which is why they
 * are named here: the value reaches Postgres, a notification title and a badge,
 * and `custom-mcp` must not collide with a real provider id.
 */
const CUSTOM_MCP_PROVIDER = 'custom-mcp'

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
  // Opened at one app (`?app=`, the palette's Connect): the search starts at its name.
  const { app: openedAt } = useSearch({ from: '/app/$workspaceId/integrations' })
  const qc = useQueryClient()
  const [query, setQuery] = useState(() => INTEGRATIONS.find((i) => i.id === openedAt)?.name ?? '')
  // Connecting an app is `integrations.manage`'s (the connect and Slack routes).
  const mayConnect = usePermissions(workspaceId).can('integrations.manage')
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
  /**
   * §V2-11 frame `19:07` — the two controls the rail and the banner open.
   *
   * Both are dialogs rather than links: there is nowhere for either to navigate
   * to, and a chevron that goes nowhere is the dead control this audit keeps
   * finding. What each one can honestly do is recorded against this workspace
   * and put in front of the people who can act on it.
   */
  const [mcpOpen, setMcpOpen] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestName, setSuggestName] = useState('')
  const [suggestNote, setSuggestNote] = useState('')
  const [suggestError, setSuggestError] = useState<string | null>(null)
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
  /*
   * §V2-11 — WHICH APPS CAN BE CONNECTED IS THE SERVER'S ANSWER, NOT OURS.
   *
   * This used to fall back to a ten-name list written out here when the request
   * had not answered. That is the duplicated-list defect with a timer on it:
   * the copy went stale the moment `listSupportedProviders()` grew, and for as
   * long as the page was loading it drew every tile according to last year's
   * idea of what exists. The fallback is gone — before the answer arrives no
   * app is connectable, and no tile says it cannot be either: that would be an
   * answer nobody gave (`catalogueState`, below).
   */
  const oauthProviders = useMemo(
    () => new Set(providersQuery.data ?? []),
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
  /**
   * §V2-11 frame `19:07` — "Suggest an app" and the MCP banner, written down.
   *
   * The same endpoint the tiles use, because it is the same act: telling the
   * people who can add an integration that somebody wants it. The difference is
   * only that the name is typed rather than picked, which is exactly why the
   * SERVER now bounds it — see `MAX_PROVIDER_LENGTH` in the connections
   * service. The refusal is surfaced here verbatim instead of being swallowed:
   * a suggestion that vanishes is worse than one that is declined.
   */
  const suggestApp = useMutation({
    mutationFn: async ({ name, note }: { name: string; note: string }) => {
      const qs = new URLSearchParams({ provider: name })
      if (note.trim()) qs.set('note', note.trim())
      const res = await api<unknown>(
        `/workspaces/${workspaceId}/integrations/connections/access-requests?${qs.toString()}`,
        { method: 'POST' },
      )
      return res
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['integration-access-requests', workspaceId] })
      setSuggestName('')
      setSuggestNote('')
      setSuggestError(null)
      setSuggestOpen(false)
      toast.success(t('integrations.toastAccessRequested'))
    },
    onError: (error: unknown) => {
      setSuggestError(
        error instanceof Error && error.message ? error.message : t('integrations.suggestFailed'),
      )
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

  /**
   * The banner's own request row, if this workspace has already asked. Read
   * from the same list the tiles read, so the banner cannot disagree with them
   * about whether something was submitted.
   */
  const mcpRequest = accessRequestByProvider.get(CUSTOM_MCP_PROVIDER)

  /*
   * THE TILES SAY NOTHING UNTIL WHAT THEY ARE DRAWN FROM HAS ANSWERED
   * (`found-6-oct/app-tiles-say-cannot-connect-before-the-server-answers`).
   * Until the provider list arrived, every tile but Slack's said Rundesk has no
   * connector for it and offered Request access — Gmail's and SharePoint's
   * too — and an admin's Connect read Request access until their permissions
   * arrived. A tile whose answer is not in says it is checking, and the page
   * says which it is: `known` once the provider list, the providers' status,
   * the connections and the reader's permissions have answered; `failed`, with
   * a way to ask again, when the provider list could not be read.
   */
  const catalogueState = providersQuery.isError
    ? 'failed'
    : providersQuery.isSuccess && mayConnect !== null && !providerStatusQuery.isPending && !connectionsQuery.isPending
    ? 'known'
    : 'checking'

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
  /**
   * One fact, one source: an app is connectable when the server holds a way to
   * connect it. Slack is the one non-OAuth connector and is named explicitly
   * rather than folded into the provider list, because its credential is a
   * webhook URL somebody pastes and not a grant.
   */
  const isSupportedIntegration = (integration: Integration) =>
    integration.id === 'slack' || oauthProviders.has(integration.id)
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
    <div className="p-6 space-y-7 max-w-7xl mx-auto" data-testid="integrations-page" data-state={catalogueState}>
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
        {/*
          §V2-11 frame `19:07` — the rail's own heading.

          The frame groups the fourteen facets under INTEGRATIONS and puts one
          item under a SECOND heading, AI. Reproduced as two labelled groups
          rather than fifteen chips in a row, because the grouping is the
          information: "Suggest an app" does not filter anything, and a person
          who reads it as a fifteenth filter presses it expecting the grid to
          change.
        */}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0"
            data-testid="integrations-rail-heading-integrations"
          >
            {t('integrations.railIntegrations')}
          </span>
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
        {/*
          The AI group. One item, exactly as the frame draws it — and outside
          the `integrations-category-` namespace on purpose: a testid prefix is
          a namespace, and the suite that counts the frame's fourteen facets
          counts every element under that prefix.
        */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-[10px] uppercase tracking-widest text-muted-foreground"
            data-testid="integrations-rail-heading-ai"
          >
            {t('integrations.railAi')}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            data-testid="integrations-suggest-app"
            onClick={() => {
              setSuggestError(null)
              setSuggestOpen(true)
            }}
          >
            <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />
            {t('integrations.suggestApp')}
          </Button>
        </div>
      </div>

      {/*
        §V2-11 frame `19:07` — the full-width banner above the grid:

          [icon] Connect Custom MCP Servers                              ›
                 Give AI access to any tool or data source.

        WHAT IT DOES NOT DO, and why that is the honest build. Registering an
        MCP server means storing a URL and a credential for the AI to call, and
        `COMMAND_TOOLS` in `apps/api/src/modules/ai/ai-command.ts` reaches
        outside this product only through a person's own connected calendar,
        mailbox and Connected Search (`ledger-rows/row-2294`) — no tool calls a
        server a workspace registers. A form that stored a server nobody would ever call is the mirror defect:
        rows in Postgres standing as evidence for a feature that does not exist,
        and a person who pointed their AI at a tool and watched it be ignored.

        So the banner is a live control that says what the product can and
        cannot do today, and records the ask against this workspace where the
        admins will see it. It is not a link with nowhere to go.
      */}
      <button
        type="button"
        onClick={() => setMcpOpen(true)}
        data-testid="integrations-mcp-banner"
        className="w-full flex items-center gap-3 rounded-lg border border-border/60 bg-card/50 px-4 py-3 text-left transition-colors hover:bg-card/80"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
          <Server className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium" data-testid="integrations-mcp-title">
            {t('integrations.mcpTitle')}
          </span>
          <span className="block text-xs text-muted-foreground" data-testid="integrations-mcp-subtitle">
            {t('integrations.mcpSubtitle')}
          </span>
        </span>
        {/*
          A `<span>`, not the shared `Badge`: that component renders a `<div>`,
          and a `<div>` inside a `<button>` is not phrasing content. It renders
          anyway, which is how this sort of thing survives.
        */}
        {mcpRequest ? (
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide',
              mcpRequest.status === 'rejected'
                ? 'border-rose-500/40 text-rose-600 dark:text-rose-400'
                : mcpRequest.status === 'approved'
                ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                : 'border-sky-500/40 text-sky-600 dark:text-sky-400',
            )}
            data-testid="integrations-mcp-status"
          >
            {mcpRequest.status === 'rejected'
              ? t('integrations.rejected')
              : mcpRequest.status === 'approved'
              ? t('integrations.approved')
              : t('integrations.requested')}
          </span>
        ) : null}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {catalogueState === 'failed' ? (
        <Card
          className="p-3 border-rose-500/30 bg-rose-500/5 text-sm flex items-center justify-between gap-3"
          data-testid="integrations-catalogue-failed"
        >
          <span>{t('integrations.catalogueFailed')}</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void providersQuery.refetch()}>
            {t('common.retry')}
          </Button>
        </Card>
      ) : null}

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
            // Not known until the provider list answers; Slack is not on it.
            supported={integration.id === 'slack' || providersQuery.isSuccess ? isSupportedIntegration(integration) : null}
            connection={connectionByProvider.get(integration.id)}
            setupReason={oauthProviders.has(integration.id) ? providerAvailability.get(integration.id)?.reason : undefined}
            providerReady={isProviderReady(integration)}
            accessRequest={accessRequestByProvider.get(integration.id)}
            onRequestAccess={() => requestAccess.mutate(integration.id)}
            mayConnect={mayConnect}
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

      {/*
        §V2-11 frame `19:07` — behind the banner.

        It states the limit in the product's own terms and then offers the one
        action that is real. The alternative — a URL field and a "Save" — would
        photograph better and would be a lie told in a database.
      */}
      <Dialog open={mcpOpen} onOpenChange={setMcpOpen}>
        <DialogContent data-testid="integrations-mcp-dialog">
          <DialogHeader>
            <DialogTitle>{t('integrations.mcpTitle')}</DialogTitle>
            <DialogDescription>{t('integrations.mcpSubtitle')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div
              className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed"
              data-testid="integrations-mcp-limitation"
            >
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <span>{t('integrations.mcpNotYet')}</span>
            </div>
            {mcpRequest?.note ? (
              <p className="text-[11px] text-muted-foreground" data-testid="integrations-mcp-note">
                {t('integrations.adminNote')} {mcpRequest.note}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setMcpOpen(false)} data-testid="integrations-mcp-cancel">
                {t('common.cancel')}
              </Button>
              <Button
                data-testid="integrations-mcp-request"
                disabled={
                  requestAccess.isPending ||
                  mcpRequest?.status === 'pending' ||
                  mcpRequest?.status === 'approved'
                }
                onClick={() => requestAccess.mutate(CUSTOM_MCP_PROVIDER)}
              >
                {mcpRequest?.status === 'pending'
                  ? t('integrations.requested')
                  : mcpRequest?.status === 'approved'
                  ? t('integrations.approved')
                  : mcpRequest?.status === 'rejected'
                  ? t('integrations.requestAgain')
                  : t('integrations.mcpRequest')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/*
        §V2-11 frame `19:07` — the rail's AI group: "Suggest an app".

        A typed name goes through the same access-request endpoint the tiles
        use, because it is the same act. The server bounds the name; the
        refusal is shown here rather than swallowed, so a suggestion that is
        too long is declined out loud instead of disappearing.
      */}
      <Dialog
        open={suggestOpen}
        onOpenChange={(open) => {
          setSuggestOpen(open)
          if (!open) setSuggestError(null)
        }}
      >
        <DialogContent data-testid="integrations-suggest-dialog">
          <DialogHeader>
            <DialogTitle>{t('integrations.suggestApp')}</DialogTitle>
            <DialogDescription>{t('integrations.suggestDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder={t('integrations.suggestNamePlaceholder')}
              value={suggestName}
              onChange={(e) => setSuggestName(e.target.value)}
              data-testid="integrations-suggest-name"
            />
            <Input
              placeholder={t('integrations.suggestNotePlaceholder')}
              value={suggestNote}
              onChange={(e) => setSuggestNote(e.target.value)}
              data-testid="integrations-suggest-note"
            />
            {suggestError ? (
              <p className="text-[11px] text-rose-600 dark:text-rose-400" data-testid="integrations-suggest-error">
                {suggestError}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setSuggestOpen(false)}
                data-testid="integrations-suggest-cancel"
              >
                {t('common.cancel')}
              </Button>
              <Button
                data-testid="integrations-suggest-submit"
                disabled={!suggestName.trim() || suggestApp.isPending}
                onClick={() => {
                  setSuggestError(null)
                  suggestApp.mutate({ name: suggestName.trim(), note: suggestNote })
                }}
              >
                {suggestApp.isPending ? t('integrations.connecting') : t('integrations.suggestSubmit')}
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
  mayConnect,
}: {
  integration: Integration
  connected: boolean
  isLoading?: boolean
  onToggle: (next: boolean) => void
  onOpenConnect: () => void
  /** Whether Rundesk can connect it; null until the provider list answers. */
  supported: boolean | null
  providerReady: boolean
  setupReason?: string
  accessRequest?: { status: 'pending' | 'approved' | 'rejected'; note?: string | null; updatedAt?: string }
  onRequestAccess: () => void
  connection?: ConnectionState
  /** `integrations.manage`, the key the connect route asks for; null until known. */
  mayConnect: boolean | null
}) {
  const { t } = useTranslation()
  /*
   * A TILE THE VIEWER CANNOT CONNECT IS A REQUEST, NOT A SWITCH: an app Rundesk
   * has no connector for, or one only `integrations.manage` connects. Every
   * member was offered a live switch and Connect, and the connect route refused
   * them (`product-siblings/custom-role-permissions-unread-by-web`); ClickUp's
   * member finds a workspace connection's option unavailable. Connected, there
   * is nothing for them to ask for, and nothing to press.
   */
  // Until the provider list and the reader's permissions answer, the tile is
  // neither a request nor a switch: it says it is checking.
  const known = supported !== null && mayConnect !== null
  const asks = known && (!supported || (mayConnect === false && !connected))
  const actionless = known && supported && mayConnect === false && connected
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
              {asks && accessRequest?.status === 'rejected' ? (
                <Badge variant="destructive" className="text-[9px] uppercase">{t('integrations.rejected')}</Badge>
              ) : asks && accessRequest?.status === 'approved' ? (
                <Badge variant="success" className="text-[9px] uppercase">{t('integrations.approved')}</Badge>
              ) : asks && accessRequest?.status === 'pending' ? (
                <Badge variant="info" className="text-[9px] uppercase">{t('integrations.requested')}</Badge>
              ) : supported === false ? (
                <Badge variant="secondary" className="text-[9px] uppercase">{t('integrations.unavailable')}</Badge>
              ) : !providerReady ? (
                <Badge variant="warning" className="text-[9px] uppercase">{t('integrations.setupRequired')}</Badge>
              ) : connection?.health === 'owner_left' ? (
                <Badge variant="warning" className="text-[9px] uppercase">{t('integrations.ownerLeft')}</Badge>
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
          {/*
            §V2-11 frame `19:07` — A TILE THAT CANNOT CONNECT SAYS SO, IN WORDS.

            A badge reading "Soon" over a greyed switch is not an explanation:
            it looks like a schedule and it is actually a statement about what
            this product does not have. This is the sentence, on the tile, next
            to the only button that does anything — and it is driven by the
            server's provider list, so it appears on exactly the apps Rundesk
            genuinely cannot connect and cannot be left behind on one that has
            since become connectable.
          */}
          {supported === false && (
            <p
              className="text-[11px] text-muted-foreground mt-1 leading-relaxed"
              data-testid="integration-not-connectable"
              data-provider={integration.id}
            >
              {t('integrations.notConnectable')}
            </p>
          )}
          {supported && mayConnect === false && (
            <p
              className="text-[11px] text-muted-foreground mt-1 leading-relaxed"
              data-testid="integration-needs-permission"
              data-provider={integration.id}
            >
              {t('integrations.needsPermission')}
            </p>
          )}
          {/* Its owner has left the workspace: say so, and what to do (`found-6-oct/calendar-pull-uses-a-leavers-connection`). */}
          {connection?.health === 'owner_left' && (
            <p
              className="text-[11px] text-amber-700 dark:text-amber-300 mt-1 leading-relaxed"
              data-testid="integration-owner-left"
              data-provider={integration.id}
            >
              {t('integrations.ownerLeftWhy')}
            </p>
          )}
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
          {asks && accessRequest?.note ? (
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              {t('integrations.adminNote')} {accessRequest.note}
            </p>
          ) : null}
          {asks && accessRequest?.updatedAt ? (
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
              disabled={isLoading || !supported || !providerReady || mayConnect !== true}
              data-testid="integration-toggle"
            />
            {/*
              EVERY TILE CAN BE ACTED ON. That is the deliverable, and it is
              why there is no longer a branch here that renders a disabled
              button labelled "Not available yet". A tile you cannot connect
              offers the one thing that is real — telling the people who can
              that you want it — and reports what came back. Only a request
              already pending or already granted disables it, because pressing
              it again would do nothing and the label says which. The one tile
              with nothing to act on is an app already connected, for somebody
              who may not manage it: it says Connected, and offers no button.
            */}
            {!actionless && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                data-testid="integration-action"
                data-actionable={
                  !known ||
                  isLoading ||
                  (asks &&
                    (accessRequest?.status === 'pending' || accessRequest?.status === 'approved'))
                    ? 'no'
                    : 'yes'
                }
                disabled={
                  !known ||
                  isLoading ||
                  (asks &&
                    (accessRequest?.status === 'pending' || accessRequest?.status === 'approved'))
                }
                onClick={() => {
                  if (asks) {
                    onRequestAccess()
                    return
                  }
                  onOpenConnect()
                }}
              >
                {!known
                  ? t('integrations.checking')
                  : asks
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
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
