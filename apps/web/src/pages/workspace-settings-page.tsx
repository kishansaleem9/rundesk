import { useState, useEffect } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, Label, cn, toast } from '@rundesk/ui'
import { Building2, Users, Plug, Shield, Tag, Trash2, UserPlus, Plus, Settings as SettingsIcon, Link2, RefreshCw, KeyRound, Users2, ShieldCheck } from 'lucide-react'
import { api, ApiError, downloadFile } from '../lib/api'
import { AdvancedSecurityPanel } from '../components/advanced-security-panel'
import { SsoTab } from '../components/sso-tab'
import { GroupsTab } from '../components/groups-tab'
import { RolesTab } from '../components/roles-tab'

type Workspace = {
  id: string
  name: string
  slug: string
  logoUrl?: string | null
  primaryColor?: string | null
  customDomain?: string | null
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
  { value: 'workspace_admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Member' },
  { value: 'guest', label: 'Guest' },
]

type Invitation = {
  id: string
  email: string
  role: string
  status: 'pending' | 'accepted' | 'expired'
  expiresAt: string
}

const TABS = [
  { id: 'general', label: 'General', icon: Building2 },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'groups', label: 'Groups', icon: Users2 },
  { id: 'roles', label: 'Roles', icon: ShieldCheck },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'sso', label: 'SSO & SCIM', icon: KeyRound },
  { id: 'labels', label: 'Labels', icon: Tag },
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

  useEffect(() => {
    if (!validWorkspaceId) {
      navigate({ to: '/app/profile' })
    }
  }, [navigate, validWorkspaceId])

  if (!validWorkspaceId) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Redirecting to profile...
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
              Workspace
            </div>
            <h1 className="font-display text-2xl font-semibold leading-tight">Settings</h1>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
          Manage your workspace name, members, integrations, and security policies.
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
          <nav className="space-y-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all',
                  tab === t.id
                    ? 'bg-accent/15 text-foreground font-medium [&>svg]:text-accent'
                    : 'hover:bg-card/60 text-muted-foreground hover:text-foreground',
                )}
              >
                <t.icon className="h-4 w-4 shrink-0" />
                {t.label}
              </button>
            ))}
          </nav>

          <div>
            {tab === 'general' && <GeneralTab workspaceId={validWorkspaceId} />}
            {tab === 'members' && <MembersTab workspaceId={validWorkspaceId} />}
            {tab === 'groups' && <GroupsTab workspaceId={validWorkspaceId} />}
            {tab === 'roles' && <RolesTab workspaceId={validWorkspaceId} />}
            {tab === 'integrations' && <IntegrationsTab workspaceId={validWorkspaceId} />}
            {tab === 'security' && <SecurityTab workspaceId={validWorkspaceId} />}
            {tab === 'sso' && <SsoTab workspaceId={validWorkspaceId} />}
            {tab === 'labels' && <LabelsTab workspaceId={validWorkspaceId} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function GeneralTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const wsQuery = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api<Workspace>(`/workspaces/${workspaceId}`),
  })
  const [name, setName] = useState('')
  const [primaryColor, setPrimaryColor] = useState('')
  const [customDomain, setCustomDomain] = useState('')

  useEffect(() => {
    if (wsQuery.data) {
      setName(wsQuery.data.name)
      setPrimaryColor(wsQuery.data.primaryColor ?? '')
      setCustomDomain(wsQuery.data.customDomain ?? '')
    }
  }, [wsQuery.data])

  const save = useMutation({
    mutationFn: () =>
      api<Workspace>(`/workspaces/${workspaceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, primaryColor: primaryColor || null, customDomain: customDomain || null }),
      }),
    onSuccess: (updated) => {
      qc.setQueryData(['workspace', workspaceId], updated)
      qc.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })

  if (!wsQuery.data) return <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>

  const dirty =
    name !== wsQuery.data.name ||
    primaryColor !== (wsQuery.data.primaryColor ?? '') ||
    customDomain !== (wsQuery.data.customDomain ?? '')

  return (
    <Card className="p-6 space-y-5">
      <div>
        <Label>Workspace ID</Label>
        <Input value={wsQuery.data.id} readOnly className="font-mono text-xs" />
      </div>
      <div>
        <Label>Slug</Label>
        <Input value={wsQuery.data.slug} readOnly className="font-mono text-xs" />
      </div>
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="primary">Primary brand color (hex)</Label>
        <Input id="primary" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#354fb0" />
      </div>
      <div>
        <Label htmlFor="domain">Custom domain</Label>
        <Input id="domain" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="rundesk.example.com" />
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border">
        <span className="text-xs">
          {save.isSuccess && <span className="text-emerald-600">Saved.</span>}
          {save.error instanceof ApiError && <span className="text-destructive">{save.error.message}</span>}
        </span>
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} size="sm">
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Card>
  )
}

function MembersTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  
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
      toast.success('Invitation sent!')
      qc.invalidateQueries({ queryKey: ['workspace-invitations', workspaceId] })
    },
  })

  const cancelInvite = useMutation({
    mutationFn: (id: string) => api(`/invitations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Invitation cancelled')
      qc.invalidateQueries({ queryKey: ['workspace-invitations', workspaceId] })
    },
  })

  const resendInvite = useMutation({
    mutationFn: (id: string) => api(`/invitations/${id}/resend`, { method: 'POST' }),
    onSuccess: () => toast.success('Invitation resent'),
  })

  const copyLink = useMutation({
    mutationFn: async (id: string) => {
      const data = await api<{ claimUrl: string }>(`/invitations/${id}/link`)
      await navigator.clipboard.writeText(data.claimUrl)
      return data.claimUrl
    },
    onSuccess: () => toast.success('Invite link copied'),
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
      toast.success('Capacity updated')
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
            <h2 className="font-semibold text-sm">Invite a teammate</h2>
            <p className="text-xs text-muted-foreground">They&apos;ll get an email to join this workspace.</p>
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
            placeholder="teammate@company.com"
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
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <Button type="submit" disabled={!inviteEmail.includes('@') || invite.isPending}>
            {invite.isPending ? 'Sending...' : 'Invite'}
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
              Pending Invitations · {invitesQuery.data?.length}
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
                    {inv.role} · Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => copyLink.mutate(inv.id)}
                  disabled={copyLink.isPending}
                  title="Copy invitation link"
                >
                  <Link2 className="h-3.5 w-3.5 mr-1" />
                  Copy link
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => resendInvite.mutate(inv.id)}
                  disabled={resendInvite.isPending}
                  title="Resend invitation email"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Resend
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => cancelInvite.mutate(inv.id)}
                  disabled={cancelInvite.isPending}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-sm">Active Members · {membersQuery.data?.length ?? 0}</h2>
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
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (confirm(`Remove ${m.displayName} from the workspace?`)) remove.mutate(m.userId)
                }}
                className="p-1.5 rounded hover:bg-surface-50 text-muted-foreground hover:text-destructive"
                title="Remove member"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {membersQuery.data?.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted-foreground text-center">No members yet.</li>
          )}
        </ul>
      </Card>
    </div>
  )
}

function IntegrationsTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
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
            <h3 className="font-semibold text-sm">Webhooks</h3>
            <p className="text-xs text-muted-foreground">Send outbound HTTP events to your URLs when things happen in Rundesk.</p>
          </div>
          <Button size="sm" onClick={() => setShowWebhookForm(true)} disabled={showWebhookForm}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add webhook
          </Button>
        </div>

        {showWebhookForm && (
          <div className="mb-3 p-3 bg-muted/50 rounded-md space-y-2">
            <Input value={whName} onChange={(e) => setWhName(e.target.value)} placeholder="Name (e.g. Slack notifications)" />
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
              <Button size="sm" disabled={!whName || !whUrl || createWh.isPending} onClick={() => createWh.mutate()}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowWebhookForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {hooks.length === 0 && !showWebhookForm && (
          <p className="text-xs text-muted-foreground">No webhooks configured yet.</p>
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
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => testWh.mutate(hook.id)} disabled={testWh.isPending}>Test</Button>
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
                  Connected
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground">
              Send task notifications to a Slack channel via incoming webhook.
            </p>
          </div>
          {!slackQuery.data && !showSlackForm && (
            <Button size="sm" onClick={() => setShowSlackForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Connect
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
              placeholder="Channel name (optional, e.g. #project-updates)"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!slackUrl || connectSlack.isPending}
                onClick={() => connectSlack.mutate()}
              >
                Connect
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowSlackForm(false)}>
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your incoming-webhook URL from{' '}
              <a
                href="https://api.slack.com/messaging/webhooks"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Slack apps
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
                {testSlack.isPending ? 'Sending...' : 'Send test'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => disconnectSlack.mutate()}
              >
                Disconnect
              </Button>
            </div>
            {testSlack.isSuccess && (
              <p className="text-xs text-emerald-600">Test message sent.</p>
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
            <h3 className="font-semibold text-sm">ClickUp import</h3>
            <p className="text-xs text-muted-foreground">
              Migrate spaces, lists, and tasks from a ClickUp CSV export.
            </p>
          </div>
          <a href={`/app/${workspaceId}/import`}>
            <Button size="sm" variant="outline">Open importer</Button>
          </a>
        </div>
      </Card>

      {/* Data export */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-1">Data export</h3>
        <p className="text-xs text-muted-foreground mb-3">Download a full copy of your workspace data.</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadFile(`/workspaces/${workspaceId}/export/json`, `rundesk-${workspaceId}.json`).catch((e) =>
                toast.error(e instanceof Error ? e.message : 'Export failed'),
              )
            }
          >
            Export JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadFile(`/workspaces/${workspaceId}/export/csv/tasks`, `rundesk-${workspaceId}-tasks.csv`).catch((e) =>
                toast.error(e instanceof Error ? e.message : 'Export failed'),
              )
            }
          >
            Export tasks CSV
          </Button>
        </div>
      </Card>
    </div>
  )
}

function SecurityTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
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
        <h3 className="font-semibold text-sm mb-1">API keys</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Generate API keys to integrate with external tools.
        </p>

        {revealedKey && (
          <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
            <p className="text-xs font-medium text-emerald-700 mb-1">Key created — copy it now, it won&apos;t be shown again:</p>
            <code className="text-xs font-mono break-all">{revealedKey}</code>
            <button className="text-xs text-emerald-700 hover:underline ml-2" onClick={() => navigator.clipboard.writeText(revealedKey)}>Copy</button>
            <button className="text-xs text-muted-foreground hover:underline ml-2" onClick={() => setRevealedKey(null)}>Dismiss</button>
          </div>
        )}

        <div className="flex gap-2 mb-3">
          <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Key name" className="flex-1" />
          <select
            value={newKeyScope}
            onChange={(e) => setNewKeyScope(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="read_only">Read only</option>
            <option value="read_write">Read/Write</option>
            <option value="admin">Admin</option>
          </select>
          <Button size="sm" disabled={!newKeyName.trim() || createKey.isPending} onClick={() => createKey.mutate()}>
            Generate
          </Button>
        </div>

        {keys.length > 0 && (
          <div className="space-y-2">
            {keys.map((key) => (
              <div key={key.id} className="flex items-center gap-2 text-sm py-1.5 border-t border-border/50">
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{key.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground font-mono">{key.keyPrefix}…</span>
                  {key.isRevoked && <span className="ml-2 text-xs text-destructive">Revoked</span>}
                </div>
                <span className="text-xs text-muted-foreground">{key.scope}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{key.requestCount} req</span>
                {!key.isRevoked && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => revokeKey.mutate(key.id)}>Revoke</Button>
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

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-2">Add label</h3>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate()
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Label name" className="flex-1" />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 rounded border border-border cursor-pointer"
          />
          <Button size="sm" type="submit" disabled={!name.trim() || create.isPending}>Add</Button>
        </form>
      </Card>
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Workspace labels · {labels.data?.length ?? 0}</h3>
        </div>
        <ul className="divide-y divide-border">
          {(labels.data ?? []).map((l) => (
            <li key={l.id} className="px-4 py-2.5 flex items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: l.color }} />
              <span className="flex-1 text-sm">{l.name}</span>
              <button onClick={() => remove.mutate(l.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {labels.data?.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted-foreground text-center">No labels yet.</li>
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
        title="Weekly capacity in hours"
      />
      <span className="text-muted-foreground">h/wk</span>
    </div>
  )
}
