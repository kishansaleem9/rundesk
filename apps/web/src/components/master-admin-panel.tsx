import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Input, Switch, toast } from '@rundesk/ui'
import {
  Activity,
  AlertTriangle,
  Building2,
  Cpu,
  CreditCard,
  Database,
  DollarSign,
  Gauge,
  HardDrive,
  Lock,
  Percent,
  Receipt,
  Search,
  Shield,
  TrendingUp,
  Users,
} from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { InlineSkeleton } from './loading-skeletons'

type Org = {
  id: string
  name: string
  slug: string
  users: number
  workspaces: number
  status: 'active'
  createdAt: string
}

type TFunc = (key: TranslationKey, vars?: Record<string, string | number>) => string

// `key` is the canonical, locale-independent feature identifier persisted to
// localStorage; `labelKey` / `descKey` reference i18n catalog entries used only
// for display in the panel.
const ALL_FEATURES = [
  { key: 'ai', labelKey: 'masterAdmin.feature.ai.label', descKey: 'masterAdmin.feature.ai.desc' },
  { key: 'teams', labelKey: 'masterAdmin.feature.teams.label', descKey: 'masterAdmin.feature.teams.desc' },
  { key: 'docs', labelKey: 'masterAdmin.feature.docs.label', descKey: 'masterAdmin.feature.docs.desc' },
  { key: 'dashboard', labelKey: 'masterAdmin.feature.dashboard.label', descKey: 'masterAdmin.feature.dashboard.desc' },
  { key: 'whiteboards', labelKey: 'masterAdmin.feature.whiteboards.label', descKey: 'masterAdmin.feature.whiteboards.desc' },
  { key: 'forms', labelKey: 'masterAdmin.feature.forms.label', descKey: 'masterAdmin.feature.forms.desc' },
  { key: 'more', labelKey: 'masterAdmin.feature.more.label', descKey: 'masterAdmin.feature.more.desc' },
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

function statusLabel(t: TFunc, status: string): string {
  if (status === 'active') return t('masterAdmin.status.active')
  if (status === 'past_due') return t('masterAdmin.status.pastDue')
  return status.replace(/_/g, ' ')
}

export function MasterAdminPanel() {
  const { t, tCount } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [impersonatedOrgId, setImpersonatedOrgId] = useState<string | null>(null)
  const orgsQuery = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: async () => {
      const rows = await api<Array<{
        id: string
        name: string
        slug: string
        membersCount: number
        workspacesCount: number
        createdAt: string
      }>>('/organizations')
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        users: row.membersCount ?? 0,
        workspaces: row.workspacesCount ?? 0,
        status: 'active' as const,
        createdAt: row.createdAt,
      }))
    },
  })
  const orgs = orgsQuery.data ?? []
  const selectedOrg = useMemo(() => {
    if (orgs.length === 0) return null
    return orgs.find((o) => o.id === selectedOrgId) ?? orgs[0]
  }, [orgs, selectedOrgId])
  const [featureByOrg, setFeatureByOrg] = useState<Record<string, FeatureState>>(() => ({}))

  const filtered = useMemo(
    () =>
      orgs.filter((o) =>
        `${o.name} ${o.slug} ${o.status}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, orgs],
  )
  const featureState = selectedOrg ? (featureByOrg[selectedOrg.id] ?? defaultFeatures()) : defaultFeatures()

  const setFeature = (key: FeatureKey, enabled: boolean) => {
    if (!selectedOrg) return
    setFeatureByOrg((prev) => ({
      ...prev,
      [selectedOrg.id]: { ...(prev[selectedOrg.id] ?? defaultFeatures()), [key]: enabled },
    }))
  }

  const pushToSidebarPreview = () => {
    if (!selectedOrg) return
    const payload = {
      orgId: selectedOrg.id,
      visibility: featureState,
      updatedAt: Date.now(),
    }
    localStorage.setItem('rundesk.sidebarVisibility', JSON.stringify(payload))
    window.dispatchEvent(new StorageEvent('storage', { key: 'rundesk.sidebarVisibility' }))
  }

  const impersonateOrg = () => {
    if (!selectedOrg) return
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
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{t('masterAdmin.eyebrow')}</div>
        <h1 className="font-display text-3xl font-semibold">{t('masterAdmin.title')}</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          {t('masterAdmin.subtitle')}
        </p>
        {impersonatedOrgId && (
          <div className="text-xs text-success">
            {t('masterAdmin.impersonationActive', { name: orgs.find((o) => o.id === impersonatedOrgId)?.name ?? '' })}
          </div>
        )}
      </header>

      <OpsMetricsSection />

      <TenantDatabasesSection />

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5">
        <Card className="p-4 space-y-3 h-fit">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-accent" />
            <h2 className="font-semibold">{t('masterAdmin.organizations')}</h2>
          </div>
          <Input
            leadingIcon={<Search className="h-4 w-4" />}
            placeholder={t('masterAdmin.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
            {orgsQuery.isLoading && (
              <div className="text-xs text-muted-foreground px-1 py-2"><InlineSkeleton /></div>
            )}
            {orgsQuery.isError && (
              <div className="text-xs text-destructive px-1 py-2">{t('masterAdmin.loadError')}</div>
            )}
            {filtered.map((org) => (
              <button
                key={org.id}
                onClick={() => setSelectedOrgId(org.id)}
                className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                  org.id === selectedOrg?.id
                    ? 'border-brand-500 bg-accent/10'
                    : 'border-border hover:bg-card/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{org.name}</span>
                  <Badge variant={org.status === 'active' ? 'success' : org.status === 'past_due' ? 'warning' : 'soft'}>
                    {statusLabel(t, org.status)}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {tCount('masterAdmin.usersCount', org.users)} · {tCount('masterAdmin.workspacesCount', org.workspaces)}
                </div>
              </button>
            ))}
            {!orgsQuery.isLoading && filtered.length === 0 && (
              <div className="text-xs text-muted-foreground px-1 py-2">{t('masterAdmin.noOrgsFound')}</div>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          {!selectedOrg ? (
            <Card className="p-6 text-sm text-muted-foreground">
              {t('masterAdmin.noOrgsAvailable')}
            </Card>
          ) : (
            <>
          <Card className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <Metric icon={Users} label={t('masterAdmin.metric.seats')} value={selectedOrg.users.toString()} />
            <Metric icon={CreditCard} label={t('masterAdmin.metric.status')} value={statusLabel(t, selectedOrg.status)} />
            <Metric icon={Receipt} label={t('masterAdmin.metric.slug')} value={selectedOrg.slug} />
            <Metric icon={Shield} label={t('masterAdmin.metric.created')} value={new Date(selectedOrg.createdAt).toLocaleDateString()} />
          </Card>
          <div className="flex items-center gap-2">
            <Button variant="gradient" onClick={impersonateOrg}>
              {t('masterAdmin.impersonate', { name: selectedOrg.name })}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                localStorage.removeItem('rundesk.superAdminImpersonation')
                setImpersonatedOrgId(null)
              }}
            >
              {t('masterAdmin.clearImpersonation')}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-5">
            <Card className="p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4 text-accent" />
                {t('masterAdmin.featureVisibilityTitle')}
              </h3>
              <div className="space-y-2">
                {ALL_FEATURES.map((f) => (
                  <div key={f.key} className="flex items-center gap-3 justify-between rounded border border-border px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{t(f.labelKey)}</div>
                      <div className="text-xs text-muted-foreground">{t(f.descKey)}</div>
                    </div>
                    <Switch checked={featureState[f.key]} onCheckedChange={(v) => setFeature(f.key, v)} />
                  </div>
                ))}
              </div>
              <Button onClick={pushToSidebarPreview}>
                {t('masterAdmin.applyToSidebar')}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                {t('masterAdmin.applyHelp')}
              </p>
            </Card>

            <WorkspacePlansCard orgId={selectedOrg.id} />
          </div>
          </>
          )}
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

// ── §14.5 SaaS Ops Dashboard (Internal) ──────────────────────────────────────

type OpsMetrics = {
  billingConfigured: boolean
  totalOrganizations: number
  totalActiveUsers: number
  totalStorageBytes: number
  totalAiCostUsd: number
  mrrUsd: number
  arrUsd: number
  arpaUsd: number
  ltvUsd: number
  churnRatePct: number
  activeSubscriptions: number
  canceledSubscriptions: number
  subscriptionsByTier: Record<string, number>
  subscriptionsByStatus: Record<string, number>
  generatedAt: string
}

type OpsOrgRow = {
  id: string
  name: string
  slug: string
  plan: string | null
  subscriptionStatus: string | null
  activeUsers: number
  totalUsers: number
  storageBytes: number
  aiCostUsd: number
  mrrUsd: number
  churnRisk: boolean
  createdAt: string
}

/** Format a USD amount as `$1,234.56`. */
function formatUsd(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Human-readable byte size, base 1024 (B/KB/MB/GB/TB). */
function formatBytes(bytes: number): string {
  const b = Number.isFinite(bytes) ? bytes : 0
  if (b < 1024) return `${b} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = b / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(1)} ${units[i]}`
}

/**
 * Platform-wide, cross-tenant metrics (Plan §14.5). Revenue metrics (MRR/ARR/
 * LTV/ARPA/churn) come from the subscriptions mirror; active-users, storage and
 * AI-cost are billing-independent and always render. Super-admin only — this
 * panel already lives behind the /app/admin super-admin gate.
 */
function OpsMetricsSection() {
  const { t } = useTranslation()
  const metricsQuery = useQuery({
    queryKey: ['ops-metrics'],
    queryFn: () => api<OpsMetrics>('/ops/metrics'),
  })
  const orgsQuery = useQuery({
    queryKey: ['ops-organizations'],
    queryFn: () => api<OpsOrgRow[]>('/ops/organizations'),
  })

  const m = metricsQuery.data
  const orgs = orgsQuery.data ?? []

  return (
    <Card className="p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 className="font-semibold flex items-center gap-2">
            <Gauge className="h-4 w-4 text-accent" />
            {t('ops.title')}
          </h2>
          <p className="text-xs text-muted-foreground max-w-2xl">{t('ops.subtitle')}</p>
        </div>
        {m && (
          <div className="text-[11px] text-muted-foreground">
            {t('ops.asOf', { time: new Date(m.generatedAt).toLocaleString() })}
          </div>
        )}
      </div>

      {metricsQuery.isLoading && (
        <div className="text-xs text-muted-foreground"><InlineSkeleton /></div>
      )}
      {metricsQuery.isError && (
        <div className="text-xs text-destructive">{t('ops.error')}</div>
      )}

      {m && (
        <>
          {!m.billingConfigured && (
            <div className="text-xs text-muted-foreground rounded border border-dashed border-border px-3 py-2">
              {t('ops.noBillingData')}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <Metric icon={DollarSign} label={t('ops.metric.mrr')} value={formatUsd(m.mrrUsd)} />
            <Metric icon={TrendingUp} label={t('ops.metric.arr')} value={formatUsd(m.arrUsd)} />
            <Metric icon={CreditCard} label={t('ops.metric.ltv')} value={formatUsd(m.ltvUsd)} />
            <Metric icon={Receipt} label={t('ops.metric.arpa')} value={formatUsd(m.arpaUsd)} />
            <Metric icon={Percent} label={t('ops.metric.churnRate')} value={`${m.churnRatePct}%`} />
            <Metric icon={Users} label={t('ops.metric.activeUsers')} value={m.totalActiveUsers.toLocaleString()} />
            <Metric icon={HardDrive} label={t('ops.metric.storage')} value={formatBytes(m.totalStorageBytes)} />
            <Metric icon={Cpu} label={t('ops.metric.aiCost')} value={formatUsd(m.totalAiCostUsd)} />
            <Metric icon={Activity} label={t('ops.metric.activeSubs')} value={m.activeSubscriptions.toLocaleString()} />
            <Metric icon={AlertTriangle} label={t('ops.metric.canceledSubs')} value={m.canceledSubscriptions.toLocaleString()} />
          </div>
        </>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t('ops.orgTableTitle')}</h3>
        {orgsQuery.isLoading && (
          <div className="text-xs text-muted-foreground"><InlineSkeleton /></div>
        )}
        {orgsQuery.isError && (
          <div className="text-xs text-destructive">{t('ops.error')}</div>
        )}
        {!orgsQuery.isLoading && !orgsQuery.isError && orgs.length === 0 && (
          <div className="text-xs text-muted-foreground">{t('ops.empty')}</div>
        )}
        {orgs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">{t('ops.col.organization')}</th>
                  <th className="py-2 px-3 font-medium">{t('ops.col.plan')}</th>
                  <th className="py-2 px-3 font-medium">{t('ops.col.status')}</th>
                  <th className="py-2 px-3 font-medium">{t('ops.col.users')}</th>
                  <th className="py-2 px-3 font-medium">{t('ops.col.storage')}</th>
                  <th className="py-2 px-3 font-medium">{t('ops.col.aiCost')}</th>
                  <th className="py-2 px-3 font-medium">{t('ops.col.mrr')}</th>
                  <th className="py-2 pl-3 font-medium">{t('ops.col.churnRisk')}</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className="border-b border-border/50">
                    <td className="py-2 pr-3">
                      <div className="font-medium truncate max-w-[220px]">{o.name}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[220px]">{o.slug}</div>
                    </td>
                    <td className="py-2 px-3">
                      {o.plan ? (
                        <Badge variant="soft">{t(`plan.tier.${o.plan}` as TranslationKey)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">{t('ops.none')}</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {o.subscriptionStatus ? (
                        <Badge variant={o.subscriptionStatus === 'active' || o.subscriptionStatus === 'trialing' ? 'success' : 'warning'}>
                          {o.subscriptionStatus}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">{t('ops.none')}</span>
                      )}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {o.activeUsers.toLocaleString()} / {o.totalUsers.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">{formatBytes(o.storageBytes)}</td>
                    <td className="py-2 px-3 whitespace-nowrap">{formatUsd(o.aiCostUsd)}</td>
                    <td className="py-2 px-3 whitespace-nowrap">{formatUsd(o.mrrUsd)}</td>
                    <td className="py-2 pl-3">
                      {o.churnRisk ? (
                        <Badge variant="warning">{t('ops.churnRiskFlag')}</Badge>
                      ) : (
                        <Badge variant="success">{t('ops.churnRiskNo')}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  )
}

// ── §14.2 Dedicated-database registry (super-admin) ──────────────────────────

type TenantDbStatus = 'pending' | 'active' | 'disabled'

/**
 * Masked, client-safe projection returned by `GET /ops/tenant-databases`. The
 * raw connection string is NEVER returned by the API — only a masked host, so
 * nothing here can leak a secret back to the panel.
 */
type TenantDbView = {
  organizationId: string
  status: TenantDbStatus
  label: string | null
  host: string
  lastCheckedAt: string | null
}

type TestConnectionResult =
  | { ok: true; status: TenantDbStatus; latencyMs: number }
  | { ok: false; status: TenantDbStatus; error: string }

const TENANT_DB_STATUSES: TenantDbStatus[] = ['pending', 'active', 'disabled']

function tenantDbStatusMeta(status: TenantDbStatus, t: TFunc): { variant: 'success' | 'warning' | 'soft'; label: string } {
  if (status === 'active') return { variant: 'success', label: t('tenantDb.statusActive') }
  if (status === 'disabled') return { variant: 'soft', label: t('tenantDb.statusDisabled') }
  return { variant: 'warning', label: t('tenantDb.statusPending') }
}

/**
 * §14.2 — super-admin registry of org → dedicated Postgres mappings. Lists each
 * org's masked host + status + last health-check with Test / Disable / Remove
 * controls, plus a form to set or replace a connection URL. Already inside the
 * super-admin-only /app/admin route; the raw connection string is write-only.
 */
function TenantDatabasesSection() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [orgId, setOrgId] = useState('')
  const [connectionUrl, setConnectionUrl] = useState('')
  const [label, setLabel] = useState('')
  const [status, setStatus] = useState<TenantDbStatus>('pending')

  const dbsQuery = useQuery({
    queryKey: ['tenant-databases'],
    queryFn: () => api<TenantDbView[]>('/ops/tenant-databases'),
  })
  const orgsQuery = useQuery({
    queryKey: ['tenant-db-orgs'],
    queryFn: () => api<Array<{ id: string; name: string; slug: string }>>('/organizations'),
  })
  const dbs = dbsQuery.data ?? []
  const orgs = orgsQuery.data ?? []
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tenant-databases'] })

  const upsert = useMutation({
    mutationFn: () =>
      api(`/ops/tenant-databases/${orgId}`, {
        method: 'PUT',
        body: { connectionUrl, label: label.trim() || null, status },
      }),
    onSuccess: () => {
      // Never keep the raw URL around after saving — the API only echoes a mask.
      setConnectionUrl('')
      setLabel('')
      invalidate()
      toast.success(t('tenantDb.saved'))
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('tenantDb.saveError')),
  })

  const test = useMutation({
    mutationFn: (organizationId: string) =>
      api<TestConnectionResult>(`/ops/tenant-databases/${organizationId}/test`, { method: 'POST' }),
    onSuccess: (res) => {
      if (res.ok) toast.success(t('tenantDb.testOk', { ms: res.latencyMs }))
      else toast.error(t('tenantDb.testFail', { error: res.error }))
      invalidate()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('tenantDb.error')),
  })

  const disable = useMutation({
    mutationFn: (organizationId: string) =>
      api(`/ops/tenant-databases/${organizationId}/disable`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : t('tenantDb.error')),
  })

  const remove = useMutation({
    mutationFn: (organizationId: string) =>
      api(`/ops/tenant-databases/${organizationId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : t('tenantDb.error')),
  })

  const anyPending = test.isPending || disable.isPending || remove.isPending

  return (
    <Card className="p-5 space-y-5">
      <div className="space-y-1">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">§14.2</div>
        <h2 className="font-semibold flex items-center gap-2">
          <Database className="h-4 w-4 text-accent" />
          {t('tenantDb.title')}
        </h2>
        <p className="text-xs text-muted-foreground max-w-2xl">{t('tenantDb.subtitle')}</p>
      </div>

      {dbsQuery.isLoading && <div className="text-xs text-muted-foreground"><InlineSkeleton /></div>}
      {dbsQuery.isError && <div className="text-xs text-destructive">{t('tenantDb.error')}</div>}
      {!dbsQuery.isLoading && !dbsQuery.isError && dbs.length === 0 && (
        <div className="text-xs text-muted-foreground">{t('tenantDb.empty')}</div>
      )}

      {dbs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-medium">{t('tenantDb.colOrg')}</th>
                <th className="py-2 px-3 font-medium">{t('tenantDb.colLabel')}</th>
                <th className="py-2 px-3 font-medium">{t('tenantDb.colHost')}</th>
                <th className="py-2 px-3 font-medium">{t('tenantDb.colStatus')}</th>
                <th className="py-2 px-3 font-medium">{t('tenantDb.colLastChecked')}</th>
                <th className="py-2 pl-3 font-medium text-right">{t('tenantDb.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {dbs.map((db) => {
                const meta = tenantDbStatusMeta(db.status, t)
                return (
                  <tr key={db.organizationId} className="border-b border-border/50">
                    <td className="py-2 pr-3">
                      <div className="font-medium truncate max-w-[200px]">{orgName(db.organizationId)}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">{db.organizationId}</div>
                    </td>
                    <td className="py-2 px-3">{db.label || <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">
                      {db.host || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap text-xs text-muted-foreground">
                      {db.lastCheckedAt ? new Date(db.lastCheckedAt).toLocaleString() : t('tenantDb.never')}
                    </td>
                    <td className="py-2 pl-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button size="sm" variant="outline" disabled={anyPending} onClick={() => test.mutate(db.organizationId)}>
                          {test.isPending ? t('tenantDb.testing') : t('tenantDb.test')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={anyPending || db.status === 'disabled'}
                          onClick={() => disable.mutate(db.organizationId)}
                        >
                          {t('tenantDb.disable')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          disabled={anyPending}
                          onClick={() => {
                            if (window.confirm(t('tenantDb.removeConfirm', { org: orgName(db.organizationId) }))) {
                              remove.mutate(db.organizationId)
                            }
                          }}
                        >
                          {t('tenantDb.remove')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <form
        className="space-y-3 border-t border-border pt-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!orgId) return
          if (!connectionUrl.trim()) {
            toast.error(t('tenantDb.needsConnection'))
            return
          }
          upsert.mutate()
        }}
      >
        <h3 className="text-sm font-semibold">{t('tenantDb.formTitle')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">{t('tenantDb.formOrg')}</label>
            <select
              className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            >
              <option value="">{t('tenantDb.formSelectOrg')}</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">{t('tenantDb.formStatus')}</label>
            <select
              className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as TenantDbStatus)}
            >
              {TENANT_DB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tenantDbStatusMeta(s, t).label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium">{t('tenantDb.formConnectionUrl')}</label>
            <Input
              type="password"
              autoComplete="off"
              value={connectionUrl}
              onChange={(e) => setConnectionUrl(e.target.value)}
              placeholder={t('tenantDb.connectionPlaceholder')}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium">{t('tenantDb.formLabel')}</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('tenantDb.labelPlaceholder')} />
          </div>
        </div>
        <Button type="submit" disabled={!orgId || !connectionUrl.trim() || upsert.isPending}>
          {upsert.isPending ? t('tenantDb.saving') : t('tenantDb.save')}
        </Button>
        <p className="text-[11px] text-muted-foreground">{t('tenantDb.connectionHelp')}</p>
      </form>
    </Card>
  )
}

const PLAN_OPTIONS = ['free', 'pro', 'business', 'enterprise'] as const

/**
 * Plan §14.1 — super-admin control to set each workspace's commercial plan. Lists
 * the selected org's workspaces (super_admin bypasses the org guard) with a per-
 * row plan picker that PATCHes /workspaces/:id/plan. Setting a workspace to
 * `enterprise` restores unlimited + every feature.
 */
function WorkspacePlansCard({ orgId }: { orgId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const workspacesQuery = useQuery({
    queryKey: ['admin-org-workspaces', orgId],
    queryFn: () =>
      api<Array<{ id: string; name: string; slug: string; plan: string }>>(`/organizations/${orgId}/workspaces`),
  })
  const setPlan = useMutation({
    mutationFn: ({ workspaceId, plan }: { workspaceId: string; plan: string }) =>
      api(`/workspaces/${workspaceId}/plan`, { method: 'PATCH', body: { plan } }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-org-workspaces', orgId] })
      qc.invalidateQueries({ queryKey: ['workspace-plan', vars.workspaceId] })
    },
  })
  const workspaces = workspacesQuery.data ?? []

  return (
    <Card className="p-4 space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-accent" />
        {t('masterAdmin.planTitle')}
      </h3>
      <p className="text-xs text-muted-foreground">{t('masterAdmin.planSubtitle')}</p>
      {workspacesQuery.isLoading && (
        <div className="text-xs text-muted-foreground"><InlineSkeleton /></div>
      )}
      {!workspacesQuery.isLoading && workspaces.length === 0 && (
        <div className="text-xs text-muted-foreground">{t('masterAdmin.planNoWorkspaces')}</div>
      )}
      <div className="space-y-2">
        {workspaces.map((ws) => {
          const value = drafts[ws.id] ?? ws.plan ?? 'enterprise'
          const dirty = value !== (ws.plan ?? 'enterprise')
          return (
            <div key={ws.id} className="flex items-center gap-3 justify-between rounded border border-border px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{ws.name}</div>
                <div className="text-xs text-muted-foreground truncate">{ws.slug}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  aria-label={t('masterAdmin.planPlanCol')}
                  className="rounded-md border border-border bg-card px-2 py-1 text-sm"
                  value={value}
                  onChange={(e) => setDrafts((d) => ({ ...d, [ws.id]: e.target.value }))}
                >
                  {PLAN_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {t(`plan.tier.${p}` as TranslationKey)}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!dirty || setPlan.isPending}
                  onClick={() => setPlan.mutate({ workspaceId: ws.id, plan: value })}
                >
                  {t('common.save')}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
      {setPlan.isSuccess && <div className="text-xs text-success">{t('masterAdmin.planSaved')}</div>}
      {setPlan.isError && <div className="text-xs text-destructive">{t('masterAdmin.planSaveError')}</div>}
    </Card>
  )
}
