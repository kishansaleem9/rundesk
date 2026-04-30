import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Badge, Button, Card, Input, Switch, Textarea } from '@rundesk/ui'
import {
  Building2,
  CreditCard,
  Database,
  Download,
  Lock,
  Receipt,
  Search,
  Shield,
  Users,
} from 'lucide-react'

type Org = {
  id: string
  name: string
  plan: 'Starter' | 'Growth' | 'Enterprise'
  users: number
  status: 'active' | 'past_due' | 'trial'
  mrr: number
  renewsOn: string
}

const ORGS: Org[] = [
  { id: 'org_1', name: 'Acme Inc', plan: 'Enterprise', users: 184, status: 'active', mrr: 7900, renewsOn: '2026-06-01' },
  { id: 'org_2', name: 'Northstar Labs', plan: 'Growth', users: 47, status: 'active', mrr: 1490, renewsOn: '2026-05-20' },
  { id: 'org_3', name: 'BrightOps', plan: 'Starter', users: 13, status: 'past_due', mrr: 290, renewsOn: '2026-05-04' },
]

const ALL_FEATURES = [
  { key: 'ai', label: 'AI Hub', desc: 'Show AI section in sidebar' },
  { key: 'teams', label: 'Teams', desc: 'Enable Teams hub and collaboration rails' },
  { key: 'docs', label: 'Docs', desc: 'Enable Docs hub and document editing' },
  { key: 'dashboard', label: 'Dashboards', desc: 'Enable Dashboard hub and widgets' },
  { key: 'whiteboards', label: 'Whiteboards', desc: 'Enable Whiteboards hub' },
  { key: 'forms', label: 'Forms', desc: 'Enable Forms hub' },
  { key: 'more', label: 'More / Integrations', desc: 'Expose additional hubs and integrations' },
] as const

type FeatureKey = (typeof ALL_FEATURES)[number]['key']
type FeatureState = Record<FeatureKey, boolean>

function defaultFeatures(): FeatureState {
  return {
    ai: true,
    teams: true,
    docs: true,
    dashboard: true,
    whiteboards: true,
    forms: true,
    more: true,
  }
}

