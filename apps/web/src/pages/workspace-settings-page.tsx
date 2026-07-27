import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, Label, cn, toast } from '@rundesk/ui'
import { Building2, Users, Plug, Shield, Tag, Trash2, UserPlus, Plus, Settings as SettingsIcon, Link2, RefreshCw, KeyRound, Users2, ShieldCheck, Upload, CreditCard, ToggleRight } from 'lucide-react'
import { api, ApiError, downloadFile } from '../lib/api'
import { applyBrandColor } from '../lib/branding'
import { applyAccentColor } from '../components/app-topbar'
import { AdvancedSecurityPanel } from '../components/advanced-security-panel'
import { SsoTab } from '../components/sso-tab'
import { GroupsTab } from '../components/groups-tab'
import { RolesTab } from '../components/roles-tab'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { LanguageSwitcher } from '../components/language-switcher'
import { TrashTab } from '../components/trash-tab'
import { useResolvedFlags } from '../lib/use-feature-flags'
import { useWorkspaceRole } from '../hooks/use-workspace-role'
import { FLAGS } from '@rundesk/feature-flags'
import type { FlagKey } from '@rundesk/feature-flags'

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
}

type Member = {
  userId: string
  email: string
  displayName: string
  avatarUrl?: string | null
  role: string
  weeklyCapacityHours?: number
  joinedAt: string
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

const TABS = [
  { id: 'general', labelKey: 'settings.tabGeneral', icon: Building2 },
  { id: 'members', labelKey: 'settings.tabMembers', icon: Users },
  { id: 'groups', labelKey: 'settings.tabGroups', icon: Users2 },
  { id: 'roles', labelKey: 'settings.tabRoles', icon: ShieldCheck },
  { id: 'features', labelKey: 'settings.tabFeatures', icon: ToggleRight },
  { id: 'integrations', labelKey: 'settings.tabIntegrations', icon: Plug },
  { id: 'security', labelKey: 'settings.tabSecurity', icon: Shield },
  { id: 'sso', labelKey: 'settings.tabSso', icon: KeyRound },
  { id: 'labels', labelKey: 'settings.tabLabels', icon: Tag },
  { id: 'trash', labelKey: 'settings.tabTrash', icon: Trash2 },
] as const

function isUuidLike(value?: string): value is string {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/settings' })
  const validWorkspaceId = isUuidLike(workspaceId) ? workspaceId : null
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('general')
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
          <nav className="space-y-0.5">
            {TABS.map((item) => (
              <button
                key={item.id}
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

const PLAN_FEATURE_KEYS = [
  'ai', 'automations', 'sso', 'customRoles', 'webhooks', 'guests', 'integrations', 'customBranding', 'prioritySupport',
] as const

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
  if (planQuery.isLoading) return <Card className="p-6 text-sm text-muted-foreground">{t('common.loading')}</Card>
  if (!planQuery.data) return null
  const p = planQuery.data
  const usageLine = (used: number, limit: number | null) =>
    limit == null ? `${used} · ${t('plan.unlimited')}` : t('plan.ofLimit', { used, limit })
  const enabledFeatures = PLAN_FEATURE_KEYS.filter((f) => p.features?.[f])
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

  if (billingQuery.isLoading) return <Card className="p-6 text-sm text-muted-foreground">{t('common.loading')}</Card>
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

  if (!wsQuery.data) return <Card className="p-6 text-sm text-muted-foreground">{t('common.loading')}</Card>

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
      {/* Personal preference (Plan §13): user's UI language. */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/40 p-3">
        <div>
          <div className="text-sm font-medium">{t('settings.language')}</div>
          <div className="text-xs text-muted-foreground">{t('settings.languageDesc')}</div>
        </div>
        <LanguageSwitcher />
      </div>
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
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-sm">{tCount('settings.activeMembers', membersQuery.data?.length ?? 0)}</h2>
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
              </div>
              <CapacityInput
                value={m.weeklyCapacityHours ?? 40}
                pending={updateCapacity.isPending && updateCapacity.variables?.userId === m.userId}
                onCommit={(weeklyCapacityHours) =>
                  updateCapacity.mutate({ userId: m.userId, weeklyCapacityHours })
                }
              />
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

  const ALL_EVENTS = ['task.created','task.updated','task.deleted','task.status_changed','task.assigned','comment.created','project.created','member.invited','member.removed','form.submitted']

  type Webhook = { id: string; name: string; url: string; events: string[]; isEnabled: boolean; successCount: number; failureCount: number }
  const whQuery = useQuery({
    queryKey: ['webhooks', workspaceId],
    queryFn: () => api<Webhook[]>(`/workspaces/${workspaceId}/webhooks`),
  })

  const createWh = useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}/webhooks`, { method: 'POST', body: { name: whName, url: whUrl, events: whEvents } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks', workspaceId] }); setShowWebhookForm(false); setWhName(''); setWhUrl('') },
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
          <Button size="sm" onClick={() => setShowWebhookForm(true)} disabled={showWebhookForm}>
            <Plus className="h-3.5 w-3.5 mr-1" /> {t('settings.addWebhook')}
          </Button>
        </div>

        {showWebhookForm && (
          <div className="mb-3 p-3 bg-muted/50 rounded-md space-y-2">
            <Input value={whName} onChange={(e) => setWhName(e.target.value)} placeholder={t('settings.webhookNamePlaceholder')} />
            <Input value={whUrl} onChange={(e) => setWhUrl(e.target.value)} placeholder="https://your-endpoint.com/hook" />
            <div className="flex flex-wrap gap-1">
              {ALL_EVENTS.map((ev) => (
                <button
                  key={ev}
                  onClick={() => setWhEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev])}
                  className={cn('text-xs px-2 py-0.5 rounded-full border transition-colors', whEvents.includes(ev) ? 'bg-brand-700 text-white border-brand-700' : 'border-border text-muted-foreground')}
                >
                  {ev}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={!whName || !whUrl || createWh.isPending} onClick={() => createWh.mutate()}>{t('common.save')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowWebhookForm(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        )}

        {hooks.length === 0 && !showWebhookForm && (
          <p className="text-xs text-muted-foreground">{t('settings.noWebhooks')}</p>
        )}
        {hooks.map((hook) => (
          <div key={hook.id} className="flex items-center gap-3 py-2 border-t border-border/50">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{hook.name}</div>
              <div className="text-xs text-muted-foreground font-mono truncate">{hook.url}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{(hook.events as string[]).join(', ')}</div>
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

      <AdvancedSecurityPanel workspaceId={workspaceId} />
    </div>
  )
}

type LabelRow = { id: string; name: string; color: string }

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
type ArchivedWorkspaceEntry = { workspace: Workspace; role: string }

