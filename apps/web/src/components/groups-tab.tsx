import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Input, Label, toast, cn } from '@rundesk/ui'
import {
  Plus,
  Search,
  Trash2,
  Users,
  UserMinus,
  UserPlus,
  Save,
  Edit3,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { InlineSkeleton } from './loading-skeletons'

type Member = {
  userId: string
  email: string
  displayName: string
  avatarUrl?: string | null
  role: string
}

type GroupMember = {
  userId: string
  email: string
  displayName: string | null
  avatarUrl?: string | null
}

type WorkspaceGroup = {
  id: string
  name: string
  description: string | null
  externalId: string | null
  /** §A4.3 @-handle the team answers to in chat. */
  alias: string | null
  memberCount: number
  members: GroupMember[]
  createdAt: string
  updatedAt: string
}

export function GroupsTab({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [editingMeta, setEditingMeta] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftAlias, setDraftAlias] = useState('')

  const groupsQuery = useQuery({
    queryKey: ['workspace-groups', workspaceId, search],
    queryFn: () =>
      api<WorkspaceGroup[]>(
        `/workspaces/${workspaceId}/groups${search ? `?search=${encodeURIComponent(search)}` : ''}`,
        { method: 'GET' },
      ),
  })

  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<Member[]>(`/workspaces/${workspaceId}/members`, { method: 'GET' }),
  })

  const activeGroup = useMemo(
    () => groupsQuery.data?.find((g) => g.id === activeGroupId) ?? null,
    [groupsQuery.data, activeGroupId],
  )

  const create = useMutation({
    mutationFn: (name: string) =>
      api<WorkspaceGroup>(`/workspaces/${workspaceId}/groups`, {
        method: 'POST',
        body: { name },
      }),
    onSuccess: async (created) => {
      toast.success(t('groupsTab.groupCreated', { name: created.name }))
      setNewName('')
      await qc.invalidateQueries({ queryKey: ['workspace-groups', workspaceId] })
      setActiveGroupId(created.id)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('groupsTab.createFailed')),
  })

  const updateGroup = useMutation({
    mutationFn: ({
      groupId,
      patch,
    }: {
      groupId: string
      patch: { name?: string; description?: string | null; alias?: string | null }
    }) =>
      api<WorkspaceGroup>(`/workspaces/${workspaceId}/groups/${groupId}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: async () => {
      toast.success(t('groupsTab.groupUpdated'))
      setEditingMeta(false)
      await qc.invalidateQueries({ queryKey: ['workspace-groups', workspaceId] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('groupsTab.updateFailed')),
  })

  const removeGroup = useMutation({
    mutationFn: (groupId: string) =>
      api(`/workspaces/${workspaceId}/groups/${groupId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('groupsTab.groupDeleted'))
      setActiveGroupId(null)
      await qc.invalidateQueries({ queryKey: ['workspace-groups', workspaceId] })
    },
  })

  const addMembers = useMutation({
    mutationFn: ({ groupId, userIds }: { groupId: string; userIds: string[] }) =>
      api<WorkspaceGroup>(`/workspaces/${workspaceId}/groups/${groupId}/members`, {
        method: 'POST',
        body: { userIds },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['workspace-groups', workspaceId] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('groupsTab.addMemberFailed')),
  })

  const removeMember = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      api(`/workspaces/${workspaceId}/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['workspace-groups', workspaceId] })
    },
  })

  // When switching active group, prime the edit fields.
  const enterEditMode = (g: WorkspaceGroup) => {
    setDraftName(g.name)
    setDraftDescription(g.description ?? '')
    setDraftAlias(g.alias ?? '')
    setEditingMeta(true)
  }

  const groups = groupsQuery.data ?? []
  const allMembers = membersQuery.data ?? []

  return (
    <div className="space-y-4">
      <Card variant="glass" className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <Users className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold">{t('groupsTab.title')}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('groupsTab.subtitle')}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
        {/* List + create */}
        <Card variant="glass" className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('groupsTab.searchPlaceholder')}
              className="h-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('groupsTab.newGroupPlaceholder')}
              className="h-8"
            />
            <Button
              size="sm"
              variant="gradient"
              disabled={!newName.trim() || create.isPending}
              onClick={() => create.mutate(newName.trim())}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="space-y-1 max-h-[420px] overflow-auto">
            {groupsQuery.isLoading && (
              <p className="text-xs text-muted-foreground italic"><InlineSkeleton /></p>
            )}
            {groupsQuery.isSuccess && groups.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                {t('groupsTab.emptyList')}
              </p>
            )}
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  setActiveGroupId(g.id)
                  setEditingMeta(false)
                }}
                className={cn(
                  'w-full text-left rounded-md px-3 py-2 transition-colors',
                  g.id === activeGroupId
                    ? 'bg-accent/15 text-foreground'
                    : 'hover:bg-card/60 text-muted-foreground',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{g.name}</span>
                  <Badge variant="secondary" className="text-[9px]">
                    {g.memberCount}
                  </Badge>
                </div>
                {g.alias && (
                  <div className="text-[10px] font-mono text-accent mt-0.5 truncate">@{g.alias}</div>
                )}
                {g.externalId && (
                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                    SCIM · {g.externalId}
                  </div>
                )}
              </button>
            ))}
          </div>
        </Card>

        {/* Active group editor */}
        <Card variant="glass" className="p-5 min-h-[420px]">
          {!activeGroup ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('groupsTab.emptyEditor')}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                {editingMeta ? (
                  <div className="flex-1 space-y-2">
                    <div>
                      <Label className="text-xs">{t('groupsTab.groupName')}</Label>
                      <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">{t('groupsTab.descriptionOptional')}</Label>
                      <Input
                        value={draftDescription}
                        onChange={(e) => setDraftDescription(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t('groupsTab.mentionHandle')}</Label>
                      <Input
                        value={draftAlias}
                        onChange={(e) => setDraftAlias(e.target.value)}
                        placeholder={t('groupsTab.mentionHandlePlaceholder')}
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {t('groupsTab.mentionHandleHint')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1">
                    <h4 className="font-display text-xl font-semibold">{activeGroup.name}</h4>
                    {activeGroup.alias && (
                      <p className="text-xs font-mono text-accent mt-1">@{activeGroup.alias}</p>
                    )}
                    {activeGroup.description && (
                      <p className="text-sm text-muted-foreground mt-1">{activeGroup.description}</p>
                    )}
                    {activeGroup.externalId && (
                      <p className="text-[10px] text-muted-foreground font-mono mt-1">
                        {t('groupsTab.syncedFromIdp', { id: activeGroup.externalId })}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  {editingMeta ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        updateGroup.mutate({
                          groupId: activeGroup.id,
                          patch: {
                            name: draftName,
                            description: draftDescription || null,
                            alias: draftAlias.trim() || null,
                          },
                        })
                      }
                      disabled={updateGroup.isPending || !draftName.trim()}
                    >
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => enterEditMode(activeGroup)}>
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(t('groupsTab.confirmDelete', { name: activeGroup.name }))) {
                        removeGroup.mutate(activeGroup.id)
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </div>
              </div>

              <GroupMemberManager
                allMembers={allMembers}
                currentMembers={activeGroup.members}
                onAdd={(userIds) =>
                  addMembers.mutate({ groupId: activeGroup.id, userIds })
                }
                onRemove={(userId) =>
                  removeMember.mutate({ groupId: activeGroup.id, userId })
                }
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function GroupMemberManager({
  allMembers,
  currentMembers,
  onAdd,
  onRemove,
}: {
  allMembers: Member[]
  currentMembers: GroupMember[]
  onAdd: (userIds: string[]) => void
  onRemove: (userId: string) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const memberIdSet = useMemo(() => new Set(currentMembers.map((m) => m.userId)), [currentMembers])

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allMembers.filter((m) => {
      if (memberIdSet.has(m.userId)) return false
      if (!q) return true
      return (
        m.email.toLowerCase().includes(q) ||
        (m.displayName ?? '').toLowerCase().includes(q)
      )
    })
  }, [allMembers, memberIdSet, query])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Current members */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs uppercase tracking-wider">
            {t('groupsTab.membersCount', { count: currentMembers.length })}
          </Label>
        </div>
        <div className="rounded-md border border-border/40 bg-card/40 divide-y divide-border/40 max-h-[280px] overflow-auto">
          {currentMembers.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground italic">{t('groupsTab.noMembers')}</p>
          ) : (
            currentMembers.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar email={m.email} displayName={m.displayName} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {m.displayName ?? m.email}
                    </div>
                    {m.displayName && (
                      <div className="text-[10px] text-muted-foreground truncate">{m.email}</div>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemove(m.userId)}
                  aria-label={t('groupsTab.removeFromGroup')}
                >
                  <UserMinus className="h-3.5 w-3.5 text-red-400" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add members */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs uppercase tracking-wider">{t('groupsTab.addMembers')}</Label>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('groupsTab.searchMembersPlaceholder')}
          className="h-8 mb-2"
        />
        <div className="rounded-md border border-border/40 bg-card/40 divide-y divide-border/40 max-h-[280px] overflow-auto">
          {candidates.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground italic">
              {t('groupsTab.noMoreMembers')}
            </p>
          ) : (
            candidates.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar email={m.email} displayName={m.displayName} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{m.displayName}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{m.email}</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onAdd([m.userId])}
                  aria-label={t('groupsTab.addToGroup')}
                >
                  <UserPlus className="h-3.5 w-3.5 text-emerald-400" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function Avatar({ email, displayName }: { email: string; displayName: string | null }) {
  const initial = (displayName ?? email).slice(0, 1).toUpperCase()
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-[11px] font-semibold text-white">
      {initial}
    </span>
  )
}
