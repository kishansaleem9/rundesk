import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, Label, cn } from '@rundesk/ui'
import { Building2, Users, Plug, Shield, Tag, Trash2, UserPlus } from 'lucide-react'
import { api, ApiError } from '../lib/api'

export const Route = createFileRoute('/app/$workspaceId/settings')({
  component: SettingsPage,
})

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
  joinedAt: string
}

const ROLES = [
  { value: 'workspace_admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Member' },
  { value: 'guest', label: 'Guest' },
]

const TABS = [
  { id: 'general', label: 'General', icon: Building2 },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'labels', label: 'Labels', icon: Tag },
] as const

function SettingsPage() {
  const { workspaceId } = Route.useParams()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('general')

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">Workspace</div>
        <h1 className="font-display text-2xl font-semibold text-brand-900">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your workspace name, members, integrations, and security policies.
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto grid grid-cols-[200px_1fr] gap-8">
          <nav className="space-y-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  tab === t.id ? 'bg-brand-200/50 text-brand-900 font-medium' : 'hover:bg-surface-50 text-muted-foreground',
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </nav>

          <div>
            {tab === 'general' && <GeneralTab workspaceId={workspaceId} />}
            {tab === 'members' && <MembersTab workspaceId={workspaceId} />}
            {tab === 'integrations' && <IntegrationsTab />}
            {tab === 'security' && <SecurityTab />}
            {tab === 'labels' && <LabelsTab workspaceId={workspaceId} />}
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
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')

  const invite = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      }),
    onSuccess: () => {
      setInviteEmail('')
      qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
    },
  })
  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api(`/workspaces/${workspaceId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] }),
  })
  const remove = useMutation({
    mutationFn: (userId: string) =>
      api(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] }),
  })

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="font-semibold text-sm mb-2 flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Invite a member
        </h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (inviteEmail.includes('@')) invite.mutate()
          }}
        >
          <Input
            placeholder="email@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1"
            type="email"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="px-2 rounded-md border border-border bg-card text-sm"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <Button size="sm" type="submit" disabled={!inviteEmail.includes('@') || invite.isPending}>
            {invite.isPending ? 'Adding…' : 'Add'}
          </Button>
        </form>
        {invite.error instanceof ApiError && (
          <p className="text-xs text-destructive mt-2">{invite.error.message}</p>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          User must already have a Rundesk account. Email-based invitations with auto-account-creation are coming soon.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm">Members · {membersQuery.data?.length ?? 0}</h2>
        </div>
        <ul className="divide-y divide-border">
          {(membersQuery.data ?? []).map((m) => (
            <li key={m.userId} className="px-4 py-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-brand-300 text-brand-900 flex items-center justify-center text-sm font-semibold">
                {m.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.displayName}</div>
                <div className="text-xs text-muted-foreground truncate">{m.email}</div>
              </div>
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

function IntegrationsTab() {
  const items = [
    { name: 'Slack', desc: 'Mirror notifications and post task updates to channels.', status: 'available' },
    { name: 'Google Calendar', desc: 'Sync task due dates with calendars.', status: 'available' },
    { name: 'Google Drive', desc: 'Attach Drive files to tasks.', status: 'available' },
    { name: 'Webhooks', desc: 'Send outbound events to your own URLs.', status: 'available' },
    { name: 'GitHub / GitLab', desc: 'Link commits & PRs to tasks via task ID.', status: 'planned' },
    { name: 'ClickUp Import', desc: 'One-click migration from ClickUp.', status: 'planned' },
  ]
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map((i) => (
        <Card key={i.name} className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-sm">{i.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{i.desc}</p>
            </div>
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider',
              i.status === 'available' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground',
            )}>
              {i.status}
            </span>
          </div>
          <Button size="sm" variant="outline" className="mt-3 w-full" disabled>
            {i.status === 'available' ? 'Connect (UI coming)' : 'Coming soon'}
          </Button>
        </Card>
      ))}
    </div>
  )
}

function SecurityTab() {
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-1">Require 2FA for all members</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Members will be prompted to enroll a TOTP authenticator on next login.
        </p>
        <Button size="sm" variant="outline" disabled>Enable (coming soon)</Button>
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-1">IP allowlist</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Restrict workspace access to specific IP ranges.
        </p>
        <Button size="sm" variant="outline" disabled>Configure (coming soon)</Button>
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-1">Session timeout</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Force re-login after a period of inactivity.
        </p>
        <Button size="sm" variant="outline" disabled>Configure (coming soon)</Button>
      </Card>
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
