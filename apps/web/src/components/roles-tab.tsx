import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Checkbox, Input, Label, Textarea, toast, cn } from '@rundesk/ui'
import { Plus, Trash2, Shield, Save, X, Lock, UserPlus, UserMinus } from 'lucide-react'
import { api, ApiError } from '../lib/api'

type PermissionDef = {
  key: string
  label: string
  description: string
  category: string
}

type RoleView = {
  id: string
  workspaceId: string
  name: string
  description: string | null
  color: string
  isLocked: boolean
  position: number
  permissions: string[]
  memberCount: number
  createdAt: string
  updatedAt: string
}

type Member = {
  userId: string
  email: string
  displayName: string
  avatarUrl?: string | null
  role: string
}

type MemberWithMeta = Member & { workspaceMemberId?: string }

const DEFAULT_COLOR = '#64748b'

export function RolesTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()

  const catalogQuery = useQuery({
    queryKey: ['workspace-roles-catalog', workspaceId],
    queryFn: () =>
      api<{ permissions: PermissionDef[] }>(`/workspaces/${workspaceId}/roles/catalog`),
  })

  const rolesQuery = useQuery({
    queryKey: ['workspace-roles', workspaceId],
    queryFn: () => api<RoleView[]>(`/workspaces/${workspaceId}/roles`),
  })

  const [activeRoleId, setActiveRoleId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const activeRole = useMemo(
    () => rolesQuery.data?.find((r) => r.id === activeRoleId) ?? null,
    [rolesQuery.data, activeRoleId],
  )

  const grouped = useMemo(() => {
    const groups = new Map<string, PermissionDef[]>()
    for (const p of catalogQuery.data?.permissions ?? []) {
      const list = groups.get(p.category) ?? []
      list.push(p)
      groups.set(p.category, list)
    }
    return Array.from(groups.entries())
  }, [catalogQuery.data])

  return (
    <Card className="p-0 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr]">
        <aside className="border-r border-border/40 bg-card/40">
          <div className="p-4 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Custom roles
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreating(true)
                setActiveRoleId(null)
              }}
              title="New role"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-[640px] overflow-auto">
            {rolesQuery.isLoading && (
              <div className="p-4 text-xs text-muted-foreground">Loading…</div>
            )}
            {rolesQuery.data?.length === 0 && !creating && (
              <div className="p-4 text-xs text-muted-foreground">
                No custom roles yet. Click + to create one.
              </div>
            )}
            <ul className="divide-y divide-border/40">
              {rolesQuery.data?.map((role) => (
                <li key={role.id}>
                  <button
                    onClick={() => {
                      setActiveRoleId(role.id)
                      setCreating(false)
                    }}
                    className={cn(
                      'w-full flex items-start gap-2.5 px-4 py-3 text-left transition-colors',
                      activeRoleId === role.id
                        ? 'bg-accent/15'
                        : 'hover:bg-card/80',
                    )}
                  >
                    <span
                      className="mt-1 h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: role.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium truncate">
                        {role.name}
                        {role.isLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5">
                        {role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}
                        {' · '}
                        {role.memberCount} member{role.memberCount === 1 ? '' : 's'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="p-6 min-h-[480px]">
          {creating ? (
            <RoleEditor
              workspaceId={workspaceId}
              catalog={grouped}
              onSaved={(role) => {
                setCreating(false)
                setActiveRoleId(role.id)
                qc.invalidateQueries({ queryKey: ['workspace-roles', workspaceId] })
              }}
              onCancel={() => setCreating(false)}
            />
          ) : activeRole ? (
            <RoleEditor
              key={activeRole.id}
              workspaceId={workspaceId}
              catalog={grouped}
              role={activeRole}
              onSaved={() =>
                qc.invalidateQueries({ queryKey: ['workspace-roles', workspaceId] })
              }
              onDeleted={() => {
                setActiveRoleId(null)
                qc.invalidateQueries({ queryKey: ['workspace-roles', workspaceId] })
              }}
            />
          ) : (
            <EmptyHint />
          )}
        </section>
      </div>
    </Card>
  )
}

function EmptyHint() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12">
      <Shield className="h-10 w-10 text-muted-foreground/40 mb-3" />
      <h3 className="text-sm font-medium mb-1">Pick a role to edit</h3>
      <p className="text-xs text-muted-foreground max-w-sm">
        Custom roles let you grant fine-grained capabilities on top of a
        member’s legacy workspace role. Built-in roles (Admin, Manager,
        Member, Guest) still apply — custom roles are additive.
      </p>
    </div>
  )
}

function RoleEditor({
  workspaceId,
  catalog,
  role,
  onSaved,
  onCancel,
  onDeleted,
}: {
  workspaceId: string
  catalog: [string, PermissionDef[]][]
  role?: RoleView
  onSaved: (role: RoleView) => void
  onCancel?: () => void
  onDeleted?: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [color, setColor] = useState(role?.color ?? DEFAULT_COLOR)
  const [permissions, setPermissions] = useState<Set<string>>(
    new Set(role?.permissions ?? []),
  )

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        color,
        permissions: Array.from(permissions),
      }
      if (role) {
        return api<RoleView>(`/workspaces/${workspaceId}/roles/${role.id}`, {
          method: 'PATCH',
          body,
        })
      }
      return api<RoleView>(`/workspaces/${workspaceId}/roles`, {
        method: 'POST',
        body,
      })
    },
    onSuccess: (saved) => {
      toast.success(role ? 'Role saved' : 'Role created')
      onSaved(saved)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save role')
    },
  })

  const remove = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/roles/${role!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Role deleted')
      onDeleted?.()
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete role')
    },
  })

  const togglePerm = (key: string) => {
    setPermissions((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleCategory = (perms: PermissionDef[]) => {
    setPermissions((prev) => {
      const next = new Set(prev)
      const allSelected = perms.every((p) => next.has(p.key))
      for (const p of perms) {
        if (allSelected) next.delete(p.key)
        else next.add(p.key)
      }
      return next
    })
  }

  const locked = role?.isLocked ?? false

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Project Lead"
              disabled={locked}
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this role do?"
              rows={2}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Color</Label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-16 rounded border border-border bg-transparent cursor-pointer"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Label>Permissions</Label>
          <span className="text-xs text-muted-foreground">
            {permissions.size} selected
          </span>
        </div>
        <div className="space-y-3 max-h-[400px] overflow-auto pr-1">
          {catalog.map(([category, perms]) => {
            const allSelected = perms.every((p) => permissions.has(p.key))
            const someSelected = perms.some((p) => permissions.has(p.key))
            return (
              <div key={category} className="rounded-md border border-border/50 bg-card/40">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
                  <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
                    {category}
                  </span>
                  <button
                    onClick={() => toggleCategory(perms)}
                    className="text-xs text-accent hover:underline"
                  >
                    {allSelected ? 'Clear all' : someSelected ? 'Select all' : 'Select all'}
                  </button>
                </div>
                <ul className="divide-y divide-border/40">
                  {perms.map((p) => (
                    <li key={p.key} className="flex items-start gap-3 px-3 py-2.5">
                      <Checkbox
                        checked={permissions.has(p.key)}
                        onCheckedChange={() => togglePerm(p.key)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{p.label}</div>
                        <div className="text-xs text-muted-foreground">{p.description}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border/40">
        <div className="flex items-center gap-2">
          {role && !locked && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.confirm(`Delete role "${role.name}"?`)) remove.mutate()
              }}
              disabled={remove.isPending}
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          )}
          {locked && (
            <Badge variant="secondary" className="text-[10px]">
              <Lock className="h-3 w-3 mr-1" />
              Built-in
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X className="h-3.5 w-3.5 mr-1.5" />
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={!name.trim() || save.isPending}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {save.isPending ? 'Saving…' : role ? 'Save changes' : 'Create role'}
          </Button>
        </div>
      </div>

      {role && <MemberAssignmentPanel workspaceId={workspaceId} role={role} />}
    </div>
  )
}

function MemberAssignmentPanel({
  workspaceId,
  role,
}: {
  workspaceId: string
  role: RoleView
}) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const membersQuery = useQuery({
    queryKey: ['workspace-members-with-id', workspaceId],
    queryFn: () => api<MemberWithMeta[]>(`/workspaces/${workspaceId}/members`),
  })

  const assigneesQuery = useQuery({
    queryKey: ['workspace-role-assignees', workspaceId, role.id],
    queryFn: () =>
      api<{ workspaceMemberIds: string[] }>(
        `/workspaces/${workspaceId}/roles/${role.id}/assignees`,
      ),
    enabled: expanded,
  })

  const assign = useMutation({
    mutationFn: (workspaceMemberId: string) =>
      api(
        `/workspaces/${workspaceId}/members/${workspaceMemberId}/roles/${role.id}`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      toast.success('Role assigned')
      qc.invalidateQueries({ queryKey: ['workspace-role-assignees', workspaceId, role.id] })
      qc.invalidateQueries({ queryKey: ['workspace-roles', workspaceId] })
    },
  })
  const unassign = useMutation({
    mutationFn: (workspaceMemberId: string) =>
      api(
        `/workspaces/${workspaceId}/members/${workspaceMemberId}/roles/${role.id}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      toast.success('Role removed')
      qc.invalidateQueries({ queryKey: ['workspace-role-assignees', workspaceId, role.id] })
      qc.invalidateQueries({ queryKey: ['workspace-roles', workspaceId] })
    },
  })

  const assignedIds = useMemo(
    () => new Set(assigneesQuery.data?.workspaceMemberIds ?? []),
    [assigneesQuery.data],
  )
  const hasRole = (memberId: string | null) =>
    !!memberId && assignedIds.has(memberId)

  return (
    <div className="rounded-md border border-border/50 bg-card/40">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm"
      >
        <span className="flex items-center gap-2 font-medium">
          <UserPlus className="h-4 w-4 text-muted-foreground" />
          Assign to members
          <Badge variant="secondary" className="text-[10px]">
            {role.memberCount}
          </Badge>
        </span>
        <span className="text-xs text-muted-foreground">
          {expanded ? 'Hide' : 'Show'}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border/40 divide-y divide-border/40 max-h-72 overflow-auto">
          {membersQuery.isLoading || assigneesQuery.isLoading ? (
            <div className="p-4 text-xs text-muted-foreground">Loading members…</div>
          ) : (
            (membersQuery.data ?? []).map((m) => {
              const assigned = hasRole(m.workspaceMemberId ?? null)
              return (
                <div key={m.userId} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {m.displayName || m.email}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {m.email} · {m.role}
                    </div>
                  </div>
                  {m.workspaceMemberId && (
                    <Button
                      size="sm"
                      variant={assigned ? 'ghost' : 'secondary'}
                      onClick={() =>
                        assigned
                          ? unassign.mutate(m.workspaceMemberId!)
                          : assign.mutate(m.workspaceMemberId!)
                      }
                      disabled={assign.isPending || unassign.isPending}
                    >
                      {assigned ? (
                        <>
                          <UserMinus className="h-3.5 w-3.5 mr-1.5" />
                          Remove
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                          Assign
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
