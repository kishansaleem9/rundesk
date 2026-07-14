import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Button,
  cn,
} from '@rundesk/ui'
import { Trash2, UserPlus, Globe, Lock, GitBranch } from 'lucide-react'
import { api } from '../lib/api'

type ContainerKind = 'space' | 'project'

const CONTAINER_ROLES = ['admin', 'edit', 'comment', 'view'] as const
type ContainerRole = (typeof CONTAINER_ROLES)[number]

const ROLE_LABEL: Record<ContainerRole, string> = {
  admin: 'Admin',
  edit: 'Can edit',
  comment: 'Can comment',
  view: 'Can view',
}

type Member = {
  userId: string
  role: ContainerRole
  email: string | null
  displayName: string | null
  avatarUrl: string | null
}
type WsMember = { userId: string; displayName: string; email: string }

function errMsg(err: unknown, fallback = 'Something went wrong') {
  return err instanceof Error ? err.message : fallback
}

function initials(name: string | null, email: string | null) {
  const src = (name || email || '?').trim()
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

export function ContainerMembersSheet({
  kind,
  containerId,
  workspaceId,
  open,
  onOpenChange,
  containerName,
  initialVisibility,
}: {
  kind: ContainerKind
  containerId: string
  workspaceId: string
  open: boolean
  onOpenChange: (next: boolean) => void
  containerName?: string
  /** space: 'public' | 'private'; project: 'public' | 'private' | null (inherit) */
  initialVisibility?: string | null
}) {
  const qc = useQueryClient()
  const base = kind === 'space' ? `/spaces/${containerId}` : `/projects/${containerId}`
  const membersKey = [`${kind}-members`, containerId] as const

  const membersQuery = useQuery({
    queryKey: membersKey,
    queryFn: () => api<Member[]>(`${base}/members`),
    enabled: open,
  })
  const wsMembersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WsMember[]>(`/workspaces/${workspaceId}/members`),
    enabled: open,
  })

  const [visibility, setVisibility] = useState<string | null>(
    initialVisibility ?? (kind === 'space' ? 'public' : null),
  )
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState<ContainerRole>('edit')
  const [busy, setBusy] = useState(false)

  // Reflect the latest known visibility whenever the sheet is (re)opened.
  useEffect(() => {
    if (open) setVisibility(initialVisibility ?? (kind === 'space' ? 'public' : null))
  }, [open, initialVisibility, kind])

  const members = membersQuery.data ?? []
  const memberIds = new Set(members.map((m) => m.userId))
  const candidates = (wsMembersQuery.data ?? []).filter((w) => !memberIds.has(w.userId))

  const refresh = () => qc.invalidateQueries({ queryKey: membersKey })

  const addMember = async () => {
    if (!addUserId) return
    setBusy(true)
    try {
      await api(`${base}/members`, { method: 'POST', body: { userId: addUserId, role: addRole } })
      setAddUserId('')
      await refresh()
    } catch (err) {
      window.alert(errMsg(err, 'Could not add member'))
    } finally {
      setBusy(false)
    }
  }

  const changeRole = async (userId: string, role: ContainerRole) => {
    setBusy(true)
    try {
      await api(`${base}/members/${userId}`, { method: 'PATCH', body: { role } })
      await refresh()
    } catch (err) {
      window.alert(errMsg(err, 'Could not update role'))
    } finally {
      setBusy(false)
    }
  }

  const removeMember = async (userId: string) => {
    if (!window.confirm('Remove this member from the ' + kind + '?')) return
    setBusy(true)
    try {
      await api(`${base}/members/${userId}`, { method: 'DELETE' })
      await refresh()
    } catch (err) {
      window.alert(errMsg(err, 'Could not remove member'))
    } finally {
      setBusy(false)
    }
  }

  const changeVisibility = async (next: string | null) => {
    const prev = visibility
    setVisibility(next)
    setBusy(true)
    try {
      await api(`${base}/visibility`, { method: 'PATCH', body: { visibility: next } })
    } catch (err) {
      setVisibility(prev)
      window.alert(errMsg(err, 'Could not change visibility'))
    } finally {
      setBusy(false)
    }
  }

  const visOptions: Array<{ value: string | null; label: string; icon: typeof Globe }> =
    kind === 'space'
      ? [
          { value: 'public', label: 'Public', icon: Globe },
          { value: 'private', label: 'Private', icon: Lock },
        ]
      : [
          { value: null, label: 'Inherit', icon: GitBranch },
          { value: 'public', label: 'Public', icon: Globe },
          { value: 'private', label: 'Private', icon: Lock },
        ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] max-w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Members</SheetTitle>
          <SheetDescription>
            Manage who can access {containerName ? `“${containerName}”` : `this ${kind}`} and their role.
          </SheetDescription>
        </SheetHeader>

        {/* Visibility */}
        <div className="mb-6">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Visibility
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visOptions.map((opt) => {
              const active = visibility === opt.value
              const Icon = opt.icon
              return (
                <button
                  key={String(opt.value)}
                  disabled={busy || active}
                  onClick={() => changeVisibility(opt.value)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors',
                    active
                      ? 'border-brand-500 bg-brand-500/10 text-foreground'
                      : 'border-border/80 text-muted-foreground hover:text-foreground hover:bg-accent/10',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {visibility === 'private'
              ? 'Only the members listed below can open this ' + kind + '.'
              : visibility === null
                ? 'Inherits access from the parent space.'
                : 'Everyone in the workspace can open this ' + kind + '.'}
          </p>
        </div>

        {/* Add member */}
        <div className="mb-6">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Add member
          </p>
          <div className="flex items-center gap-2">
            <select
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              className="h-9 flex-1 min-w-0 rounded-md border border-border/80 bg-background px-2 text-[13px]"
            >
              <option value="">Select a person…</option>
              {candidates.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.displayName || c.email}
                </option>
              ))}
            </select>
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as ContainerRole)}
              className="h-9 rounded-md border border-border/80 bg-background px-2 text-[13px]"
            >
              {CONTAINER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={addMember} disabled={!addUserId || busy}>
              <UserPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {wsMembersQuery.data && candidates.length === 0 && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Everyone in the workspace is already a member.
            </p>
          )}
        </div>

        {/* Member list */}
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </p>
          {membersQuery.isLoading ? (
            <p className="text-[13px] text-muted-foreground py-4">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-4">No members yet.</p>
          ) : (
            <ul className="space-y-1">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-accent/5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[11px] font-semibold text-brand-600 dark:text-brand-300 overflow-hidden">
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initials(m.displayName, m.email)
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-foreground">{m.displayName || m.email}</p>
                    {m.displayName && m.email && (
                      <p className="truncate text-[11px] text-muted-foreground">{m.email}</p>
                    )}
                  </div>
                  <select
                    value={m.role}
                    disabled={busy}
                    onChange={(e) => changeRole(m.userId, e.target.value as ContainerRole)}
                    className="h-8 rounded-md border border-border/80 bg-background px-1.5 text-[12px]"
                  >
                    {CONTAINER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeMember(m.userId)}
                    disabled={busy}
                    aria-label="Remove member"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
