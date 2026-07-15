import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Checkbox, Input, Label, Textarea, toast, cn } from '@rundesk/ui'
import { Plus, Trash2, Shield, Save, X, Lock, UserPlus, UserMinus } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

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

type TFunc = (key: TranslationKey, vars?: Record<string, string | number>) => string

// The role editor's permission catalog arrives from the API with English
// label/description/category text. We map each stable permission `key`,
// category name, and legacy role identifier to an i18n catalog entry for
// display, falling back to the server text (or a humanized raw id) for any id
// not covered here. The raw `key` remains the value persisted to the API.
const PERMISSION_LABEL_KEYS: Record<string, TranslationKey> = {
  'workspace.manage': 'rolesTab.perm.workspaceManage',
  'workspace.billing': 'rolesTab.perm.workspaceBilling',
  'workspace.delete': 'rolesTab.perm.workspaceDelete',
  'workspace.audit.view': 'rolesTab.perm.workspaceAuditView',
  'members.invite': 'rolesTab.perm.membersInvite',
  'members.remove': 'rolesTab.perm.membersRemove',
  'members.role.change': 'rolesTab.perm.membersRoleChange',
  'roles.manage': 'rolesTab.perm.rolesManage',
  'integrations.manage': 'rolesTab.perm.integrationsManage',
  'integrations.access_requests.manage': 'rolesTab.perm.integrationsAccessRequestsManage',
  'sso.manage': 'rolesTab.perm.ssoManage',
  'security.policy.manage': 'rolesTab.perm.securityPolicyManage',
  'space.create': 'rolesTab.perm.spaceCreate',
  'project.create': 'rolesTab.perm.projectCreate',
  'space.delete': 'rolesTab.perm.spaceDelete',
  'project.delete': 'rolesTab.perm.projectDelete',
  'list.delete': 'rolesTab.perm.listDelete',
  'task.delete.any': 'rolesTab.perm.taskDeleteAny',
  'doc.publish': 'rolesTab.perm.docPublish',
  'doc.delete.any': 'rolesTab.perm.docDeleteAny',
  'automation.manage': 'rolesTab.perm.automationManage',
  'webhook.manage': 'rolesTab.perm.webhookManage',
  'template.manage': 'rolesTab.perm.templateManage',
  'report.view.basic': 'rolesTab.perm.reportViewBasic',
  'report.export': 'rolesTab.perm.reportExport',
  'time.approval.manage': 'rolesTab.perm.timeApprovalManage',
}

const PERMISSION_DESC_KEYS: Record<string, TranslationKey> = {
  'workspace.manage': 'rolesTab.permDesc.workspaceManage',
  'workspace.billing': 'rolesTab.permDesc.workspaceBilling',
  'workspace.delete': 'rolesTab.permDesc.workspaceDelete',
  'workspace.audit.view': 'rolesTab.permDesc.workspaceAuditView',
  'members.invite': 'rolesTab.permDesc.membersInvite',
  'members.remove': 'rolesTab.permDesc.membersRemove',
  'members.role.change': 'rolesTab.permDesc.membersRoleChange',
  'roles.manage': 'rolesTab.permDesc.rolesManage',
  'integrations.manage': 'rolesTab.permDesc.integrationsManage',
  'integrations.access_requests.manage': 'rolesTab.permDesc.integrationsAccessRequestsManage',
  'sso.manage': 'rolesTab.permDesc.ssoManage',
  'security.policy.manage': 'rolesTab.permDesc.securityPolicyManage',
  'space.create': 'rolesTab.permDesc.spaceCreate',
  'project.create': 'rolesTab.permDesc.projectCreate',
  'space.delete': 'rolesTab.permDesc.spaceDelete',
  'project.delete': 'rolesTab.permDesc.projectDelete',
  'list.delete': 'rolesTab.permDesc.listDelete',
  'task.delete.any': 'rolesTab.permDesc.taskDeleteAny',
  'doc.publish': 'rolesTab.permDesc.docPublish',
  'doc.delete.any': 'rolesTab.permDesc.docDeleteAny',
  'automation.manage': 'rolesTab.permDesc.automationManage',
  'webhook.manage': 'rolesTab.permDesc.webhookManage',
  'template.manage': 'rolesTab.permDesc.templateManage',
  'report.view.basic': 'rolesTab.permDesc.reportViewBasic',
  'report.export': 'rolesTab.permDesc.reportExport',
  'time.approval.manage': 'rolesTab.permDesc.timeApprovalManage',
}

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  Workspace: 'rolesTab.category.workspace',
  Members: 'rolesTab.category.members',
  Integrations: 'rolesTab.category.integrations',
  Security: 'rolesTab.category.security',
  Content: 'rolesTab.category.content',
  Automation: 'rolesTab.category.automation',
  Reporting: 'rolesTab.category.reporting',
}

const ROLE_NAME_KEYS: Record<string, TranslationKey> = {
  super_admin: 'rolesTab.roleName.superAdmin',
  workspace_admin: 'rolesTab.roleName.workspaceAdmin',
  admin: 'rolesTab.roleName.admin',
  manager: 'rolesTab.roleName.manager',
  member: 'rolesTab.roleName.member',
  guest: 'rolesTab.roleName.guest',
}

