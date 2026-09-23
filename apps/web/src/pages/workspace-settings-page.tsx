import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, Label, Switch, cn, toast } from '@rundesk/ui'
import { Building2, Users, Plug, Shield, Tag, Trash2, Archive, RotateCcw, UserPlus, Plus, Settings as SettingsIcon, Link2, RefreshCw, KeyRound, Users2, ShieldCheck, Upload, CreditCard, ToggleRight, Layers, Sparkles, UserCog, Lock, Globe, Shapes, CalendarDays, Star, X } from 'lucide-react'
import { api, ApiError, downloadFile } from '../lib/api'
import { applyBrandColor } from '../lib/branding'
import { applyAccentColor } from '../components/app-topbar'
import { AdvancedSecurityPanel } from '../components/advanced-security-panel'
import { SsoTab } from '../components/sso-tab'
import { GroupsTab } from '../components/groups-tab'
import { ReportingTree } from '../components/reporting-tree'
import { RolesTab } from '../components/roles-tab'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { TrashTab } from '../components/trash-tab'
import { useResolvedFlags } from '../lib/use-feature-flags'
import { useWorkspaceRole } from '../hooks/use-workspace-role'
import { FLAGS } from '@rundesk/feature-flags'
import type { FlagKey } from '@rundesk/feature-flags'
import { InlineSkeleton } from '../components/loading-skeletons'
import { WebhookSecretOnce } from '../components/webhook-secret-once'
import { webhookEventLabel } from '../lib/webhook-events'

type Workspace = {
  id: string
  name: string
  slug: string
  logoUrl?: string | null
  primaryColor?: string | null
  accentColor?: string | null
  customDomain?: string | null
  customDomainToken?: string | null
  customDomainVerified?: boolean | null
  isArchived?: boolean | null
  // §A4.2 sharing policy.
  defaultSpacePrivate?: boolean | null
  blockPublicSharing?: boolean | null
}

type Member = {
  userId: string
  email: string
  displayName: string
  avatarUrl?: string | null
  role: string
  weeklyCapacityHours?: number
  joinedAt: string
  // §A4.1 roster columns — all already stored, none previously rendered here.
  lastSeenAt?: string | null
  invitedAt?: string | null
  invitedByName?: string | null
  invitedByEmail?: string | null
  teams?: string[]
  // Reporting line. managerName is resolved server-side from the same roster,
  // so the tree can be drawn without a second lookup per row.
  managerId?: string | null
  managerName?: string | null
}

const ROLES = [
  { value: 'workspace_admin', labelKey: 'settings.roleAdmin' },
  { value: 'manager', labelKey: 'settings.roleManager' },
  { value: 'member', labelKey: 'settings.roleMember' },
  { value: 'guest', labelKey: 'settings.roleGuest' },
] as const

type Invitation = {
  id: string
  email: string
  role: string
  status: 'pending' | 'accepted' | 'expired'
  expiresAt: string
}

type ArchivedTask = {
  id: string
  title: string
  listId: string
  listName: string
  projectName: string
  updatedAt: string
}
type ArchivedWorkspaceEntry = { workspace: Workspace; role: string }

/**
 * §A4.4 — one console instead of three. The rail keeps the same destinations but
 * groups them, so an admin scanning for "where do I change who can see what"
 * has four short lists to read instead of eleven flat rows. The last group is
 * the bridge to personal settings, which used to be reachable only from the
 * avatar menu.
 */
const TAB_GROUPS = [
  {
    headingKey: 'settings.groupAdmin',
    tabs: [
      { id: 'general', labelKey: 'settings.tabGeneral', icon: Building2 },
      { id: 'members', labelKey: 'settings.tabMembers', icon: Users },
      { id: 'groups', labelKey: 'settings.tabGroups', icon: Users2 },
      { id: 'roles', labelKey: 'settings.tabRoles', icon: ShieldCheck },
      { id: 'spaces', labelKey: 'settings.tabSpaces', icon: Layers },
      { id: 'workSchedule', labelKey: 'settings.tabWorkSchedule', icon: CalendarDays },
    ],
  },
  {
    headingKey: 'settings.groupSecurity',
    tabs: [
      { id: 'security', labelKey: 'settings.tabSecurity', icon: Shield },
      { id: 'sso', labelKey: 'settings.tabSso', icon: KeyRound },
    ],
  },
  {
    headingKey: 'settings.groupFeatures',
    tabs: [
      { id: 'features', labelKey: 'settings.tabFeatures', icon: ToggleRight },
      { id: 'integrations', labelKey: 'settings.tabIntegrations', icon: Plug },
      { id: 'labels', labelKey: 'settings.tabLabels', icon: Tag },
      { id: 'taskTypes', labelKey: 'settings.tabTaskTypes', icon: Shapes },
      { id: 'aiUsage', labelKey: 'settings.tabAiUsage', icon: Sparkles },
    ],
  },
  {
    headingKey: 'settings.groupData',
    tabs: [
      { id: 'archived', labelKey: 'settings.tabArchived', icon: Archive },
      { id: 'trash', labelKey: 'settings.tabTrash', icon: Trash2 },
    ],
  },
] as const

type SettingsTabId = (typeof TAB_GROUPS)[number]['tabs'][number]['id']

