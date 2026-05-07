import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
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
} from '@rundesk/ui'
import {
  Search,
  Plug,
  CheckCircle2,
} from 'lucide-react'

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
  { id: 'linear', name: 'Linear', description: 'Two-way sync issues between Linear and Rundesk.', category: 'dev', comingSoon: true, brandColor: '#5E6AD2', logo: 'L' },

  { id: 'gcal', name: 'Google Calendar', description: 'Two-way sync due dates as calendar events.', category: 'calendar', popular: true, installed: true, brandColor: '#4285F4', logo: 'C' },
  { id: 'outlook', name: 'Outlook Calendar', description: 'Sync due dates with your Microsoft calendar.', category: 'calendar', brandColor: '#0078D4', logo: 'O' },
  { id: 'cal', name: 'Cal.com', description: 'Schedule meetings inline — auto-create prep doc.', category: 'calendar', brandColor: '#000', logo: 'C' },

  { id: 'amplitude', name: 'Amplitude', description: 'Track product analytics events from Rundesk widgets.', category: 'analytics', brandColor: '#1F71F4', logo: 'A' },
  { id: 'mixpanel', name: 'Mixpanel', description: 'Pipe usage events to your dashboard.', category: 'analytics', brandColor: '#7856FF', logo: 'M' },
  { id: 'posthog', name: 'PostHog', description: 'Self-hostable analytics for product teams.', category: 'analytics', brandColor: '#1D4AFF', logo: 'P' },

  { id: 'stripe', name: 'Stripe', description: 'Track billable client work and create invoices from time logs.', category: 'crm', brandColor: '#635BFF', logo: 'S' },
  { id: 'hubspot', name: 'HubSpot', description: 'Sync deals and contacts as Rundesk tasks.', category: 'crm', brandColor: '#FF7A59', logo: 'H' },
  { id: 'salesforce', name: 'Salesforce', description: 'Bidirectional opportunity sync.', category: 'crm', comingSoon: true, brandColor: '#00A1E0', logo: 'S' },

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

function IntegrationsMarketplacePage() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<typeof CATEGORIES[number]['id']>('all')
  const [connected, setConnected] = useState<Record<string, boolean>>(
    Object.fromEntries(INTEGRATIONS.map((i) => [i.id, Boolean(i.installed)])),
  )
  const [activeIntegration, setActiveIntegration] = useState<Integration | null>(null)
  const [oauthLoading, setOauthLoading] = useState(false)

  const filtered = INTEGRATIONS.filter((i) => {
    if (filter === 'installed') return connected[i.id]
    if (filter !== 'all' && i.category !== filter) return false
    return (
      i.name.toLowerCase().includes(query.toLowerCase()) ||
      i.description.toLowerCase().includes(query.toLowerCase())
    )
  })

  const installed = INTEGRATIONS.filter((i) => connected[i.id])

  const runConnectFlow = async () => {
    if (!activeIntegration) return
    setOauthLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 900))
    setConnected((prev) => ({ ...prev, [activeIntegration.id]: true }))
    setOauthLoading(false)
    setActiveIntegration(null)
  }

  return (
    <div className="p-6 space-y-7 max-w-7xl mx-auto">
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
            <Badge variant="outline" className="ml-1">Demo</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Connect Rundesk to the tools your team already uses. {installed.length} active.
          </p>
        </div>
      </header>

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
            connected={Boolean(connected[integration.id])}
            onToggle={(next) =>
              setConnected((prev) => ({ ...prev, [integration.id]: next }))
            }
            onOpenConnect={() => setActiveIntegration(integration)}
          />
        ))}
      </div>

      <Dialog open={Boolean(activeIntegration)} onOpenChange={(open) => !open && setActiveIntegration(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {activeIntegration?.name}</DialogTitle>
            <DialogDescription>
              OAuth simulation for demo submission. This flow stores connected state in the UI and opens provider-specific setup fields.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Workspace / Team ID" />
            <Input placeholder="Default channel / project (optional)" />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setActiveIntegration(null)}>
                Cancel
              </Button>
              <Button onClick={runConnectFlow} disabled={oauthLoading}>
                {oauthLoading ? 'Connecting…' : 'Authorize & Connect'}
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
  onToggle,
  onOpenConnect,
}: {
  integration: Integration
  connected: boolean
  onToggle: (next: boolean) => void
  onOpenConnect: () => void
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
          <div className="mt-3 flex items-center justify-between">
            <Switch
              checked={connected}
              onCheckedChange={onToggle}
              disabled={integration.comingSoon}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={integration.comingSoon}
              onClick={onOpenConnect}
            >
              {connected ? 'Configure' : 'Connect'}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
