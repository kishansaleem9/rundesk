import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Input, Switch } from '@rundesk/ui'
import {
  Building2,
  CreditCard,
  Lock,
  Receipt,
  Search,
  Shield,
  Users,
} from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

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
              <div className="text-xs text-muted-foreground px-1 py-2">{t('masterAdmin.loadingOrgs')}</div>
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
        <div className="text-xs text-muted-foreground">{t('masterAdmin.planLoading')}</div>
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