function humanizeId(raw: string): string {
  const s = raw.replace(/[._]/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function permLabel(t: TFunc, p: PermissionDef): string {
  const key = PERMISSION_LABEL_KEYS[p.key]
  return key ? t(key) : p.label || humanizeId(p.key)
}
function permDescription(t: TFunc, p: PermissionDef): string {
  const key = PERMISSION_DESC_KEYS[p.key]
  return key ? t(key) : p.description || ''
}
function categoryLabel(t: TFunc, category: string): string {
  const key = CATEGORY_LABEL_KEYS[category]
  return key ? t(key) : humanizeId(category)
}
function roleLabel(t: TFunc, role: string): string {
  const key = ROLE_NAME_KEYS[role]
  return key ? t(key) : humanizeId(role)
}

export function RolesTab({ workspaceId }: { workspaceId: string }) {
  const { t, tCount } = useTranslation()
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
              {t('rolesTab.customRoles')}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreating(true)
                setActiveRoleId(null)
              }}
              title={t('rolesTab.newRole')}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-[640px] overflow-auto">
            {rolesQuery.isLoading && (
              <div className="p-4 text-xs text-muted-foreground">{t('common.loading')}</div>
            )}
            {rolesQuery.data?.length === 0 && !creating && (
              <div className="p-4 text-xs text-muted-foreground">
                {t('rolesTab.emptyList')}
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
                        {tCount('rolesTab.permissionCount', role.permissions.length)}
                        {' · '}
                        {tCount('rolesTab.memberCount', role.memberCount)}
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
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center text-center py-12">
      <Shield className="h-10 w-10 text-muted-foreground/40 mb-3" />
      <h3 className="text-sm font-medium mb-1">{t('rolesTab.emptyHintTitle')}</h3>
      <p className="text-xs text-muted-foreground max-w-sm">
        {t('rolesTab.emptyHintBody')}
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
  const { t } = useTranslation()
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
      toast.success(role ? t('rolesTab.roleSaved') : t('rolesTab.roleCreated'))
      onSaved(saved)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('rolesTab.saveFailed'))
    },
  })

  const remove = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/roles/${role!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('rolesTab.roleDeleted'))
      onDeleted?.()
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('rolesTab.deleteFailed'))
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
            <Label>{t('rolesTab.name')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('rolesTab.namePlaceholder')}
              disabled={locked}
            />
          </div>
          <div>
            <Label>{t('rolesTab.descriptionOptional')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('rolesTab.descriptionPlaceholder')}
              rows={2}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t('rolesTab.color')}</Label>
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
          <Label>{t('rolesTab.permissions')}</Label>
          <span className="text-xs text-muted-foreground">
            {t('rolesTab.selectedCount', { count: permissions.size })}
          </span>
        </div>
        <div className="space-y-3 max-h-[400px] overflow-auto pr-1">
          {catalog.map(([category, perms]) => {
            const allSelected = perms.every((p) => permissions.has(p.key))
            return (
              <div key={category} className="rounded-md border border-border/50 bg-card/40">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
                  <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
                    {categoryLabel(t, category)}
                  </span>
                  <button
                    onClick={() => toggleCategory(perms)}
                    className="text-xs text-accent hover:underline"
                  >
                    {allSelected ? t('rolesTab.clearAll') : t('rolesTab.selectAll')}
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
                        <div className="text-sm font-medium">{permLabel(t, p)}</div>
                        <div className="text-xs text-muted-foreground">{permDescription(t, p)}</div>
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
                if (window.confirm(t('rolesTab.confirmDelete', { name: role.name }))) remove.mutate()
              }}
              disabled={remove.isPending}
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {t('common.delete')}
            </Button>
          )}
          {locked && (
            <Badge variant="secondary" className="text-[10px]">
              <Lock className="h-3 w-3 mr-1" />
              {t('rolesTab.builtIn')}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X className="h-3.5 w-3.5 mr-1.5" />
              {t('common.cancel')}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={!name.trim() || save.isPending}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {save.isPending ? t('common.saving') : role ? t('rolesTab.saveChanges') : t('rolesTab.createRole')}
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
  const { t } = useTranslation()
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
      toast.success(t('rolesTab.roleAssigned'))
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
      toast.success(t('rolesTab.roleRemoved'))
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
          {t('rolesTab.assignToMembers')}
          <Badge variant="secondary" className="text-[10px]">
            {role.memberCount}
          </Badge>
        </span>
        <span className="text-xs text-muted-foreground">
          {expanded ? t('rolesTab.hide') : t('rolesTab.show')}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border/40 divide-y divide-border/40 max-h-72 overflow-auto">
          {membersQuery.isLoading || assigneesQuery.isLoading ? (
            <div className="p-4 text-xs text-muted-foreground">{t('rolesTab.loadingMembers')}</div>
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
                      {m.email} · {roleLabel(t, m.role)}
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
                          {t('rolesTab.remove')}
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                          {t('rolesTab.assign')}
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