function isUuidLike(value?: string): value is string {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/settings' })
  const { tab: tabFromUrl } = useSearch({ from: '/app/$workspaceId/settings' })
  const validWorkspaceId = isUuidLike(workspaceId) ? workspaceId : null
  /*
   * The tab is the address, not a copy of it taken on arrival.
   *
   * `?tab=` was read once into state and never written back, so the sixteen
   * tabs here — Trash and Archived among them — were not places. Land on
   * Members from the workspace panel, click through to Trash, find the list
   * somebody deleted, and the URL still says `?tab=members`: what you send a
   * colleague is not what you are looking at, and your own reload throws the
   * navigation away.
   *
   * The route already validated all sixteen values, so arriving worked; only
   * the write was missing. workspace-time-approvals-page.tsx has done it this
   * way all along.
   */
  const tab: SettingsTabId = tabFromUrl ?? 'general'
  const setTab = (next: SettingsTabId) =>
    navigate({
      to: '/app/$workspaceId/settings',
      params: { workspaceId },
      search: { tab: next === 'general' ? undefined : next },
      replace: true,
    })
  const { t } = useTranslation()

  useEffect(() => {
    if (!validWorkspaceId) {
      navigate({ to: '/app/profile' })
    }
  }, [navigate, validWorkspaceId])

  if (!validWorkspaceId) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        {t('settings.redirecting')}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-5 border-b border-border/40">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <SettingsIcon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {t('common.workspace')}
            </div>
            <h1 className="font-display text-2xl font-semibold leading-tight">{t('settings.title')}</h1>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
          {t('settings.subtitle')}
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {/* Trash is a 6-column table, so it gets a wider shell than the
            form-style tabs. */}
        <div
          className={cn(
            'mx-auto grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8',
            tab === 'trash' ? 'max-w-7xl' : 'max-w-5xl',
          )}
        >
          <nav className="space-y-4">
            {TAB_GROUPS.map((group) => (
              <div key={group.headingKey} className="space-y-0.5">
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  {t(group.headingKey)}
                </div>
                {group.tabs.map((item) => (
                  <button
                    key={item.id}
                    data-testid={`settings-tab-${item.id}`}
                    onClick={() => setTab(item.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all',
                      tab === item.id
                        ? 'bg-accent/15 text-foreground font-medium [&>svg]:text-accent'
                        : 'hover:bg-card/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>
            ))}
            <div className="space-y-0.5 border-t border-border/40 pt-3">
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {t('settings.groupMySettings')}
              </div>
              <button
                onClick={() => navigate({ to: '/app/profile' })}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground transition-all hover:bg-card/60 hover:text-foreground"
              >
                <UserCog className="h-4 w-4 shrink-0" />
                {t('settings.personalSettings')}
              </button>
            </div>
          </nav>

          {/* min-w-0: a grid child defaults to min-width:auto, which would let a
              wide child (the Trash table) stretch the column instead of
              scrolling inside its own overflow container. */}
          <div className="min-w-0">
            {tab === 'general' && <GeneralTab workspaceId={validWorkspaceId} />}
            {tab === 'members' && <MembersTab workspaceId={validWorkspaceId} />}
            {tab === 'groups' && <GroupsTab workspaceId={validWorkspaceId} />}
            {tab === 'roles' && <RolesTab workspaceId={validWorkspaceId} />}
            {tab === 'features' && <FeaturesTab workspaceId={validWorkspaceId} />}
            {tab === 'integrations' && <IntegrationsTab workspaceId={validWorkspaceId} />}
            {tab === 'security' && <SecurityTab workspaceId={validWorkspaceId} />}
            {tab === 'sso' && <SsoTab workspaceId={validWorkspaceId} />}
            {tab === 'labels' && <LabelsTab workspaceId={validWorkspaceId} />}
            {tab === 'taskTypes' && <TaskTypesTab workspaceId={validWorkspaceId} />}
            {tab === 'workSchedule' && <WorkScheduleTab workspaceId={validWorkspaceId} />}
            {tab === 'archived' && <ArchivedTab workspaceId={validWorkspaceId} />}
            {tab === 'spaces' && <SpacesTab workspaceId={validWorkspaceId} />}
            {tab === 'aiUsage' && <AiUsageTab workspaceId={validWorkspaceId} />}
            {tab === 'trash' && <TrashTab workspaceId={validWorkspaceId} />}
          </div>
        </div>
      </div>
    </div>
  )
}

type PlanUsageResponse = {
  plan: 'free' | 'pro' | 'business' | 'enterprise'
  label: string
  description: string
  limits: { maxMembers: number | null; maxProjects: number | null }
  features: Record<string, boolean>
  usage: { members: number; projects: number }
}

/*
 * THE PLAN'S FEATURES COME FROM THE PLAN, not from a list kept here.
 *
 * This was a hand-copy of the API's `PLAN_FEATURES` keys — nine of them — and
 * it had already fallen behind: `teamView` and `boardExport` were added
 * server-side and this card could not show them, so a person on Business had
 * no way to see that the two features they had just been sold were included.
 * The duplicated-list defect, and the copy is always the one that goes stale
 * because nothing fails when it does.
 *
 * `GET /workspaces/:id/plan` returns `features` as the server understands it,
 * so the card renders whatever the plan actually has. A key with no label falls
 * back to the key itself: visibly unfinished, rather than silently missing.
 */
const planFeatureKeys = (features: Record<string, boolean> | undefined): string[] =>
  Object.keys(features ?? {}).sort()

/**
 * Plan §14.1 — a small read-only Plan card: current tier, member/project usage vs
 * the plan cap, and the tier's included features. Changing the plan is a
 * super-admin action (master-admin panel), hence the "managed by your admin" hint.
 */
function PlanCard({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const planQuery = useQuery({
    queryKey: ['workspace-plan', workspaceId],
    queryFn: () => api<PlanUsageResponse>(`/workspaces/${workspaceId}/plan`),
  })
  if (planQuery.isLoading) return <Card className="p-6 text-sm text-muted-foreground"><InlineSkeleton /></Card>
  if (!planQuery.data) return null
  const p = planQuery.data
  const usageLine = (used: number, limit: number | null) =>
    limit == null ? `${used} · ${t('plan.unlimited')}` : t('plan.ofLimit', { used, limit })
  const enabledFeatures = planFeatureKeys(p.features).filter((f) => p.features?.[f])
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-accent" />
          <h3 className="font-semibold">{t('plan.title')}</h3>
        </div>
        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
          {t(`plan.tier.${p.plan}` as TranslationKey)}
        </span>
      </div>
      {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border/60 p-3">
          <div className="text-xs text-muted-foreground">{t('plan.members')}</div>
          <div className="text-sm font-medium mt-0.5">{usageLine(p.usage.members, p.limits.maxMembers)}</div>
        </div>
        <div className="rounded-md border border-border/60 p-3">
          <div className="text-xs text-muted-foreground">{t('plan.projects')}</div>
          <div className="text-sm font-medium mt-0.5">{usageLine(p.usage.projects, p.limits.maxProjects)}</div>
        </div>
      </div>
      {enabledFeatures.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">{t('plan.featuresTitle')}</div>
          <div className="flex flex-wrap gap-1.5">
            {enabledFeatures.map((f) => (
              <span key={f} className="rounded-full border border-border/60 bg-card/40 px-2 py-0.5 text-[11px]">
                {t(`plan.feature.${f}` as TranslationKey)}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">{t('plan.changeHint')}</p>
    </Card>
  )
}

type BillingSubscription = {
  status: string
  tier: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  stripeSubscriptionId: string
}
type BillingInvoice = {
  id: string
  amount: number
  currency: string
  status: string
  hostedUrl: string | null
  pdfUrl: string | null
  createdAt: string
}
type BillingStatusResponse = {
  configured: boolean
  plan: { id: string; label: string }
  subscription: BillingSubscription | null
  invoices: BillingInvoice[]
}

const BILLING_TIERS = ['pro', 'business', 'enterprise'] as const
const BILLING_STATUS_KEYS: Record<string, TranslationKey> = {
  active: 'billing.statusActive',
  trialing: 'billing.statusTrialing',
  past_due: 'billing.statusPastDue',
  canceled: 'billing.statusCanceled',
  unpaid: 'billing.statusUnpaid',
}

/**
 * Plan §14.1 — the Billing section: current plan + subscription status + recent
 * invoices (with Stripe-hosted links). "Upgrade" starts a Stripe Checkout for
 * the chosen tier; once a subscription exists, "Manage billing" opens the Stripe
 * Billing Portal (upgrade/downgrade/cancel). When the backend reports Stripe is
 * not configured, a clear "Billing isn't configured" state is shown instead.
 */
function BillingCard({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const [tier, setTier] = useState<(typeof BILLING_TIERS)[number]>('pro')
  const billingQuery = useQuery({
    queryKey: ['workspace-billing', workspaceId],
    queryFn: () => api<BillingStatusResponse>(`/workspaces/${workspaceId}/billing`),
  })

  const checkout = useMutation({
    mutationFn: () =>
      api<{ url: string }>(`/workspaces/${workspaceId}/billing/checkout`, { method: 'POST', body: { tier } }),
    onSuccess: (res) => {
      if (res?.url) {
        toast.success(t('billing.redirecting'))
        window.location.href = res.url
      }
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('billing.checkoutError')),
  })
  const portal = useMutation({
    mutationFn: () => api<{ url: string }>(`/workspaces/${workspaceId}/billing/portal`, { method: 'POST' }),
    onSuccess: (res) => {
      if (res?.url) {
        toast.success(t('billing.redirecting'))
        window.location.href = res.url
      }
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('billing.portalError')),
  })

  if (billingQuery.isLoading) return <Card className="p-6 text-sm text-muted-foreground"><InlineSkeleton /></Card>
  if (!billingQuery.data) return null
  const b = billingQuery.data

  const header = (
    <div className="flex items-center gap-2">
      <CreditCard className="h-4 w-4 text-accent" />
      <h3 className="font-semibold">{t('billing.title')}</h3>
    </div>
  )

  // Clear degraded state when Stripe env is not configured on the backend.
  if (!b.configured) {
    return (
      <Card className="p-6 space-y-2">
        {header}
        <p className="text-sm font-medium">{t('billing.notConfigured')}</p>
        <p className="text-xs text-muted-foreground">{t('billing.notConfiguredDesc')}</p>
      </Card>
    )
  }

  const sub = b.subscription
  const hasActiveSub = !!sub && !['canceled', 'incomplete_expired', 'unpaid'].includes(sub.status)
  const statusLabel = (s: string) => (BILLING_STATUS_KEYS[s] ? t(BILLING_STATUS_KEYS[s]) : s)
  const fmtMoney = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: (currency || 'usd').toUpperCase() }).format((amount || 0) / 100)
    } catch {
      return `${((amount || 0) / 100).toFixed(2)} ${(currency || 'usd').toUpperCase()}`
    }
  }
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '')

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        {header}
        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
          {t(`plan.tier.${b.plan.id}` as TranslationKey)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{t('billing.description')}</p>

      {sub ? (
        <div className="rounded-md border border-border/60 p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t('billing.statusLabel')}</span>
            <span className="text-sm font-medium">{statusLabel(sub.status)}</span>
          </div>
          {sub.currentPeriodEnd && (
            <div className="text-xs text-muted-foreground">{t('billing.renewsOn', { date: fmtDate(sub.currentPeriodEnd) })}</div>
          )}
          {sub.cancelAtPeriodEnd && (
            <div className="text-xs text-destructive">{t('billing.cancelsAtPeriodEnd')}</div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('billing.noSubscription')}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {hasActiveSub ? (
          <Button onClick={() => portal.mutate()} disabled={portal.isPending}>
            {t('billing.manageBilling')}
          </Button>
        ) : (
          <>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as (typeof BILLING_TIERS)[number])}
              aria-label={t('billing.selectTier')}
              className="px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {BILLING_TIERS.map((tr) => (
                <option key={tr} value={tr}>{t(`plan.tier.${tr}` as TranslationKey)}</option>
              ))}
            </select>
            <Button onClick={() => checkout.mutate()} disabled={checkout.isPending}>
              {t('billing.upgrade')}
            </Button>
          </>
        )}
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-1.5">{t('billing.recentInvoices')}</div>
        {b.invoices.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('billing.noInvoices')}</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md border border-border/60">
            {b.invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="truncate">
                  {fmtDate(inv.createdAt)} · {fmtMoney(inv.amount, inv.currency)} · <span className="text-muted-foreground">{statusLabel(inv.status)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs">
                  {inv.hostedUrl && (
                    <a href={inv.hostedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                      <Link2 className="h-3 w-3" />{t('billing.viewInvoice')}
                    </a>
                  )}
                  {inv.pdfUrl && (
                    <a href={inv.pdfUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      {t('billing.invoicePdf')}
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

// §5 ClickApps — top-level features a workspace admin switches on/off. Each maps
// to a feature flag; disabling one hides its nav entry, and for the flags with
// backend enforcement (chat, docs, reports, forms, goals, sprints, automations)
// also 404s its API. Names reuse the localized nav catalog keys.
const CLICKAPPS: { flag: FlagKey; nameKey: TranslationKey; descKey: TranslationKey }[] = [
  { flag: FLAGS.CHAT, nameKey: 'nav.chat', descKey: 'settings.featDescChat' },
  { flag: FLAGS.DOCS, nameKey: 'nav.docs', descKey: 'settings.featDescDocs' },
  { flag: FLAGS.FORMS, nameKey: 'nav.forms', descKey: 'settings.featDescForms' },
  { flag: FLAGS.GOALS, nameKey: 'nav.goals', descKey: 'settings.featDescGoals' },
  { flag: FLAGS.SPRINTS, nameKey: 'settings.featSprints', descKey: 'settings.featDescSprints' },
  { flag: FLAGS.TIME_TRACKING, nameKey: 'nav.time', descKey: 'settings.featDescTime' },
  { flag: FLAGS.REPORTING, nameKey: 'nav.reports', descKey: 'settings.featDescReports' },
  { flag: FLAGS.INTEGRATIONS, nameKey: 'nav.integrations', descKey: 'settings.featDescIntegrations' },
  { flag: FLAGS.AI, nameKey: 'nav.ai', descKey: 'settings.featDescAi' },
  { flag: FLAGS.AI_AUTOMATIONS, nameKey: 'nav.automations', descKey: 'settings.featDescAutomations' },
  { flag: FLAGS.VIEWS_DASHBOARD, nameKey: 'nav.dashboards', descKey: 'settings.featDescDashboards' },
  { flag: FLAGS.VIEWS_WORKLOAD, nameKey: 'nav.workload', descKey: 'settings.featDescWorkload' },
]

function FeaturesTab({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { isAdmin } = useWorkspaceRole(workspaceId)
  const { flags, isLoading } = useResolvedFlags(workspaceId)

  const setFlag = useMutation({
    mutationFn: ({ flag, enabled }: { flag: FlagKey; enabled: boolean }) =>
      api(`/feature-flags/${encodeURIComponent(flag)}`, {
        method: 'PUT',
        body: { enabled, scope: 'workspace', scopeId: workspaceId, workspaceId },
      }),
    onSuccess: () => {
      // Refresh every resolved-flags consumer (this tab + the sidebar nav).
      qc.invalidateQueries({ queryKey: ['feature-flags', 'resolved'] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('settings.featureSaveError')),
  })

  // "On unless explicitly disabled" — matches the nav gate and backend defaults.
  const isOn = (flag: FlagKey) => flags?.[flag] !== false

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('settings.featuresTitle')}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{t('settings.featuresSubtitle')}</p>
      </div>
      {!isAdmin && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300">
          {t('settings.featuresAdminOnly')}
        </div>
      )}
      <Card className="overflow-hidden divide-y divide-border/70">
        {CLICKAPPS.map(({ flag, nameKey, descKey }) => {
          const on = isOn(flag)
          return (
            <div key={flag} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{t(nameKey)}</div>
                <div className="text-xs text-muted-foreground">{t(descKey)}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={t(nameKey)}
                disabled={!isAdmin || isLoading || setFlag.isPending}
                onClick={() => setFlag.mutate({ flag, enabled: !on })}
                className={cn(
                  'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                  on ? 'bg-brand-500' : 'bg-muted-foreground/30',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                    on ? 'left-[22px]' : 'left-0.5',
                  )}
                />
              </button>
            </div>
          )
        })}
      </Card>
    </div>
  )
}

function GeneralTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const wsQuery = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api<Workspace>(`/workspaces/${workspaceId}`),
  })
  const [name, setName] = useState('')
  const [primaryColor, setPrimaryColor] = useState('')
  const [accentColor, setAccentColor] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [customDomain, setCustomDomain] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)

  useEffect(() => {
    if (wsQuery.data) {
      setName(wsQuery.data.name)
      setPrimaryColor(wsQuery.data.primaryColor ?? '')
      setAccentColor(wsQuery.data.accentColor ?? '')
      setLogoUrl(wsQuery.data.logoUrl ?? '')
      setCustomDomain(wsQuery.data.customDomain ?? '')
    }
  }, [wsQuery.data])

  // Live-preview the primary + accent colors while editing.
  useEffect(() => {
    applyBrandColor(primaryColor || null)
  }, [primaryColor])
  useEffect(() => {
    applyAccentColor(accentColor || null)
  }, [accentColor])

  const save = useMutation({
    mutationFn: () =>
      api<Workspace>(`/workspaces/${workspaceId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          primaryColor: primaryColor || null,
          accentColor: accentColor || null,
          logoUrl: logoUrl || null,
          customDomain: customDomain || null,
        }),
      }),
    onSuccess: (updated) => {
      qc.setQueryData(['workspace', workspaceId], updated)
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      qc.invalidateQueries({ queryKey: ['workspace-branding', workspaceId] })
    },
  })

  // §13.5 — direct-to-R2 logo upload, mirroring the avatar presign flow. On
  // success we set the logoUrl field; the Save button persists it.
  const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
  const LOGO_MAX_BYTES = 5 * 1024 * 1024
  async function onLogoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLogoError(null)
    if (!LOGO_TYPES.includes(file.type)) {
      setLogoError(t('settings.logoTypeError'))
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError(t('settings.logoSizeError'))
      return
    }
    setLogoUploading(true)
    try {
      const presign = await api<{ uploadUrl: string; publicUrl: string; storageKey: string }>(
        `/workspaces/${workspaceId}/logo/presign`,
        { method: 'POST', body: { contentType: file.type, sizeBytes: file.size } },
      )
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!put.ok) throw new Error(`Storage upload failed (${put.status})`)
      setLogoUrl(presign.publicUrl)
    } catch (err) {
      setLogoError(err instanceof ApiError ? err.message : t('settings.logoUploadError'))
    } finally {
      setLogoUploading(false)
    }
  }

  const verifyDomain = useMutation({
    mutationFn: () => api<{ verified: boolean }>(`/workspaces/${workspaceId}/verify-domain`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace', workspaceId] }),
  })

  const archive = useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['workspaces'] })
      window.location.href = '/app'
    },
  })

  if (!wsQuery.data) return <Card className="p-6 text-sm text-muted-foreground"><InlineSkeleton /></Card>

  const dirty =
    name !== wsQuery.data.name ||
    primaryColor !== (wsQuery.data.primaryColor ?? '') ||
    accentColor !== (wsQuery.data.accentColor ?? '') ||
    logoUrl !== (wsQuery.data.logoUrl ?? '') ||
    customDomain !== (wsQuery.data.customDomain ?? '')

  return (
    <div className="space-y-5">
    <PlanCard workspaceId={workspaceId} />
    <BillingCard workspaceId={workspaceId} />
    <Card className="p-6 space-y-5">
      <div>
        <Label>{t('settings.workspaceId')}</Label>
        <Input value={wsQuery.data.id} readOnly className="font-mono text-xs" />
      </div>
      <div>
        <Label>{t('settings.slug')}</Label>
        <Input value={wsQuery.data.slug} readOnly className="font-mono text-xs" />
      </div>
      <div>
        <Label htmlFor="name">{t('settings.name')}</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="primary">{t('settings.primaryColor')}</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={t('settings.brandColor')}
            value={/^#[0-9a-f]{6}$/i.test(primaryColor) ? primaryColor : '#354fb0'}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="h-9 w-10 rounded border border-border bg-transparent p-0.5 cursor-pointer"
          />
          <Input id="primary" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#354fb0" />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t('settings.primaryColorHint')}</p>
      </div>
      <div>
        <Label htmlFor="accent">{t('settings.accentColor')}</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={t('settings.brandAccentColor')}
            value={/^#[0-9a-f]{6}$/i.test(accentColor) ? accentColor : '#7c5cff'}
            onChange={(e) => setAccentColor(e.target.value)}
            className="h-9 w-10 rounded border border-border bg-transparent p-0.5 cursor-pointer"
          />
          <Input id="accent" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} placeholder="#7c5cff" />
          {accentColor && (
            <Button variant="ghost" size="sm" onClick={() => setAccentColor('')}>{t('settings.accentClear')}</Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t('settings.accentColorHint')}</p>
      </div>
      <div>
        <Label htmlFor="logo">{t('settings.logoUrl')}</Label>
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt={t('settings.logoAlt')} className="h-9 w-9 rounded object-contain border border-border" />
          ) : null}
          <Input id="logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" />
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={onLogoSelected}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => logoInputRef.current?.click()}
            disabled={logoUploading}
          >
            <Upload className="h-3.5 w-3.5" />
            {logoUploading ? t('settings.logoUploading') : t('settings.logoUpload')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t('settings.logoUploadHint')}</p>
        {logoError && <p className="text-xs text-destructive mt-1">{logoError}</p>}
      </div>
      <div>
        <Label htmlFor="domain">{t('settings.customDomain')}</Label>
        <div className="flex items-center gap-2">
          <Input id="domain" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="rundesk.example.com" />
          {wsQuery.data.customDomain && (
            wsQuery.data.customDomainVerified ? (
              <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600">{t('settings.verified')}</span>
            ) : (
              <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600">{t('settings.unverified')}</span>
            )
          )}
        </div>
        {wsQuery.data.customDomain && !wsQuery.data.customDomainVerified && wsQuery.data.customDomainToken && (
          <div className="mt-2 rounded-md border border-border/60 bg-card/40 p-3 text-xs space-y-1.5">
            <div className="text-muted-foreground">
              {t('settings.dnsInstructions')}
            </div>
            <div className="font-mono">
              <div>{t('settings.dnsHost')}: <span className="text-foreground">_rundesk-verify.{wsQuery.data.customDomain}</span></div>
              <div>{t('settings.dnsValue')}: <span className="text-foreground">{wsQuery.data.customDomainToken}</span></div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => verifyDomain.mutate()} disabled={verifyDomain.isPending}>
                {verifyDomain.isPending ? t('settings.checking') : t('settings.verify')}
              </Button>
              {verifyDomain.data && !verifyDomain.data.verified && (
                <span className="text-amber-600">{t('settings.dnsNotFound')}</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border">
        <span className="text-xs">
          {save.isSuccess && <span className="text-emerald-600">{t('settings.saved')}</span>}
          {save.error instanceof ApiError && <span className="text-destructive">{save.error.message}</span>}
        </span>
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} size="sm">
          {save.isPending ? t('common.saving') : t('settings.saveChanges')}
        </Button>
      </div>

      <div className="pt-4 mt-2 border-t border-destructive/30">
        <p className="text-sm font-semibold text-destructive">{t('settings.dangerZone')}</p>
        <div className="mt-2 flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">
            {t('settings.archiveDesc')}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0"
            disabled={archive.isPending}
            onClick={() => {
              if (window.confirm(t('settings.archiveConfirm', { name: wsQuery.data!.name })))
                archive.mutate()
            }}
          >
            {archive.isPending ? t('settings.archiving') : t('settings.archiveWorkspace')}
          </Button>
        </div>
      </div>
    </Card>
    </div>
  )
}

function MembersTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const { t, tCount } = useTranslation()

  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<Member[]>(`/workspaces/${workspaceId}/members`),
  })

  const invitesQuery = useQuery({
    queryKey: ['workspace-invitations', workspaceId],
    queryFn: () => api<Invitation[]>(`/invitations/workspace/${workspaceId}`),
  })

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')

  const invite = useMutation({
    mutationFn: () =>
      api(`/invitations`, {
        method: 'POST',
        body: { email: inviteEmail, workspaceId, role: inviteRole },
      }),
    onSuccess: () => {
      setInviteEmail('')
      toast.success(t('settings.inviteSent'))
      qc.invalidateQueries({ queryKey: ['workspace-invitations', workspaceId] })
    },
  })

  const cancelInvite = useMutation({
    mutationFn: (id: string) => api(`/invitations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('settings.inviteCancelled'))
      qc.invalidateQueries({ queryKey: ['workspace-invitations', workspaceId] })
    },
  })

  const resendInvite = useMutation({
    mutationFn: (id: string) => api(`/invitations/${id}/resend`, { method: 'POST' }),
    onSuccess: () => toast.success(t('settings.inviteResent')),
  })

  const copyLink = useMutation({
    mutationFn: async (id: string) => {
      const data = await api<{ claimUrl: string }>(`/invitations/${id}/link`)
      await navigator.clipboard.writeText(data.claimUrl)
      return data.claimUrl
    },
    onSuccess: () => toast.success(t('settings.inviteLinkCopied')),
  })

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api(`/workspaces/${workspaceId}/members/${userId}`, {
        method: 'PATCH',
        body: { role },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] }),
  })

  const updateCapacity = useMutation({
    mutationFn: ({ userId, weeklyCapacityHours }: { userId: string; weeklyCapacityHours: number }) =>
      api(`/workspaces/${workspaceId}/members/${userId}/capacity`, {
        method: 'PATCH',
        body: { weeklyCapacityHours },
      }),
    onSuccess: () => {
      toast.success(t('settings.capacityUpdated'))
      qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
      qc.invalidateQueries({ queryKey: ['workload-report', workspaceId] })
    },
  })

  // Who each person reports to. The server rejects self-reporting and cycles;
  // the message it sends back is shown as-is rather than being re-worded here.
  const updateManager = useMutation({
    mutationFn: ({ userId, managerId }: { userId: string; managerId: string | null }) =>
      api(`/workspaces/${workspaceId}/members/${userId}/manager`, {
        method: 'PATCH',
        body: { managerId },
      }),
    onSuccess: () => {
      toast.success(t('settings.managerUpdated'))
      qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('settings.managerUpdateFailed')),
  })

  const remove = useMutation({
    mutationFn: (userId: string) =>
      api(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] }),
  })

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
            <UserPlus className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">{t('settings.inviteTeammate')}</h2>
            <p className="text-xs text-muted-foreground">{t('settings.inviteTeammateDesc')}</p>
          </div>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (inviteEmail.includes('@')) invite.mutate()
          }}
        >
          <Input
            placeholder={t('settings.inviteEmailPlaceholder')}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1"
            type="email"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="px-3 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{t(r.labelKey)}</option>
            ))}
          </select>
          <Button type="submit" disabled={!inviteEmail.includes('@') || invite.isPending}>
            {invite.isPending ? t('settings.sending') : t('settings.invite')}
          </Button>
        </form>
        
        {invite.error instanceof ApiError && (
          <p className="text-xs text-destructive mt-2">{invite.error.message}</p>
        )}
      </Card>

      {/* Pending Invitations */}
      {(invitesQuery.data?.length ?? 0) > 0 && (
        <Card className="overflow-hidden border-amber-500/20">
          <div className="px-4 py-3 bg-amber-500/5 border-b border-amber-500/10 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-amber-700 dark:text-amber-400">
              {tCount('settings.pendingInvitations', invitesQuery.data?.length ?? 0)}
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {invitesQuery.data?.map((inv) => (
              <li key={inv.id} className="px-4 py-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                  {inv.email.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{inv.email}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {inv.role} · {t('settings.expires', { date: new Date(inv.expiresAt).toLocaleDateString() })}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => copyLink.mutate(inv.id)}
                  disabled={copyLink.isPending}
                  title={t('settings.copyInviteLink')}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1" />
                  {t('settings.copyLink')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => resendInvite.mutate(inv.id)}
                  disabled={resendInvite.isPending}
                  title={t('settings.resendInviteEmail')}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  {t('settings.resend')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => cancelInvite.mutate(inv.id)}
                  disabled={cancelInvite.isPending}
                >
                  {t('common.cancel')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
          <h2 className="font-semibold text-sm">{tCount('settings.activeMembers', membersQuery.data?.length ?? 0)}</h2>
          {/* §A4.1 — the roster is the one list an admin is asked to hand over. */}
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() =>
              downloadFile(
                `/workspaces/${workspaceId}/export/csv/members`,
                `rundesk-${workspaceId}-members.csv`,
              ).catch((e) => toast.error(e instanceof Error ? e.message : t('settings.exportFailed')))
            }
          >
            <Upload className="h-3.5 w-3.5 mr-1" />
            {t('settings.exportMembersCsv')}
          </Button>
        </div>
        <ul className="divide-y divide-border">
          {(membersQuery.data ?? []).map((m) => (
            <li key={m.userId} className="px-4 py-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-brand-300 text-foreground flex items-center justify-center text-sm font-semibold">
                {m.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.displayName}</div>
                <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                {(m.teams?.length ?? 0) > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.teams!.map((team) => (
                      <span
                        key={team}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {team}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="hidden xl:block w-44 shrink-0 text-[11px] leading-tight text-muted-foreground">
                <div>
                  {m.lastSeenAt
                    ? t('settings.lastActive', { when: new Date(m.lastSeenAt).toLocaleDateString() })
                    : t('settings.lastActiveNever')}
                </div>
                <div className="truncate">
                  {m.invitedAt
                    ? t('settings.invitedOn', {
                        when: new Date(m.invitedAt).toLocaleDateString(),
                        who: m.invitedByName ?? m.invitedByEmail ?? t('settings.invitedByUnknown'),
                      })
                    : t('settings.invitedNoRecord')}
                </div>
              </div>
              <CapacityInput
                value={m.weeklyCapacityHours ?? 40}
                pending={updateCapacity.isPending && updateCapacity.variables?.userId === m.userId}
                onCommit={(weeklyCapacityHours) =>
                  updateCapacity.mutate({ userId: m.userId, weeklyCapacityHours })
                }
              />
              {/* Reports to. Everyone except this person is a candidate; the
                  server is what actually rejects a cycle. */}
              <select
                value={m.managerId ?? ''}
                aria-label={t('settings.reportsToFor', { name: m.displayName })}
                title={t('settings.reportsTo')}
                disabled={updateManager.isPending && updateManager.variables?.userId === m.userId}
                onChange={(e) =>
                  updateManager.mutate({ userId: m.userId, managerId: e.target.value || null })
                }
                className="hidden lg:block w-36 text-xs px-2 py-1 rounded border border-border bg-card"
              >
                <option value="">{t('settings.reportsToNobody')}</option>
                {(membersQuery.data ?? [])
                  .filter((c) => c.userId !== m.userId)
                  .map((c) => (
                    <option key={c.userId} value={c.userId}>{c.displayName}</option>
                  ))}
              </select>
              <select
                value={m.role}
                onChange={(e) => updateRole.mutate({ userId: m.userId, role: e.target.value })}
                className="text-xs px-2 py-1 rounded border border-border bg-card"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{t(r.labelKey)}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (confirm(t('settings.removeMemberConfirm', { name: m.displayName }))) remove.mutate(m.userId)
                }}
                className="p-1.5 rounded hover:bg-surface-50 text-muted-foreground hover:text-destructive"
                title={t('settings.removeMember')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {membersQuery.data?.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted-foreground text-center">{t('settings.noMembers')}</li>
          )}
        </ul>
      </Card>

      <ReportingTree members={membersQuery.data ?? []} className="overflow-hidden" />
    </div>
  )
}

type SpaceRow = {
  id: string
  name: string
  icon?: string | null
  color?: string | null
  visibility: 'public' | 'private'
  createdById?: string | null
  createdAt: string
}

/**
 * §A4.9 — every ingredient of Space administration already existed, but only
 * one Space at a time and behind a different dialog each. This is the missing
 * index: which Spaces are live, who owns them, and which are closed. The
 * archived half is already served by Trash, so it is not duplicated here.
 */
function SpacesTab({ workspaceId }: { workspaceId: string }) {
  const { t, tCount } = useTranslation()

  const spacesQuery = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<SpaceRow[]>(`/spaces/workspace/${workspaceId}`),
  })
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<Member[]>(`/workspaces/${workspaceId}/members`),
  })

  const ownerById = new Map((membersQuery.data ?? []).map((m) => [m.userId, m.displayName || m.email]))
  const spaces = spacesQuery.data ?? []

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-semibold text-sm">{tCount('settings.spacesCount', spaces.length)}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{t('settings.spacesDesc')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
              <th className="px-4 py-2 font-medium">{t('settings.spaceColumnName')}</th>
              <th className="px-4 py-2 font-medium">{t('settings.spaceColumnOwner')}</th>
              <th className="px-4 py-2 font-medium">{t('settings.spaceColumnAccess')}</th>
              <th className="px-4 py-2 font-medium">{t('settings.spaceColumnCreated')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {spaces.map((space) => (
              <tr key={space.id}>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: space.color ?? 'var(--accent)' }}
                    />
                    <span className="font-medium truncate">{space.name}</span>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {(space.createdById && ownerById.get(space.createdById)) || t('settings.spaceOwnerUnknown')}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]',
                      space.visibility === 'private'
                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {space.visibility === 'private' ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                    {space.visibility === 'private' ? t('settings.spacePrivate') : t('settings.spacePublic')}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                  {new Date(space.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {spacesQuery.isSuccess && spaces.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {t('settings.noSpaces')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

type AiUsageResponse = {
  totals: { calls: number; inputTokens: number; outputTokens: number; costUsd: number }
  byUser: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number }>
  byModel: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number }>
}

const AI_USAGE_RANGES = [
  { days: 7, labelKey: 'settings.aiRange7' },
  { days: 30, labelKey: 'settings.aiRange30' },
  { days: 90, labelKey: 'settings.aiRange90' },
] as const

/**
 * §A4.4 / §A6.8 — GET /ai/usage already returned per-user and per-model spend;
 * nothing rendered it. For an agency billing AI back to clients, "who spent
 * what" is the whole point, so per-user is the first table.
 */
function AiUsageTab({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const [days, setDays] = useState<number>(30)

  const from = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString()
  }, [days])

  const usageQuery = useQuery({
    queryKey: ['ai-usage', workspaceId, days],
    queryFn: () =>
      api<AiUsageResponse>(`/ai/usage?workspaceId=${workspaceId}&from=${encodeURIComponent(from)}`),
  })
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<Member[]>(`/workspaces/${workspaceId}/members`),
  })
  const nameById = new Map((membersQuery.data ?? []).map((m) => [m.userId, m.displayName || m.email]))

  const money = (value: number) => `$${value.toFixed(2)}`
  const totals = usageQuery.data?.totals
  const byUser = Object.entries(usageQuery.data?.byUser ?? {}).sort((a, b) => b[1].costUsd - a[1].costUsd)
  const byModel = Object.entries(usageQuery.data?.byModel ?? {}).sort((a, b) => b[1].costUsd - a[1].costUsd)

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-sm mb-1">{t('settings.aiUsageTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('settings.aiUsageDesc')}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            {AI_USAGE_RANGES.map((range) => (
              <Button
                key={range.days}
                size="sm"
                variant={days === range.days ? 'default' : 'outline'}
                className="text-xs"
                onClick={() => setDays(range.days)}
              >
                {t(range.labelKey)}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <UsageStat label={t('settings.aiCost')} value={money(totals?.costUsd ?? 0)} />
          <UsageStat label={t('settings.aiCalls')} value={String(totals?.calls ?? 0)} />
          <UsageStat label={t('settings.aiInputTokens')} value={(totals?.inputTokens ?? 0).toLocaleString()} />
          <UsageStat label={t('settings.aiOutputTokens')} value={(totals?.outputTokens ?? 0).toLocaleString()} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">{t('settings.aiByUser')}</h3>
        </div>
        <UsageTable
          rows={byUser.map(([userId, row]) => ({
            key: userId,
            label: nameById.get(userId) ?? t('settings.aiUnknownUser'),
            ...row,
          }))}
          emptyLabel={t('settings.aiNoUsage')}
          money={money}
          t={t}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">{t('settings.aiByModel')}</h3>
        </div>
        <UsageTable
          rows={byModel.map(([model, row]) => ({ key: model, label: model, ...row }))}
          emptyLabel={t('settings.aiNoUsage')}
          money={money}
          t={t}
        />
      </Card>
    </div>
  )
}

function UsageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  )
}

function UsageTable({
  rows,
  emptyLabel,
  money,
  t,
}: {
  rows: Array<{ key: string; label: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number }>
  emptyLabel: string
  money: (value: number) => string
  t: (key: TranslationKey) => string
}) {
  if (rows.length === 0) {
    return <div className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>
  }
  const topCost = Math.max(...rows.map((r) => r.costUsd), 0)
  const share = (cost: number) => (topCost > 0 ? Math.max(2, (cost / topCost) * 100) : 0)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
            <th className="px-4 py-2 font-medium">{t('settings.aiColumnName')}</th>
            <th className="px-4 py-2 font-medium text-right">{t('settings.aiCalls')}</th>
            <th className="px-4 py-2 font-medium text-right">{t('settings.aiInputTokens')}</th>
            <th className="px-4 py-2 font-medium text-right">{t('settings.aiOutputTokens')}</th>
            <th className="px-4 py-2 font-medium text-right">{t('settings.aiCost')}</th>
            <th className="px-4 py-2 font-medium w-32">{t('settings.aiShare')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-4 py-2.5 truncate">{row.label}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{row.calls}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{row.inputTokens.toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{row.outputTokens.toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(row.costUsd)}</td>
              <td className="px-4 py-2.5">
                {/* Who the money went to reads faster as a bar than as a column
                    of dollars, and the spend is already sorted descending. */}
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden" title={`${Math.round(share(row.costUsd))}%`}>
                  <div className="h-full bg-brand-gradient" style={{ width: `${share(row.costUsd)}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function IntegrationsTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const [showWebhookForm, setShowWebhookForm] = useState(false)
  const [whName, setWhName] = useState('')
  const [whUrl, setWhUrl] = useState('')
  const [whEvents, setWhEvents] = useState<string[]>(['task.created', 'task.status_changed'])
  // The signing secret, from the one answer that carries it — see WebhookSecretOnce.
  const [madeSecret, setMadeSecret] = useState<{ name: string; secret: string } | null>(null)

  // The server's catalog is the one list of events — this card kept its own
  // ten, shown as raw ids and four short of the server's fourteen.
  const eventCatalog = useQuery({
    queryKey: ['webhook-events', workspaceId],
    queryFn: () => api<string[]>(`/workspaces/${workspaceId}/webhooks/events`),
  })

  type Webhook = { id: string; name: string; url: string; events: string[]; isEnabled: boolean; successCount: number; failureCount: number }
  const whQuery = useQuery({
    queryKey: ['webhooks', workspaceId],
    queryFn: () => api<Webhook[]>(`/workspaces/${workspaceId}/webhooks`),
  })

  const createWh = useMutation({
    mutationFn: () =>
      api<{ name: string; secret?: string }>(`/workspaces/${workspaceId}/webhooks`, { method: 'POST', body: { name: whName, url: whUrl, events: whEvents } }),
    onSuccess: (made) => {
      qc.invalidateQueries({ queryKey: ['webhooks', workspaceId] })
      setShowWebhookForm(false)
      setWhName('')
      setWhUrl('')
      setMadeSecret(made?.secret ? { name: made.name, secret: made.secret } : null)
    },
  })

  const deleteWh = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks', workspaceId] }),
  })

  const testWh = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/webhooks/${id}/test`, { method: 'POST' }),
  })

  // Slack integration
  type SlackInfo = {
    id: string
    isEnabled: boolean
    channelName: string | null
    successCount: number
    failureCount: number
    webhookUrlHint: string
  } | null

  const [slackUrl, setSlackUrl] = useState('')
  const [slackChannel, setSlackChannel] = useState('')
  const [showSlackForm, setShowSlackForm] = useState(false)

  const slackQuery = useQuery({
    queryKey: ['slack', workspaceId],
    queryFn: () => api<SlackInfo>(`/workspaces/${workspaceId}/integrations/slack`),
  })

  const connectSlack = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/integrations/slack`, {
        method: 'POST',
        body: { webhookUrl: slackUrl, channelName: slackChannel || undefined },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slack', workspaceId] })
      setShowSlackForm(false)
      setSlackUrl('')
      setSlackChannel('')
    },
  })

  const disconnectSlack = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/integrations/slack`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slack', workspaceId] }),
  })

  const testSlack = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/integrations/slack/test`, { method: 'POST' }),
  })

  const hooks = whQuery.data ?? []

  return (
    <div className="space-y-5">
      {/* Webhooks */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-sm">{t('settings.webhooks')}</h3>
            <p className="text-xs text-muted-foreground">{t('settings.webhooksDesc')}</p>
          </div>
          <Button size="sm" data-testid="webhook-add" onClick={() => setShowWebhookForm(true)} disabled={showWebhookForm}>
            <Plus className="h-3.5 w-3.5 mr-1" /> {t('settings.addWebhook')}
          </Button>
        </div>

        {showWebhookForm && (
          <div className="mb-3 p-3 bg-muted/50 rounded-md space-y-2">
            <Input data-testid="webhook-form-name" value={whName} onChange={(e) => setWhName(e.target.value)} placeholder={t('settings.webhookNamePlaceholder')} />
            <Input data-testid="webhook-form-url" value={whUrl} onChange={(e) => setWhUrl(e.target.value)} placeholder="https://your-endpoint.com/hook" />
            <div className="flex flex-wrap gap-1">
              {(eventCatalog.data ?? []).map((ev) => (
                <button
                  key={ev}
                  data-testid={`webhook-form-event-${ev}`}
                  onClick={() => setWhEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev])}
                  className={cn('text-xs px-2 py-0.5 rounded-full border transition-colors', whEvents.includes(ev) ? 'bg-brand-700 text-white border-brand-700' : 'border-border text-muted-foreground')}
                >
                  {webhookEventLabel(t, ev)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" data-testid="webhook-form-save" disabled={!whName || !whUrl || createWh.isPending} onClick={() => createWh.mutate()}>{t('common.save')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowWebhookForm(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        )}

        {madeSecret && (
          <div className="mb-3">
            <WebhookSecretOnce name={madeSecret.name} secret={madeSecret.secret} onDone={() => setMadeSecret(null)} />
          </div>
        )}

        {/* Nothing listed is "none" only once the list has ANSWERED: while it
            loads, or when it fails, zero is not what the server holds. */}
        {whQuery.isLoading ? (
          <InlineSkeleton />
        ) : whQuery.isError ? (
          <p className="text-xs text-destructive" data-testid="webhooks-load-failed">{t('webhooks.loadFailed')}</p>
        ) : hooks.length === 0 && !showWebhookForm ? (
          <p className="text-xs text-muted-foreground">{t('settings.noWebhooks')}</p>
        ) : null}
        {hooks.map((hook) => (
          <div key={hook.id} data-testid={`webhook-row-${hook.id}`} className="flex items-center gap-3 py-2 border-t border-border/50">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{hook.name}</div>
              <div className="text-xs text-muted-foreground font-mono truncate">{hook.url}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{(hook.events as string[]).map((ev) => webhookEventLabel(t, ev)).join(', ')}</div>
            </div>
            <div className="text-xs text-muted-foreground shrink-0">
              <span className="text-emerald-600">{hook.successCount}✓</span>
              {' '}<span className="text-red-500">{hook.failureCount}✗</span>
            </div>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => testWh.mutate(hook.id)} disabled={testWh.isPending}>{t('settings.test')}</Button>
            <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => deleteWh.mutate(hook.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </Card>

      {/* Slack integration */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              Slack
              {slackQuery.data?.isEnabled && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                  {t('settings.connected')}
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('settings.slackDesc')}
            </p>
          </div>
          {!slackQuery.data && !showSlackForm && (
            <Button size="sm" onClick={() => setShowSlackForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> {t('settings.connect')}
            </Button>
          )}
        </div>

        {showSlackForm && !slackQuery.data && (
          <div className="mb-3 p-3 bg-muted/50 rounded-md space-y-2">
            <Input
              value={slackUrl}
              onChange={(e) => setSlackUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/T.../B.../..."
            />
            <Input
              value={slackChannel}
              onChange={(e) => setSlackChannel(e.target.value)}
              placeholder={t('settings.slackChannelPlaceholder')}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!slackUrl || connectSlack.isPending}
                onClick={() => connectSlack.mutate()}
              >
                {t('settings.connect')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowSlackForm(false)}>
                {t('common.cancel')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.slackWebhookHelp')}{' '}
              <a
                href="https://api.slack.com/messaging/webhooks"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {t('settings.slackApps')}
              </a>.
            </p>
          </div>
        )}

        {slackQuery.data && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              <span className="font-mono">{slackQuery.data.webhookUrlHint}</span>
              {slackQuery.data.channelName && (
                <span className="ml-2">• {slackQuery.data.channelName}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="text-emerald-600">{slackQuery.data.successCount}✓</span>
              {' '}
              <span className="text-red-500">{slackQuery.data.failureCount}✗</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => testSlack.mutate()} disabled={testSlack.isPending}>
                {testSlack.isPending ? t('settings.sending') : t('settings.sendTest')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => disconnectSlack.mutate()}
              >
                {t('settings.disconnect')}
              </Button>
            </div>
            {testSlack.isSuccess && (
              <p className="text-xs text-emerald-600">{t('settings.testMessageSent')}</p>
            )}
            {testSlack.isError && (
              <p className="text-xs text-destructive">{(testSlack.error as Error).message}</p>
            )}
          </div>
        )}
      </Card>

      {/* ClickUp Import */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">{t('settings.clickupImport')}</h3>
            <p className="text-xs text-muted-foreground">
              {t('settings.clickupImportDesc')}
            </p>
          </div>
          <a href={`/app/${workspaceId}/import`}>
            <Button size="sm" variant="outline">{t('settings.openImporter')}</Button>
          </a>
        </div>
      </Card>

      {/* Data export */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-1">{t('settings.dataExport')}</h3>
        <p className="text-xs text-muted-foreground mb-3">{t('settings.dataExportDesc')}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadFile(`/workspaces/${workspaceId}/export/json`, `rundesk-${workspaceId}.json`).catch((e) =>
                toast.error(e instanceof Error ? e.message : t('settings.exportFailed')),
              )
            }
          >
            {t('settings.exportJson')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadFile(`/workspaces/${workspaceId}/export/csv/tasks`, `rundesk-${workspaceId}-tasks.csv`).catch((e) =>
                toast.error(e instanceof Error ? e.message : t('settings.exportFailed')),
              )
            }
          >
            {t('settings.exportTasksCsv')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function SecurityTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyScope, setNewKeyScope] = useState('read_write')
  const [revealedKey, setRevealedKey] = useState<string | null>(null)

  type ApiKey = {
    id: string
    name: string
    keyPrefix: string
    scope: string
    isRevoked: boolean
    lastUsedAt?: string | null
    requestCount: number
    createdAt: string
  }

  const keysQuery = useQuery({
    queryKey: ['api-keys', workspaceId],
    queryFn: () => api<ApiKey[]>(`/workspaces/${workspaceId}/api-keys`),
  })

  const createKey = useMutation({
    mutationFn: () =>
      api<ApiKey & { key: string }>(`/workspaces/${workspaceId}/api-keys`, {
        method: 'POST',
        body: { name: newKeyName.trim(), scope: newKeyScope },
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['api-keys', workspaceId] })
      setRevealedKey(data.key)
      setNewKeyName('')
    },
  })

  const revokeKey = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/api-keys/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys', workspaceId] }),
  })

  const deleteKey = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys', workspaceId] }),
  })

  const keys = keysQuery.data ?? []

  return (
    <div className="space-y-4">
      {/* API Keys */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-1">{t('settings.apiKeys')}</h3>
        <p className="text-xs text-muted-foreground mb-3">
          {t('settings.apiKeysDesc')}
        </p>

        {revealedKey && (
          <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
            <p className="text-xs font-medium text-emerald-700 mb-1">{t('settings.keyCreated')}</p>
            <code className="text-xs font-mono break-all">{revealedKey}</code>
            <button className="text-xs text-emerald-700 hover:underline ml-2" onClick={() => navigator.clipboard.writeText(revealedKey)}>{t('settings.copy')}</button>
            <button className="text-xs text-muted-foreground hover:underline ml-2" onClick={() => setRevealedKey(null)}>{t('settings.dismiss')}</button>
          </div>
        )}

        <div className="flex gap-2 mb-3">
          <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder={t('settings.keyNamePlaceholder')} className="flex-1" />
          <select
            value={newKeyScope}
            onChange={(e) => setNewKeyScope(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="read_only">{t('settings.scopeReadOnly')}</option>
            <option value="read_write">{t('settings.scopeReadWrite')}</option>
            <option value="admin">{t('settings.scopeAdmin')}</option>
          </select>
          <Button size="sm" disabled={!newKeyName.trim() || createKey.isPending} onClick={() => createKey.mutate()}>
            {t('settings.generate')}
          </Button>
        </div>

        {keys.length > 0 && (
          <div className="space-y-2">
            {keys.map((key) => (
              <div key={key.id} className="flex items-center gap-2 text-sm py-1.5 border-t border-border/50">
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{key.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground font-mono">{key.keyPrefix}…</span>
                  {key.isRevoked && <span className="ml-2 text-xs text-destructive">{t('settings.revoked')}</span>}
                </div>
                <span className="text-xs text-muted-foreground">{key.scope}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{key.requestCount} {t('settings.requestsUnit')}</span>
                {!key.isRevoked && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => revokeKey.mutate(key.id)}>{t('settings.revoke')}</Button>
                )}
                <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => deleteKey.mutate(key.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SharingPolicyCard workspaceId={workspaceId} />

      <AdvancedSecurityPanel workspaceId={workspaceId} />
    </div>
  )
}

/**
 * §A4.2 — the two sharing policies an agency holding client data actually needs.
 * Both are workspace columns, so they live beside the session/IP controls rather
 * than in the security-settings table the panel below owns.
 */
function SharingPolicyCard({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const { t } = useTranslation()

  const wsQuery = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api<Workspace>(`/workspaces/${workspaceId}`),
  })

  const save = useMutation({
    mutationFn: (patch: { defaultSpacePrivate?: boolean; blockPublicSharing?: boolean }) =>
      api(`/workspaces/${workspaceId}`, { method: 'PATCH', body: patch }),
    onSuccess: () => {
      toast.success(t('settings.sharingPolicySaved'))
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-sm mb-1">{t('settings.sharingPolicy')}</h3>
      <p className="text-xs text-muted-foreground mb-3">{t('settings.sharingPolicyDesc')}</p>
      <div className="space-y-3">
        <PolicyRow
          title={t('settings.defaultSpacePrivate')}
          description={t('settings.defaultSpacePrivateDesc')}
          checked={wsQuery.data?.defaultSpacePrivate ?? false}
          disabled={!wsQuery.data || save.isPending}
          onChange={(value) => save.mutate({ defaultSpacePrivate: value })}
        />
        <PolicyRow
          title={t('settings.blockPublicSharing')}
          description={t('settings.blockPublicSharingDesc')}
          checked={wsQuery.data?.blockPublicSharing ?? false}
          disabled={!wsQuery.data || save.isPending}
          onChange={(value) => save.mutate({ blockPublicSharing: value })}
        />
      </div>
    </Card>
  )
}

function PolicyRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/40 bg-card/30 p-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

type LabelRow = { id: string; name: string; color: string }

type TaskType = {
  id: string
  name: string
  icon: string | null
  color: string | null
  isDefault: boolean
  position: number
}

/**
 * Task Types — what a task *is* (Task, Campaign, Invoice), as distinct from
 * what state it is in. A workspace may nominate one default, which new tasks
 * pick up wherever they are created.
 */
function TaskTypesTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [color, setColor] = useState('#6366f1')

  const key = ['task-types', workspaceId] as const
  const typesQuery = useQuery({
    queryKey: key,
    queryFn: () => api<TaskType[]>(`/workspaces/${workspaceId}/task-types`),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: key })
  const failed = (e: unknown) => toast.error(e instanceof ApiError ? e.message : t('taskTypes.failed'))

  const create = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/task-types`, {
        method: 'POST',
        body: { name: name.trim(), icon: icon.trim() || null, color },
      }),
    onSuccess: () => { setName(''); setIcon(''); toast.success(t('taskTypes.created')); refresh() },
    onError: failed,
  })

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TaskType> }) =>
      api(`/workspaces/${workspaceId}/task-types/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: refresh,
    onError: failed,
  })

  // The server SET NULLs the tasks rather than deleting them, and tells us how
  // many it touched — worth saying out loud instead of a bare "deleted".
  const remove = useMutation({
    mutationFn: (id: string) =>
      api<{ untypedTasks: number }>(`/workspaces/${workspaceId}/task-types/${id}`, { method: 'DELETE' }),
    onSuccess: (res) => {
      toast.success(
        res.untypedTasks > 0
          ? t('taskTypes.deletedWithTasks', { count: String(res.untypedTasks) })
          : t('taskTypes.deleted'),
      )
      refresh()
    },
    onError: failed,
  })

  const types = typesQuery.data ?? []

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
            <Shapes className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">{t('taskTypes.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('taskTypes.desc')}</p>
          </div>
        </div>

        <form
          className="flex flex-wrap gap-2 mt-4"
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate() }}
        >
          <Input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder={t('taskTypes.iconPlaceholder')}
            aria-label={t('taskTypes.iconLabel')}
            className="w-20 text-center"
            maxLength={8}
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('taskTypes.namePlaceholder')}
            aria-label={t('taskTypes.nameLabel')}
            className="flex-1 min-w-[160px]"
            maxLength={80}
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label={t('taskTypes.colorLabel')}
            className="h-9 w-12 rounded-md border border-border bg-card cursor-pointer"
          />
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {create.isPending ? t('taskTypes.adding') : t('taskTypes.add')}
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm">{t('taskTypes.existing')}</h2>
        </div>
        {typesQuery.isLoading ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground"><InlineSkeleton /></p>
        ) : types.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('taskTypes.none')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {types.map((tt) => (
              <li key={tt.id} className="px-4 py-3 flex items-center gap-3">
                <span
                  className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-sm"
                  style={{ backgroundColor: (tt.color ?? '#6366f1') + '22', color: tt.color ?? undefined }}
                >
                  {tt.icon || tt.name.charAt(0).toUpperCase()}
                </span>
                <Input
                  defaultValue={tt.name}
                  aria-label={t('taskTypes.renameLabel', { name: tt.name })}
                  className="flex-1 h-8 text-sm"
                  maxLength={80}
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (next && next !== tt.name) update.mutate({ id: tt.id, patch: { name: next } })
                  }}
                />
                {/* Exactly one default per workspace — clicking a different one
                    moves it rather than adding a second. */}
                <button
                  type="button"
                  onClick={() => update.mutate({ id: tt.id, patch: { isDefault: !tt.isDefault } })}
                  disabled={update.isPending}
                  title={tt.isDefault ? t('taskTypes.isDefault') : t('taskTypes.makeDefault')}
                  aria-label={tt.isDefault ? t('taskTypes.isDefault') : t('taskTypes.makeDefault')}
                  aria-pressed={tt.isDefault}
                  className={cn(
                    'h-7 w-7 shrink-0 rounded-md flex items-center justify-center',
                    tt.isDefault
                      ? 'text-amber-500 bg-amber-500/10'
                      : 'text-muted-foreground hover:bg-surface-50',
                  )}
                >
                  <Star className={cn('h-3.5 w-3.5', tt.isDefault && 'fill-current')} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(t('taskTypes.deleteConfirm', { name: tt.name }))) remove.mutate(tt.id)
                  }}
                  disabled={remove.isPending}
                  title={t('taskTypes.delete')}
                  aria-label={t('taskTypes.deleteLabel', { name: tt.name })}
                  className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

const WEEKDAYS: { iso: number; labelKey: TranslationKey }[] = [
  { iso: 1, labelKey: 'workSchedule.mon' },
  { iso: 2, labelKey: 'workSchedule.tue' },
  { iso: 3, labelKey: 'workSchedule.wed' },
  { iso: 4, labelKey: 'workSchedule.thu' },
  { iso: 5, labelKey: 'workSchedule.fri' },
  { iso: 6, labelKey: 'workSchedule.sat' },
  { iso: 7, labelKey: 'workSchedule.sun' },
]

/**
 * Which days the workspace works, and which dates it does not.
 *
 * Per-member capacity has been stored for a while; this is what tells Workload
 * how those hours are spread. A Sun–Thu team was previously read as two days of
 * overtime and two days idle.
 */
function WorkScheduleTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const [day, setDay] = useState('')
  const [holidayName, setHolidayName] = useState('')

  const key = ['work-schedule', workspaceId] as const
  const scheduleQuery = useQuery({
    queryKey: key,
    queryFn: () =>
      api<{ workDays: number[]; holidays: { id: string; day: string; name: string }[] }>(
        `/workspaces/${workspaceId}/work-schedule`,
      ),
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key })
    // Workload reads capacity through this, so it must not keep a stale week.
    qc.invalidateQueries({ queryKey: ['workload-report', workspaceId] })
  }
  const failed = (e: unknown) => toast.error(e instanceof ApiError ? e.message : t('workSchedule.failed'))

  const setDays = useMutation({
    mutationFn: (workDays: number[]) =>
      api(`/workspaces/${workspaceId}/work-schedule`, { method: 'PATCH', body: { workDays } }),
    onSuccess: () => { toast.success(t('workSchedule.saved')); refresh() },
    onError: failed,
  })

  const addHoliday = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/holidays`, {
        method: 'POST',
        body: { day, name: holidayName.trim() },
      }),
    onSuccess: () => { setDay(''); setHolidayName(''); toast.success(t('workSchedule.holidayAdded')); refresh() },
    onError: failed,
  })

  const removeHoliday = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/holidays/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success(t('workSchedule.holidayRemoved')); refresh() },
    onError: failed,
  })

  const workDays = scheduleQuery.data?.workDays ?? []
  const holidays = scheduleQuery.data?.holidays ?? []

  const toggle = (iso: number) => {
    const next = workDays.includes(iso) ? workDays.filter((d) => d !== iso) : [...workDays, iso].sort()
    // The server rejects an empty week too; catching it here saves a round trip
    // and explains why nothing happened.
    if (next.length === 0) return toast.error(t('workSchedule.needOneDay'))
    setDays.mutate(next)
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">{t('workSchedule.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('workSchedule.desc')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => {
            const on = workDays.includes(d.iso)
            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => toggle(d.iso)}
                disabled={setDays.isPending || scheduleQuery.isLoading}
                aria-pressed={on}
                className={cn(
                  'px-3 py-1.5 rounded-md border text-sm transition-colors',
                  on
                    ? 'border-accent bg-accent/10 text-accent font-medium'
                    : 'border-border bg-card text-muted-foreground hover:bg-surface-50',
                )}
              >
                {t(d.labelKey)}
              </button>
            )
          })}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm">{t('workSchedule.holidays')}</h2>
          <p className="text-xs text-muted-foreground">{t('workSchedule.holidaysDesc')}</p>
        </div>
        <form
          className="px-4 py-3 flex flex-wrap gap-2 border-b border-border"
          onSubmit={(e) => { e.preventDefault(); if (day && holidayName.trim()) addHoliday.mutate() }}
        >
          <Input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            aria-label={t('workSchedule.dateLabel')}
            className="w-44"
          />
          <Input
            value={holidayName}
            onChange={(e) => setHolidayName(e.target.value)}
            placeholder={t('workSchedule.holidayNamePlaceholder')}
            aria-label={t('workSchedule.holidayNameLabel')}
            className="flex-1 min-w-[160px]"
          />
          <Button type="submit" disabled={!day || !holidayName.trim() || addHoliday.isPending}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('workSchedule.addHoliday')}
          </Button>
        </form>
        {holidays.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('workSchedule.noHolidays')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {holidays.map((h) => (
              <li key={h.id} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-sm font-medium w-28 shrink-0 tabular-nums">{h.day}</span>
                <span className="text-sm flex-1 truncate">{h.name}</span>
                <button
                  type="button"
                  onClick={() => removeHoliday.mutate(h.id)}
                  disabled={removeHoliday.isPending}
                  aria-label={t('workSchedule.removeHoliday', { name: h.name })}
                  title={t('workSchedule.removeHoliday', { name: h.name })}
                  className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function LabelsTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const { t, tCount } = useTranslation()
  const labels = useQuery({
    queryKey: ['workspace-labels', workspaceId],
    queryFn: async () => {
      try {
        return await api<LabelRow[]>(`/workspaces/${workspaceId}/labels`)
      } catch {
        return [] as LabelRow[]
      }
    },
  })
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6f96d1')

  const create = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/labels`, {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      }),
    onSuccess: () => {
      setName('')
      qc.invalidateQueries({ queryKey: ['workspace-labels', workspaceId] })
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/labels/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-labels', workspaceId] }),
  })
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api(`/labels/${id}`, { method: 'PATCH', body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-labels', workspaceId] }),
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const commitRename = (id: string, original: string) => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== original) rename.mutate({ id, name: trimmed })
    setEditingId(null)
  }

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-2">{t('settings.addLabel')}</h3>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate()
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings.labelNamePlaceholder')} className="flex-1" />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 rounded border border-border cursor-pointer"
          />
          <Button size="sm" type="submit" disabled={!name.trim() || create.isPending}>{t('settings.add')}</Button>
        </form>
      </Card>
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">{tCount('settings.workspaceLabels', labels.data?.length ?? 0)}</h3>
        </div>
        <ul className="divide-y divide-border">
          {(labels.data ?? []).map((l) => (
            <li key={l.id} className="px-4 py-2.5 flex items-center gap-3 group">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: l.color }} />
              {editingId === l.id ? (
                <Input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => commitRename(l.id, l.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(l.id, l.name)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="flex-1 h-7 text-sm"
                />
              ) : (
                <button
                  type="button"
                  className="flex-1 text-left text-sm hover:underline"
                  title={t('settings.clickToRename')}
                  onClick={() => {
                    setEditingId(l.id)
                    setEditName(l.name)
                  }}
                >
                  {l.name}
                </button>
              )}
              <button onClick={() => remove.mutate(l.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {labels.data?.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted-foreground text-center">{t('settings.noLabels')}</li>
          )}
        </ul>
      </Card>
    </div>
  )
}

function CapacityInput({
  value,
  pending,
  onCommit,
}: {
  value: number
  pending: boolean
  onCommit: (next: number) => void
}) {
  const { t } = useTranslation()
  const [local, setLocal] = useState(String(value))
  useEffect(() => {
    setLocal(String(value))
  }, [value])
  return (
    <div className="flex items-center gap-1 text-xs">
      <input
        type="number"
        min={0}
        max={168}
        step={1}
        value={local}
        disabled={pending}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const next = parseInt(local, 10)
          if (Number.isFinite(next) && next !== value) onCommit(next)
          else setLocal(String(value))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setLocal(String(value))
        }}
        className="w-14 px-1.5 py-1 rounded border border-border bg-card text-right tabular-nums disabled:opacity-60"
        title={t('settings.weeklyCapacity')}
      />
      <span className="text-muted-foreground">{t('settings.hoursPerWeekUnit')}</span>
    </div>
  )
}

// §13.4 — Restore UI. Surfaces archived tasks (workspace-wide) and archived
// workspaces the admin belongs to, each with a Restore action wired to the
// existing restore endpoints.

function ArchivedTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const { t } = useTranslation()

  const tasksQuery = useQuery({
    queryKey: ['archived-tasks', workspaceId],
    queryFn: () => api<ArchivedTask[]>(`/workspaces/${workspaceId}/archived-tasks`),
  })
  const workspacesQuery = useQuery({
    queryKey: ['archived-workspaces'],
    queryFn: () => api<ArchivedWorkspaceEntry[]>(`/workspaces/archived`),
  })

  const restoreTask = useMutation({
    mutationFn: (taskId: string) => api(`/tasks/${taskId}/restore`, { method: 'POST' }),
    onSuccess: () => {
      toast.success(t('settings.restoredTask'))
      qc.invalidateQueries({ queryKey: ['archived-tasks', workspaceId] })
    },
    onError: () => toast.error(t('settings.restoreFailed')),
  })

  const restoreWorkspace = useMutation({
    mutationFn: (wsId: string) => api(`/workspaces/${wsId}/restore`, { method: 'POST' }),
    onSuccess: () => {
      toast.success(t('settings.restoredWorkspace'))
      qc.invalidateQueries({ queryKey: ['archived-workspaces'] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
    },
    onError: () => toast.error(t('settings.restoreFailed')),
  })

  const tasks = tasksQuery.data ?? []
  const archivedWs = workspacesQuery.data ?? []

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t('settings.archivedSubtitle')}</p>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Archive className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">{t('settings.archivedTasks')}</h2>
        </div>
        <ul className="divide-y divide-border/60">
          {tasksQuery.isLoading && (
            <li className="px-4 py-6 text-sm text-muted-foreground text-center"><InlineSkeleton /></li>
          )}
          {!tasksQuery.isLoading && tasks.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted-foreground text-center">{t('settings.archivedTasksEmpty')}</li>
          )}
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{task.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {task.projectName} · {task.listName}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                disabled={restoreTask.isPending}
                onClick={() => restoreTask.mutate(task.id)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {restoreTask.isPending ? t('settings.restoring') : t('settings.restore')}
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">{t('settings.archivedWorkspaces')}</h2>
        </div>
        <ul className="divide-y divide-border/60">
          {workspacesQuery.isLoading && (
            <li className="px-4 py-6 text-sm text-muted-foreground text-center"><InlineSkeleton /></li>
          )}
          {!workspacesQuery.isLoading && archivedWs.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted-foreground text-center">{t('settings.archivedWorkspacesEmpty')}</li>
          )}
          {archivedWs.map((entry) => (
            <li key={entry.workspace.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{entry.workspace.name}</div>
                <div className="text-xs text-muted-foreground truncate font-mono">{entry.workspace.slug}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                disabled={restoreWorkspace.isPending}
                onClick={() => restoreWorkspace.mutate(entry.workspace.id)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {restoreWorkspace.isPending ? t('settings.restoring') : t('settings.restore')}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