export function MasterAdminPanel() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedOrgId, setSelectedOrgId] = useState(ORGS[0].id)
  const [seatDelta, setSeatDelta] = useState('0')
  const [internalNote, setInternalNote] = useState('')
  const [impersonatedOrgId, setImpersonatedOrgId] = useState<string | null>(null)
  const [featureByOrg, setFeatureByOrg] = useState<Record<string, FeatureState>>(() =>
    Object.fromEntries(ORGS.map((o) => [o.id, defaultFeatures()])),
  )

  const filtered = useMemo(
    () =>
      ORGS.filter((o) =>
        `${o.name} ${o.plan} ${o.status}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  )
  const selectedOrg = ORGS.find((o) => o.id === selectedOrgId) ?? ORGS[0]
  const featureState = featureByOrg[selectedOrg.id] ?? defaultFeatures()

  const setFeature = (key: FeatureKey, enabled: boolean) => {
    setFeatureByOrg((prev) => ({
      ...prev,
      [selectedOrg.id]: { ...(prev[selectedOrg.id] ?? defaultFeatures()), [key]: enabled },
    }))
  }

  const pushToSidebarPreview = () => {
    const payload = {
      orgId: selectedOrg.id,
      visibility: featureState,
      updatedAt: Date.now(),
    }
    localStorage.setItem('rundesk.sidebarVisibility', JSON.stringify(payload))
    window.dispatchEvent(new StorageEvent('storage', { key: 'rundesk.sidebarVisibility' }))
  }

  const impersonateOrg = () => {
    localStorage.setItem(
      'rundesk.superAdminImpersonation',
      JSON.stringify({
        orgId: selectedOrg.id,
        orgName: selectedOrg.name,
        startedAt: Date.now(),
      }),
    )
    setImpersonatedOrgId(selectedOrg.id)
    navigate({ to: '/app' })
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl">
      <header className="space-y-2">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Super panel</div>
        <h1 className="font-display text-3xl font-semibold">Master Tenant Control Center</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Manage purchased organizations, subscriptions, invoices, data controls, and tenant-level feature visibility.
        </p>
        {impersonatedOrgId && (
          <div className="text-xs text-success">
            Impersonation mode active for {ORGS.find((o) => o.id === impersonatedOrgId)?.name}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5">
        <Card className="p-4 space-y-3 h-fit">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-accent" />
            <h2 className="font-semibold">Organizations</h2>
          </div>
          <Input
            leadingIcon={<Search className="h-4 w-4" />}
            placeholder="Search orgs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
            {filtered.map((org) => (
              <button
                key={org.id}
                onClick={() => setSelectedOrgId(org.id)}
                className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                  org.id === selectedOrg.id
                    ? 'border-brand-500 bg-accent/10'
                    : 'border-border hover:bg-card/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{org.name}</span>
                  <Badge variant={org.status === 'active' ? 'success' : org.status === 'past_due' ? 'warning' : 'soft'}>
                    {org.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {org.plan} · {org.users} users · ${org.mrr.toLocaleString()}/mo
                </div>
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <Metric icon={Users} label="Seats" value={selectedOrg.users.toString()} />
            <Metric icon={CreditCard} label="Plan" value={selectedOrg.plan} />
            <Metric icon={Receipt} label="MRR" value={`$${selectedOrg.mrr.toLocaleString()}`} />
            <Metric icon={Shield} label="Renewal" value={selectedOrg.renewsOn} />
          </Card>
          <div className="flex items-center gap-2">
            <Button variant="gradient" onClick={impersonateOrg}>
              Impersonate {selectedOrg.name}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                localStorage.removeItem('rundesk.superAdminImpersonation')
                setImpersonatedOrgId(null)
              }}
            >
              Clear impersonation
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-accent" />
                Subscription Management
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <button className="rounded border border-border px-3 py-2 hover:bg-card/60 text-left">Upgrade to Enterprise</button>
                <button className="rounded border border-border px-3 py-2 hover:bg-card/60 text-left">Downgrade Plan</button>
                <button className="rounded border border-border px-3 py-2 hover:bg-card/60 text-left">Pause Subscription</button>
                <button className="rounded border border-border px-3 py-2 hover:bg-card/60 text-left">Cancel at Renewal</button>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground mb-1">Seat Adjustment</div>
                  <Input value={seatDelta} onChange={(e) => setSeatDelta(e.target.value)} placeholder="+10 or -5" />
                </div>
                <Button>Apply Seats</Button>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Receipt className="h-4 w-4 text-accent" />
                Invoicing & Billing
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <button className="rounded border border-border px-3 py-2 hover:bg-card/60">Generate Invoice</button>
                <button className="rounded border border-border px-3 py-2 hover:bg-card/60">Retry Payment</button>
                <button className="rounded border border-border px-3 py-2 hover:bg-card/60">Apply Credit Note</button>
                <button className="rounded border border-border px-3 py-2 hover:bg-card/60">Send Reminder</button>
              </div>
              <Button variant="outline" className="w-full">
                <Download className="h-4 w-4 mr-1" />
                Export Billing History (CSV)
              </Button>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Database className="h-4 w-4 text-accent" />
                Tenant Data Controls
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <button className="rounded border border-border px-3 py-2 hover:bg-card/60 text-left">View Data Usage</button>
                <button className="rounded border border-border px-3 py-2 hover:bg-card/60 text-left">Export Full Tenant Data</button>
                <button className="rounded border border-border px-3 py-2 hover:bg-card/60 text-left">Archive Tenant</button>
                <button className="rounded border border-destructive/50 px-3 py-2 hover:bg-destructive/10 text-left text-destructive">
                  Delete Tenant (Hard)
                </button>
              </div>
              <Textarea
                rows={3}
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="Internal operator note..."
              />
            </Card>

            <Card className="p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4 text-accent" />
                Tenant Feature Visibility (Sidebar)
              </h3>
              <div className="space-y-2">
                {ALL_FEATURES.map((f) => (
                  <div key={f.key} className="flex items-center gap-3 justify-between rounded border border-border px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{f.label}</div>
                      <div className="text-xs text-muted-foreground">{f.desc}</div>
                    </div>
                    <Switch checked={featureState[f.key]} onCheckedChange={(v) => setFeature(f.key, v)} />
                  </div>
                ))}
              </div>
              <Button onClick={pushToSidebarPreview}>
                Apply to Tenant Sidebar
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Applies to current UI preview by writing `rundesk.sidebarVisibility` in localStorage.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users
  label: string
  value: string
}) {
  return (
    <div className="rounded border border-border p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="font-display text-2xl mt-1">{value}</div>
    </div>
  )
}
