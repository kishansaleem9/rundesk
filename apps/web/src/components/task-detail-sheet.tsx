import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Badge,
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
  cn,
} from '@rundesk/ui'
import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { getRealtimeSocket } from '../lib/realtime'
import { SaveAsTemplateButton } from './task-templates-section'

type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'cancelled'

type UserLite = { id: string; displayName?: string | null; email?: string | null }
type WorkspaceMemberLite = { userId: string; displayName: string; email: string }
type MentionTaskLite = { id: string; title: string; projectName?: string; listName?: string }
type MentionDocLite = { id: string; title: string; updatedAt?: string }

type Subtask = {
  id: string
  title: string
  priority: TaskPriority
  status: TaskStatus
  isArchived?: boolean
}

type TaskPickerItem = {
  id: string
  title: string
  listName?: string
  projectName?: string
}

type ChecklistItem = { id: string; content: string; isDone: boolean; dueDate?: string | null }
type Checklist = { id: string; title: string; items: ChecklistItem[] }

type Watcher = {
  userId: string
  user?: UserLite | null
}

type Dependency = {
  dep: { id: string; type: 'blocks' | 'blocked_by' | 'related_to'; relatedTaskId: string }
  related: { id: string; title: string; status: TaskStatus; priority: TaskPriority }
}

type Attachment = {
  id: string
  fileName: string
  fileSize?: number | null
  mimeType?: string | null
  uploadedBy?: string | null
  createdAt?: string | null
  url?: string | null
}

type TaskDetail = {
  id: string
  listId: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate?: string | null
  startDate?: string | null
  labels: Array<{ id: string; name: string; color: string }>
  assignees?: Array<{ user: UserLite }>
  subtasks?: Subtask[]
  checklists: Checklist[]
  watchers?: Watcher[]
  dependencies?: Dependency[]
  attachments?: Attachment[]
}

type TaskComment = {
  id: string
  body: string
  createdAt: string
  parentCommentId?: string | null
  assignedToUserId?: string | null
  resolvedByUserId?: string | null
  resolvedAt?: string | null
  author?: UserLite | null
  assignee?: UserLite | null
  resolver?: UserLite | null
  reactions?: Array<{ emoji: string; userId: string }>
}

type ActivityEntry = {
  id: string
  action: string
  createdAt: string
  actor?: UserLite | null
}

type TimeEntry = {
  id: string
  startedAt: string
  endedAt: string | null
  description?: string | null
  duration?: number | null
  user?: UserLite | null
}

type TabKey =
  | 'overview'
  | 'subtasks'
  | 'checklists'
  | 'watchers'
  | 'dependencies'
  | 'attachments'
  | 'comments'
  | 'activity'
  | 'time'
  | 'fields'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'fields', label: 'Fields' },
  { key: 'subtasks', label: 'Subtasks' },
  { key: 'checklists', label: 'Checklists' },
  { key: 'watchers', label: 'Watchers' },
  { key: 'dependencies', label: 'Dependencies' },
  { key: 'attachments', label: 'Attachments' },
  { key: 'comments', label: 'Comments' },
  { key: 'activity', label: 'Activity' },
  { key: 'time', label: 'Time' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNotWired(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 404 || err.status === 405 || err.status === 501
  }
  return true
}

function NotWiredNote({ children }: { children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      {children ?? 'Not wired yet — backend endpoint pending.'}
    </div>
  )
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-10 px-4 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** Build a short, human-readable task ref from a UUID — first 4 hex chars uppercased. */
function shortId(uuid: string): string {
  return uuid.replace(/[^a-f0-9]/gi, '').slice(0, 4).toUpperCase()
}

function priorityColor(p: TaskPriority | undefined): string {
  switch (p) {
    case 'urgent':
      return 'bg-red-100 text-red-700 border-red-200'
    case 'high':
      return 'bg-orange-100 text-orange-700 border-orange-200'
    case 'normal':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'low':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

function formatBytes(bytes?: number | null): string {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function prettifyMentions(body: string, namesById: Record<string, string>): string {
  let next = body
  next = next.replace(/@\[(?<id>[0-9a-fA-F-]{36})\]/g, (_, id: string) => `@${namesById[id] ?? 'teammate'}`)
  next = next.replace(/<@(?<id>[0-9a-fA-F-]{36})>/g, (_, id: string) => `@${namesById[id] ?? 'teammate'}`)
  return next
}

function formatDuration(ms?: number | null): string {
  if (!ms) return '—'
  const seconds = Math.floor(ms / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function TaskDetailSheet({
  taskId,
  open,
  onOpenChange,
  workspaceId,
}: {
  taskId: string | null
  open: boolean
  onOpenChange: (next: boolean) => void
  workspaceId?: string
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const qc = useQueryClient()
  const navigate = useNavigate()
  const fallbackWorkspaceId = useMemo(() => {
    if (workspaceId) return workspaceId
    if (typeof window === 'undefined') return undefined
    const parts = window.location.pathname.split('/')
    const appIdx = parts.findIndex((p) => p === 'app')
    if (appIdx >= 0 && parts[appIdx + 1]) return parts[appIdx + 1]
    return undefined
  }, [workspaceId])

  const enabled = Boolean(taskId && open)
  const detailQuery = useQuery({
    enabled,
    queryKey: ['task', taskId],
    queryFn: () => api<TaskDetail>(`/tasks/${taskId}`),
  })

  useEffect(() => {
    if (!enabled || !taskId) return
    const socket = getRealtimeSocket()
    socket.emit('subscribe', { rooms: [`task:${taskId}`] })
    const onEvent = (event: { type: string; taskId?: string }) => {
      if (event.taskId !== taskId) return
      void qc.invalidateQueries({ queryKey: ['task', taskId] })
      if (event.type.startsWith('comment.') || event.type === 'activity.created') {
        void qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
        void qc.invalidateQueries({ queryKey: ['task', taskId, 'activity'] })
      }
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
      socket.emit('unsubscribe', { rooms: [`task:${taskId}`] })
    }
  }, [enabled, taskId, qc])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl w-full overflow-y-auto">
        {!taskId ? null : detailQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading task…</p>
        ) : detailQuery.data ? (
          <>
            {/* Cover band — gradient placeholder; replace with real image when available */}
            <div
              className="-mx-6 -mt-6 mb-4 h-24 bg-brand-gradient relative overflow-hidden rounded-t-md"
              aria-hidden
            >
              <div className="absolute inset-0 bg-grid-dim opacity-40" />
              <div className="absolute -bottom-12 -right-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            </div>

            <SheetHeader className="pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="soft" className="font-mono text-[10px] tracking-wider uppercase">
                  RD-{shortId(detailQuery.data.id)}
                </Badge>
                {detailQuery.data.dueDate && (
                  <Badge variant="info" className="text-[10px]">
                    Due {new Date(detailQuery.data.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </Badge>
                )}
              </div>
              <div className="flex items-start justify-between gap-3">
                <SheetTitle className="text-2xl font-display leading-tight flex-1">
                  {detailQuery.data.title}
                </SheetTitle>
                <SaveAsTemplateButton
                  workspaceId={fallbackWorkspaceId}
                  taskId={detailQuery.data.id}
                />
              </div>
              <SheetDescription className="sr-only">Task details</SheetDescription>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Badge variant="secondary" className="capitalize">
                  {detailQuery.data.status.replace('_', ' ')}
                </Badge>
                <Badge
                  variant={detailQuery.data.priority as 'urgent' | 'high' | 'normal' | 'low'}
                  className="capitalize"
                >
                  {detailQuery.data.priority}
                </Badge>
                {detailQuery.data.labels?.map((l) => (
                  <Badge
                    key={l.id}
                    variant="outline"
                    className="border-transparent text-white"
                    style={{ backgroundColor: l.color }}
                  >
                    {l.name}
                  </Badge>
                ))}
              </div>
            </SheetHeader>

            {/* Tab strip */}
            <div className="flex gap-4 overflow-x-auto scrollbar-none border-b border-border/60 -mx-6 px-6">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'whitespace-nowrap py-2.5 text-sm transition-colors',
                      isActive
                        ? 'border-b-2 border-accent text-foreground font-medium -mb-px'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>

            <div className="pt-4">
              {activeTab === 'overview' && (
                <OverviewPanel detail={detailQuery.data} taskId={detailQuery.data.id} workspaceId={fallbackWorkspaceId} />
              )}
              {activeTab === 'fields' && (
                <CustomFieldsPanel taskId={detailQuery.data.id} workspaceId={fallbackWorkspaceId} />
              )}
              {activeTab === 'subtasks' && (
                <SubtasksPanel
                  taskId={detailQuery.data.id}
                  parentListId={detailQuery.data.listId}
                  inline={detailQuery.data.subtasks ?? []}
                />
              )}
              {activeTab === 'checklists' && (
                <ChecklistsPanel taskId={detailQuery.data.id} checklists={detailQuery.data.checklists ?? []} />
              )}
              {activeTab === 'watchers' && (
                <WatchersPanel
                  taskId={detailQuery.data.id}
                  workspaceId={fallbackWorkspaceId}
                  inline={detailQuery.data.watchers ?? []}
                />
              )}
              {activeTab === 'dependencies' && (
                <DependenciesPanel
                  taskId={detailQuery.data.id}
                  workspaceId={fallbackWorkspaceId}
                  inline={detailQuery.data.dependencies ?? []}
                  onOpenTask={(relatedTaskId) =>
                    navigate({
                      to: '.',
                      search: (prev: Record<string, unknown>) => ({ ...prev, task: relatedTaskId }),
                    } as any)
                  }
                />
              )}
              {activeTab === 'attachments' && (
                <AttachmentsPanel taskId={detailQuery.data.id} inline={detailQuery.data.attachments ?? []} />
              )}
              {activeTab === 'comments' && (
                <CommentsPanel taskId={detailQuery.data.id} workspaceId={fallbackWorkspaceId} />
              )}
              {activeTab === 'activity' && <ActivityPanel taskId={detailQuery.data.id} />}
              {activeTab === 'time' && <TimePanel taskId={detailQuery.data.id} />}
            </div>
          </>
        ) : (
          <p className="text-sm text-destructive">Task not found.</p>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewPanel({
  detail,
  taskId,
  workspaceId,
}: {
  detail: TaskDetail
  taskId: string
  workspaceId?: string
}) {
  const qc = useQueryClient()
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<Array<{ userId: string; displayName: string; email: string }>>(`/workspaces/${workspaceId}/members`),
    enabled: Boolean(workspaceId),
  })
  const pendingInvitesQuery = useQuery({
    queryKey: ['workspace-invitations', workspaceId],
    queryFn: () => api<Array<{ id: string; email: string; role: string; status: string; expiresAt: string }>>(`/invitations/workspace/${workspaceId}`),
    enabled: Boolean(workspaceId),
  })

  const addAssignee = useMutation({
    mutationFn: (userId: string) =>
      api(`/tasks/${taskId}/assignees`, {
        method: 'POST',
        body: { userId },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const removeAssignee = useMutation({
    mutationFn: (userId: string) => api(`/tasks/${taskId}/assignees/${userId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const assignedIds = new Set((detail.assignees ?? []).map((a) => a.user.id))
  const availableMembers = (membersQuery.data ?? []).filter((m) => !assignedIds.has(m.userId))

  return (
    <div className="space-y-4">
      <section>
        <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Description</h4>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {detail.description?.trim() ? detail.description : (
            <span className="text-muted-foreground italic">No description yet.</span>
          )}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Status">
          <Badge variant="secondary" className="capitalize">
            {detail.status.replace('_', ' ')}
          </Badge>
        </Field>
        <Field label="Priority">
          <Badge variant="outline" className={cn('capitalize', priorityColor(detail.priority))}>
            {detail.priority}
          </Badge>
        </Field>
        <Field label="Due date">
          <span className="text-sm">
            {detail.dueDate ? new Date(detail.dueDate).toLocaleDateString() : '—'}
          </span>
        </Field>
        <Field label="Start date">
          <span className="text-sm">
            {detail.startDate ? new Date(detail.startDate).toLocaleDateString() : '—'}
          </span>
        </Field>
      </div>

      <Field label="Assignees">
        {detail.assignees && detail.assignees.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {detail.assignees.map((a) => (
              <button
                key={a.user.id}
                onClick={() => removeAssignee.mutate(a.user.id)}
                className="inline-flex"
                title="Remove assignee"
              >
                <Badge variant="secondary">
                  {a.user.displayName ?? a.user.email ?? 'User'} ✕
                </Badge>
              </button>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Unassigned</span>
        )}
        {workspaceId && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {availableMembers.slice(0, 8).map((m) => (
              <button
                key={m.userId}
                onClick={() => addAssignee.mutate(m.userId)}
                className="inline-flex"
                title={`Assign ${m.displayName || m.email}`}
              >
                <Badge variant="outline">+ {m.displayName || m.email}</Badge>
              </button>
            ))}
            {availableMembers.length === 0 && (
              <span className="text-xs text-muted-foreground">No additional workspace members available</span>
            )}
          </div>
        )}
        {(pendingInvitesQuery.data?.length ?? 0) > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            {pendingInvitesQuery.data?.length} invited teammate(s) are pending acceptance and will appear here after joining.
          </div>
        )}
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div>{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

function SubtasksPanel({
  taskId,
  parentListId,
  inline,
}: {
  taskId: string
  parentListId: string
  inline: Subtask[]
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('')

  // Probe a dedicated endpoint first; fall back to inline subtasks from getTask.
  const probe = useQuery({
    queryKey: ['task', taskId, 'subtasks'],
    queryFn: async () => {
      try {
        return await api<Subtask[]>(`/tasks/${taskId}/subtasks`)
      } catch (err) {
        if (isNotWired(err)) return null
        throw err
      }
    },
  })

  const subtasks = probe.data ?? inline

  const toggleDone = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      api(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: done ? 'done' : 'todo' }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const create = useMutation({
    mutationFn: () =>
      api(`/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title, parentTaskId: taskId, listId: parentListId }),
      }),
    onSuccess: async () => {
      setTitle('')
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const renameSubtask = useMutation({
    mutationFn: ({ id, nextTitle }: { id: string; nextTitle: string }) =>
      api(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: nextTitle }),
      }),
    onSuccess: async () => {
      setEditingSubtaskId(null)
      setEditingSubtaskTitle('')
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const deleteSubtask = useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  return (
    <div className="space-y-2">
      {subtasks.length === 0 ? (
        <EmptyState title="No subtasks yet" hint="Break this task into smaller pieces." />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {subtasks.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors"
            >
              <input
                type="checkbox"
                checked={s.status === 'done'}
                onChange={(e) => toggleDone.mutate({ id: s.id, done: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              {editingSubtaskId === s.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <Input
                    value={editingSubtaskTitle}
                    onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                    className="h-8"
                  />
                  <Button
                    size="sm"
                    onClick={() => renameSubtask.mutate({ id: s.id, nextTitle: editingSubtaskTitle.trim() })}
                    disabled={!editingSubtaskTitle.trim() || renameSubtask.isPending}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingSubtaskId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <span
                  className={cn(
                    'flex-1 text-sm truncate',
                    s.status === 'done' && 'line-through text-muted-foreground',
                  )}
                >
                  {s.title}
                </span>
              )}
              <Badge variant="outline" className={cn('capitalize text-xs', priorityColor(s.priority))}>
                {s.priority}
              </Badge>
              {editingSubtaskId !== s.id && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setEditingSubtaskId(s.id)
                    setEditingSubtaskTitle(s.title)
                  }}
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                className="text-xs text-rose-500 hover:text-rose-600"
                onClick={() => deleteSubtask.mutate(s.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex gap-2 pt-1"
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim()) create.mutate()
        }}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="+ Add subtask"
        />
        <Button type="submit" disabled={!title.trim() || create.isPending} size="sm">
          Add
        </Button>
      </form>
      {create.isError ? (
        <NotWiredNote>
          Couldn&apos;t create subtask. Please retry.
        </NotWiredNote>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

function ChecklistsPanel({
  taskId,
  checklists,
}: {
  taskId: string
  checklists: Checklist[]
}) {
  const qc = useQueryClient()
  const [itemText, setItemText] = useState('')
  const [itemDueDate, setItemDueDate] = useState('')
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null)
  const [editingChecklistTitle, setEditingChecklistTitle] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemContent, setEditingItemContent] = useState('')
  const firstChecklist = useMemo(() => checklists[0] ?? null, [checklists])

  const createChecklist = useMutation({
    mutationFn: async () => {
      if (firstChecklist) return firstChecklist
      return api<{ id: string }>(`/tasks/${taskId}/checklists`, {
        method: 'POST',
        body: JSON.stringify({ title: 'Checklist' }),
      })
    },
  })

  const addItem = useMutation({
    mutationFn: async () => {
      const checklist = firstChecklist ?? (await createChecklist.mutateAsync())
      return api(`/tasks/${taskId}/checklists/${checklist.id}/items`, {
        method: 'POST',
        body: JSON.stringify({ content: itemText, dueDate: itemDueDate || null }),
      })
    },
    onSuccess: async () => {
      setItemText('')
      setItemDueDate('')
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const renameChecklist = useMutation({
    mutationFn: ({ checklistId, title }: { checklistId: string; title: string }) =>
      api(`/tasks/${taskId}/checklists/${checklistId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      }),
    onSuccess: async () => {
      setEditingChecklistId(null)
      setEditingChecklistTitle('')
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const deleteChecklist = useMutation({
    mutationFn: (checklistId: string) => api(`/tasks/${taskId}/checklists/${checklistId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const toggleItem = useMutation({
    mutationFn: ({ itemId, isDone }: { itemId: string; isDone: boolean }) =>
      api(`/tasks/${taskId}/checklists/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isDone }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })
  const updateItemMeta = useMutation({
    mutationFn: ({ itemId, dueDate }: { itemId: string; dueDate: string | null }) =>
      api(`/tasks/${taskId}/checklists/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ dueDate }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => api(`/tasks/${taskId}/checklists/items/${itemId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const editItem = useMutation({
    mutationFn: ({ itemId, content }: { itemId: string; content: string }) =>
      api(`/tasks/${taskId}/checklists/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }),
    onSuccess: async () => {
      setEditingItemId(null)
      setEditingItemContent('')
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  return (
    <div className="space-y-3">
      {checklists.length === 0 ? (
        <EmptyState title="No checklists yet" hint="Add an item below to create one." />
      ) : (
        checklists.map((cl) => (
          <div key={cl.id} className="rounded-md border border-border">
            <div className="border-b border-border px-3 py-2 flex items-center gap-2">
              {editingChecklistId === cl.id ? (
                <>
                  <Input
                    value={editingChecklistTitle}
                    onChange={(e) => setEditingChecklistTitle(e.target.value)}
                    className="h-8"
                  />
                  <Button
                    size="sm"
                    onClick={() => renameChecklist.mutate({ checklistId: cl.id, title: editingChecklistTitle.trim() })}
                    disabled={!editingChecklistTitle.trim() || renameChecklist.isPending}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingChecklistId(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <div className="text-sm font-medium flex-1">{cl.title}</div>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditingChecklistId(cl.id)
                      setEditingChecklistTitle(cl.title)
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="text-xs text-rose-500 hover:text-rose-600"
                    onClick={() => deleteChecklist.mutate(cl.id)}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
            <ul className="divide-y divide-border">
              {cl.items.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">No items</li>
              ) : (
                cl.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={item.isDone}
                      onChange={(e) =>
                        toggleItem.mutate({ itemId: item.id, isDone: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-border"
                    />
                    {editingItemId === item.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <Input
                          value={editingItemContent}
                          onChange={(e) => setEditingItemContent(e.target.value)}
                          className="h-8"
                        />
                        <Button
                          size="sm"
                          onClick={() => editItem.mutate({ itemId: item.id, content: editingItemContent.trim() })}
                          disabled={!editingItemContent.trim() || editItem.isPending}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingItemId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <span
                        className={cn(
                          'text-sm flex-1',
                          item.isDone && 'line-through text-muted-foreground',
                        )}
                      >
                        {item.content}
                      </span>
                    )}
                    {editingItemId !== item.id && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingItemId(item.id)
                          setEditingItemContent(item.content)
                        }}
                      >
                        Edit
                      </button>
                    )}
                    <Input
                      type="date"
                      value={item.dueDate ? item.dueDate.slice(0, 10) : ''}
                      onChange={(e) => updateItemMeta.mutate({ itemId: item.id, dueDate: e.target.value || null })}
                      className="h-7 w-[145px]"
                    />
                    <button
                      type="button"
                      className="text-xs text-rose-500 hover:text-rose-600"
                      onClick={() => deleteItem.mutate(item.id)}
                    >
                      Delete
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ))
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (itemText.trim()) addItem.mutate()
        }}
      >
        <Input
          value={itemText}
          onChange={(e) => setItemText(e.target.value)}
          placeholder="+ Add checklist item"
        />
        <Input
          type="date"
          value={itemDueDate}
          onChange={(e) => setItemDueDate(e.target.value)}
          className="w-[155px]"
        />
        <Button type="submit" disabled={!itemText.trim() || addItem.isPending} size="sm">
          Add
        </Button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Watchers
// ---------------------------------------------------------------------------

function WatchersPanel({
  taskId,
  workspaceId,
  inline,
}: {
  taskId: string
  workspaceId?: string
  inline: Watcher[]
}) {
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [selectedUserId, setSelectedUserId] = useState('')
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WorkspaceMemberLite[]>(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  })
  const isWatching = useMemo(
    () => (currentUser ? inline.some((w) => w.userId === currentUser.id) : false),
    [inline, currentUser],
  )
  const watcherIds = useMemo(() => new Set(inline.map((w) => w.userId)), [inline])
  const addableMembers = useMemo(
    () => (membersQuery.data ?? []).filter((m) => !watcherIds.has(m.userId)),
    [membersQuery.data, watcherIds],
  )

  const toggle = useMutation({
    mutationFn: async () => {
      if (!currentUser) return
      if (isWatching) {
        return api(`/tasks/${taskId}/watchers/${currentUser.id}`, { method: 'DELETE' })
      }
      return api(`/tasks/${taskId}/watchers`, {
        method: 'POST',
        body: JSON.stringify({ userId: currentUser.id }),
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })
  const addWatcher = useMutation({
    mutationFn: (userId: string) =>
      api(`/tasks/${taskId}/watchers`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: async () => {
      setSelectedUserId('')
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })
  const removeWatcher = useMutation({
    mutationFn: (userId: string) => api(`/tasks/${taskId}/watchers/${userId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {inline.length} watcher{inline.length === 1 ? '' : 's'}
        </p>
        <Button
          size="sm"
          variant={isWatching ? 'outline' : 'default'}
          onClick={() => toggle.mutate()}
          disabled={!currentUser || toggle.isPending}
        >
          {isWatching ? 'Unwatch' : 'Watch task'}
        </Button>
      </div>
      {workspaceId && (
        <div className="flex items-center gap-2 rounded-md border border-border p-2">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">Add teammate as watcher…</option>
            {addableMembers.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName || member.email}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={() => addWatcher.mutate(selectedUserId)}
            disabled={!selectedUserId || addWatcher.isPending}
          >
            Add
          </Button>
        </div>
      )}

      {inline.length === 0 ? (
        <EmptyState title="Nobody is watching yet" hint="Watchers get notified on updates." />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {inline.map((w) => (
            <li key={w.userId} className="flex items-center gap-3 px-3 py-2">
              <div className="h-7 w-7 rounded-full bg-brand-100 text-foreground flex items-center justify-center text-xs font-medium">
                {(w.user?.displayName ?? w.user?.email ?? '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm truncate">
                  {w.user?.displayName ?? w.user?.email ?? w.userId}
                </div>
                {w.user?.email ? (
                  <div className="text-xs text-muted-foreground truncate">{w.user.email}</div>
                ) : null}
              </div>
              <button
                type="button"
                className="text-xs text-rose-500 hover:text-rose-600"
                onClick={() => removeWatcher.mutate(w.userId)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

function DependenciesPanel({
  taskId,
  workspaceId,
  inline,
  onOpenTask,
}: {
  taskId: string
  workspaceId?: string
  inline: Dependency[]
  onOpenTask: (relatedTaskId: string) => void
}) {
  const qc = useQueryClient()
  const [relatedId, setRelatedId] = useState('')
  const [type, setType] = useState<'blocks' | 'blocked_by' | 'related_to'>('blocks')
  const [taskSearch, setTaskSearch] = useState('')
  const tasksQuery = useQuery({
    queryKey: ['dependency-task-picker', workspaceId],
    queryFn: () =>
      api<Array<{ id: string; title: string; listName?: string; projectName?: string }>>(
        `/tasks/workspace/${workspaceId}?limit=1000`,
      ),
    enabled: !!workspaceId,
  })
  const graphQuery = useQuery({
    queryKey: ['task', taskId, 'dependency-graph'],
    queryFn: () =>
      api<{
        rootTaskId: string
        nodes: Array<{
          id: string
          title: string
          status: TaskStatus
          priority: TaskPriority
          isArchived: boolean
        }>
        edges: Array<{
          taskId: string
          relatedTaskId: string
          type: 'blocks' | 'blocked_by' | 'related_to'
        }>
        metrics: {
          nodeCount: number
          edgeCount: number
          blockedByOpenCount: number
          blocksOpenCount: number
          longestBlockedByChainDepth: number
          longestBlocksChainDepth: number
        }
      }>(`/tasks/${taskId}/dependencies/graph?depth=3`),
  })
  const graphModel = useMemo(() => {
    if (!graphQuery.data) return null
    const byId = new Map(graphQuery.data.nodes.map((node) => [node.id, node]))
    const upstream = new Set<string>()
    const downstream = new Set<string>()
    const relatedIds = new Set<string>()
    for (const edge of graphQuery.data.edges) {
      if (edge.type === 'related_to') {
        if (edge.taskId === taskId) relatedIds.add(edge.relatedTaskId)
        if (edge.relatedTaskId === taskId) relatedIds.add(edge.taskId)
        continue
      }
      const blocker = edge.type === 'blocks' ? edge.taskId : edge.relatedTaskId
      const blocked = edge.type === 'blocks' ? edge.relatedTaskId : edge.taskId
      if (blocked === taskId) upstream.add(blocker)
      if (blocker === taskId) downstream.add(blocked)
    }
    return {
      byId,
      upstream: [...upstream].map((id) => byId.get(id)).filter(Boolean),
      downstream: [...downstream].map((id) => byId.get(id)).filter(Boolean),
      related: [...relatedIds].map((id) => byId.get(id)).filter(Boolean),
      edges: graphQuery.data.edges,
    }
  }, [graphQuery.data, taskId])
  const taskOptions = useMemo<TaskPickerItem[]>(
    () => (tasksQuery.data ?? []).filter((task) => task.id !== taskId),
    [tasksQuery.data, taskId],
  )
  const filteredTaskOptions = useMemo(() => {
    const q = taskSearch.trim().toLowerCase()
    if (!q) return taskOptions
    return taskOptions.filter(
      (task) =>
        task.title.toLowerCase().includes(q) ||
        task.projectName?.toLowerCase().includes(q) ||
        task.listName?.toLowerCase().includes(q),
    )
  }, [taskOptions, taskSearch])

  const add = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/dependencies`, {
        method: 'POST',
        body: JSON.stringify({ relatedTaskId: relatedId, type }),
      }),
    onSuccess: async () => {
      setRelatedId('')
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const remove = useMutation({
    mutationFn: (depId: string) =>
      api(`/tasks/${taskId}/dependencies/${depId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const blocking = inline.filter((d) => d.dep.type === 'blocks')
  const waitingOn = inline.filter((d) => d.dep.type === 'blocked_by')
  const related = inline.filter((d) => d.dep.type === 'related_to')

  return (
    <div className="space-y-4">
      <DepGroup label="Blocking" items={blocking} onRemove={(id) => remove.mutate(id)} onOpenTask={onOpenTask} />
      <DepGroup label="Waiting on" items={waitingOn} onRemove={(id) => remove.mutate(id)} onOpenTask={onOpenTask} />
      {related.length > 0 ? (
        <DepGroup label="Related" items={related} onRemove={(id) => remove.mutate(id)} onOpenTask={onOpenTask} />
      ) : null}
      {graphQuery.data ? (
        <div className="rounded-md border border-border bg-card p-3 space-y-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">Dependency graph insights</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            <div>Nodes: <span className="font-medium text-foreground">{graphQuery.data.metrics.nodeCount}</span></div>
            <div>Edges: <span className="font-medium text-foreground">{graphQuery.data.metrics.edgeCount}</span></div>
            <div>Open blockers: <span className="font-medium text-foreground">{graphQuery.data.metrics.blockedByOpenCount}</span></div>
            <div>Blocking open tasks: <span className="font-medium text-foreground">{graphQuery.data.metrics.blocksOpenCount}</span></div>
            <div>Upstream chain depth: <span className="font-medium text-foreground">{graphQuery.data.metrics.longestBlockedByChainDepth}</span></div>
            <div>Downstream chain depth: <span className="font-medium text-foreground">{graphQuery.data.metrics.longestBlocksChainDepth}</span></div>
          </div>
          {graphModel ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <GraphColumn
                title="Blocking this task"
                hint="Upstream blockers"
                nodes={graphModel.upstream}
                onOpenTask={onOpenTask}
              />
              <div className="rounded-md border border-border/70 bg-muted/20 p-2">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Current task</div>
                <div className="text-sm font-medium">{taskId}</div>
              </div>
              <GraphColumn
                title="Blocked by this task"
                hint="Downstream impact"
                nodes={graphModel.downstream}
                onOpenTask={onOpenTask}
              />
              {graphModel.related.length > 0 ? (
                <div className="md:col-span-3">
                  <GraphColumn
                    title="Related links"
                    hint="Non-blocking references"
                    nodes={graphModel.related}
                    onOpenTask={onOpenTask}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <form
        className="flex gap-2 pt-1 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (relatedId.trim()) add.mutate()
        }}
      >
        <select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="blocks">Blocks</option>
          <option value="blocked_by">Blocked by</option>
          <option value="related_to">Related</option>
        </select>
        <Input
          value={relatedId}
          onChange={(e) => setRelatedId(e.target.value)}
          placeholder="Related task ID"
        />
        {workspaceId && taskOptions.length > 0 && (
          <div className="min-w-[260px] space-y-1">
            <Input
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
              placeholder="Search task…"
              className="h-8"
            />
            <select
              value={relatedId}
              onChange={(e) => setRelatedId(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm w-full"
            >
              <option value="">Pick task…</option>
              {filteredTaskOptions.slice(0, 200).map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title} {task.projectName ? `(${task.projectName})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" size="sm" disabled={!relatedId.trim() || add.isPending}>
          Add
        </Button>
      </form>
    </div>
  )
}

function GraphColumn({
  title,
  hint,
  nodes,
  onOpenTask,
}: {
  title: string
  hint: string
  nodes: Array<{
    id: string
    title: string
    status: TaskStatus
    priority: TaskPriority
    isArchived: boolean
  } | undefined>
  onOpenTask: (relatedTaskId: string) => void
}) {
  const items = nodes.filter((node): node is NonNullable<typeof node> => Boolean(node))
  return (
    <div className="rounded-md border border-border/70 bg-muted/20 p-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="text-[11px] text-muted-foreground mb-2">{hint}</div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">None</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onOpenTask(node.id)}
              className="w-full text-left rounded border border-border bg-card px-2 py-1.5 hover:border-accent/40"
            >
              <div className="text-xs font-medium truncate">{node.title}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {node.status} · {node.priority}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DepGroup({
  label,
  items,
  onRemove,
  onOpenTask,
}: {
  label: string
  items: Dependency[]
  onRemove: (depId: string) => void
  onOpenTask?: (relatedTaskId: string) => void
}) {
  return (
    <section>
      <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{label}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((d) => (
            <li key={d.dep.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40">
              <span className="flex-1 text-sm truncate">{d.related.title}</span>
              <Badge variant="outline" className={cn('capitalize text-xs', priorityColor(d.related.priority))}>
                {d.related.priority}
              </Badge>
              <Badge variant="secondary" className="capitalize">
                {d.related.status.replace('_', ' ')}
              </Badge>
              {onOpenTask && (
                <button
                  type="button"
                  onClick={() => onOpenTask(d.related.id)}
                  className="text-xs text-accent hover:underline"
                >
                  Open
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(d.dep.id)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

function AttachmentsPanel({
  taskId,
  inline,
}: {
  taskId: string
  inline: Attachment[]
}) {
  const qc = useQueryClient()
  const [linkUrl, setLinkUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  // Probe the dedicated endpoint; fall back to inline list if 404.
  const probe = useQuery({
    queryKey: ['task', taskId, 'attachments'],
    queryFn: async () => {
      try {
        return await api<Attachment[]>(`/tasks/${taskId}/attachments`)
      } catch (err) {
        if (isNotWired(err)) return null
        throw err
      }
    },
  })

  const attachments = probe.data ?? inline
  const uploadWired = probe.data !== null && probe.data !== undefined
  const addAttachment = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/attachments`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: fileName.trim() || linkUrl.trim().split('/').pop() || 'Attachment',
          url: linkUrl.trim(),
          contentType: 'text/url',
          sizeBytes: 0,
        }),
      }),
    onSuccess: async () => {
      setLinkUrl('')
      setFileName('')
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'attachments'] })
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'activity'] })
    },
  })
  const uploadAttachment = useMutation({
    mutationFn: async () => {
      if (!selectedFile) return
      const presign = await api<{ uploadUrl: string; storageKey: string }>(`/tasks/${taskId}/attachments/presign`, {
        method: 'POST',
        body: {
          fileName: selectedFile.name,
          contentType: selectedFile.type || 'application/octet-stream',
        },
      })
      await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': selectedFile.type || 'application/octet-stream' },
        body: selectedFile,
      })
      await api(`/tasks/${taskId}/attachments`, {
        method: 'POST',
        body: {
          fileName: selectedFile.name,
          storageKey: presign.storageKey,
          contentType: selectedFile.type || 'application/octet-stream',
          sizeBytes: selectedFile.size,
        },
      })
    },
    onSuccess: async () => {
      setSelectedFile(null)
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'attachments'] })
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'activity'] })
    },
  })
  const removeAttachment = useMutation({
    mutationFn: (attachmentId: string) => api(`/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'attachments'] })
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'activity'] })
    },
  })

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'rounded-md border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-center',
          'text-sm text-muted-foreground',
        )}
      >
        Drag and drop files here to upload
        {!uploadWired ? (
          <div className="mt-2 text-xs">File uploads are unavailable for this task source.</div>
        ) : null}
      </div>
      {uploadWired && (
        <div className="rounded-md border border-border bg-card p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Upload file</div>
          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            <Input
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="h-8"
            />
            <Button
              size="sm"
              onClick={() => uploadAttachment.mutate()}
              disabled={!selectedFile || uploadAttachment.isPending}
            >
              Upload
            </Button>
          </div>
          <div className="text-xs font-medium text-muted-foreground">Attach by link</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="File name (optional)"
              className="h-8"
            />
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="h-8 md:col-span-2"
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => addAttachment.mutate()} disabled={!linkUrl.trim() || addAttachment.isPending}>
              Add attachment
            </Button>
          </div>
        </div>
      )}

      {attachments.length === 0 ? (
        <EmptyState title="No files attached" hint="Drop files above to get started." />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded bg-brand-100 text-foreground text-xs font-medium">
                {(a.mimeType ?? a.fileName.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{a.fileName}</div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(a.fileSize)}
                  {a.uploadedBy ? ` · ${a.uploadedBy}` : ''}
                </div>
              </div>
              {a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                  Open
                </a>
              ) : null}
              {uploadWired && (
                <button
                  type="button"
                  className="text-xs text-rose-500 hover:text-rose-600"
                  onClick={() => removeAttachment.mutate(a.id)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

function CommentsPanel({ taskId, workspaceId }: { taskId: string; workspaceId?: string }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [selectedMentionUserIds, setSelectedMentionUserIds] = useState<string[]>([])
  const [mentionTab, setMentionTab] = useState<'people' | 'tasks' | 'docs'>('people')
  const [mentionIndex, setMentionIndex] = useState(0)
  const mentionQuery = text.slice(text.lastIndexOf('@') + 1).toLowerCase()
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WorkspaceMemberLite[]>(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  })
  const mentionTasksQuery = useQuery({
    queryKey: ['mention-tasks', workspaceId],
    queryFn: () => api<MentionTaskLite[]>(`/tasks/workspace/${workspaceId}?limit=200`),
    enabled: !!workspaceId && mentionTab === 'tasks',
  })
  const mentionDocsQuery = useQuery({
    queryKey: ['mention-docs', workspaceId],
    queryFn: () => api<MentionDocLite[]>(`/workspaces/${workspaceId}/docs`),
    enabled: !!workspaceId && mentionTab === 'docs',
  })
  const mentionCandidates = (membersQuery.data ?? []).filter((m) =>
    (m.displayName || m.email).toLowerCase().includes(mentionQuery),
  )
  const taskMentionCandidates = (mentionTasksQuery.data ?? []).filter((t) =>
    `${t.title} ${t.projectName ?? ''} ${t.listName ?? ''}`.toLowerCase().includes(mentionQuery),
  )
  const docMentionCandidates = (mentionDocsQuery.data ?? []).filter((d) =>
    d.title.toLowerCase().includes(mentionQuery),
  )
  const showMentions = text.includes('@') && text[text.length - 1] !== ' '
  const namesById = useMemo(
    () => Object.fromEntries((membersQuery.data ?? []).map((m) => [m.userId, m.displayName || m.email])),
    [membersQuery.data],
  )

  const commentsQuery = useQuery({
    queryKey: ['task', taskId, 'comments'],
    queryFn: async () => {
      try {
        return await api<TaskComment[]>(`/tasks/${taskId}/comments`)
      } catch (err) {
        if (isNotWired(err)) return null
        throw err
      }
    },
  })

  const create = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          body: text,
          parentCommentId: replyTo ?? undefined,
          mentions: selectedMentionUserIds.map((userId) => ({ userId, offset: 0, length: 0 })),
        }),
      }),
    onSuccess: async () => {
      setText('')
      setReplyTo(null)
      setSelectedMentionUserIds([])
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'activity'] })
    },
  })
  const update = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      api(`/tasks/${taskId}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      }),
    onSuccess: async () => {
      setEditingCommentId(null)
      setEditingBody('')
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
    },
  })
  const remove = useMutation({
    mutationFn: (commentId: string) => api(`/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
    },
  })

  const react = useMutation({
    mutationFn: ({ commentId, emoji }: { commentId: string; emoji: string }) =>
      api(`/tasks/${taskId}/comments/${commentId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
    },
  })
  const assign = useMutation({
    mutationFn: ({ commentId, userId }: { commentId: string; userId: string | null }) =>
      api(`/tasks/${taskId}/comments/${commentId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
    },
  })
  const resolveComment = useMutation({
    mutationFn: ({ commentId, resolved }: { commentId: string; resolved: boolean }) =>
      api(`/tasks/${taskId}/comments/${commentId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolved }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
    },
  })

  if (commentsQuery.data === null) {
    return <NotWiredNote>Comments endpoint is not available.</NotWiredNote>
  }

  const comments = commentsQuery.data ?? []
  const roots = comments.filter((c) => !c.parentCommentId)
  const repliesByParent = comments.reduce((acc, comment) => {
    if (!comment.parentCommentId) return acc
    const arr = acc.get(comment.parentCommentId) ?? []
    arr.push(comment)
    acc.set(comment.parentCommentId, arr)
    return acc
  }, new Map<string, TaskComment[]>())
  const parentPreview = replyTo ? comments.find((c) => c.id === replyTo) ?? null : null
  const activeMention = mentionCandidates[mentionIndex] ?? null

  const insertMention = (member: WorkspaceMemberLite) => {
    const at = text.lastIndexOf('@')
    const prefix = at >= 0 ? text.slice(0, at) : text
    const display = member.displayName || member.email
    setText(`${prefix}@${display} `)
    setSelectedMentionUserIds((prev) => (prev.includes(member.userId) ? prev : [...prev, member.userId]))
    setMentionIndex(0)
  }
  const insertTaskMention = (task: MentionTaskLite) => {
    const at = text.lastIndexOf('@')
    const prefix = at >= 0 ? text.slice(0, at) : text
    setText(`${prefix}#${task.title} `)
    setMentionIndex(0)
  }
  const insertDocMention = (doc: MentionDocLite) => {
    const at = text.lastIndexOf('@')
    const prefix = at >= 0 ? text.slice(0, at) : text
    setText(`${prefix}Doc:${doc.title} `)
    setMentionIndex(0)
  }
  const activeCandidates =
    mentionTab === 'people'
      ? mentionCandidates
      : mentionTab === 'tasks'
        ? taskMentionCandidates
        : docMentionCandidates

  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <EmptyState title="No comments yet" hint="Be the first to leave a note." />
      ) : (
        <ul className="space-y-2">
          {roots.map((c) => {
            const replies = repliesByParent.get(c.id) ?? []
            return (
              <li key={c.id} className="rounded-md border border-border p-3 hover:bg-muted/30 transition-colors space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">
                    {c.author?.displayName ?? c.author?.email ?? 'User'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-sm whitespace-pre-wrap">{prettifyMentions(c.body, namesById)}</div>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  {c.assignee?.displayName && (
                    <Badge variant="outline" className="text-[10px]">Assigned: {c.assignee.displayName}</Badge>
                  )}
                  {c.resolvedAt && (
                    <Badge variant="success" className="text-[10px]">
                      Resolved{c.resolver?.displayName ? ` by ${c.resolver.displayName}` : ''}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setReplyTo(c.id)}
                  >
                    Reply
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditingCommentId(c.id)
                      setEditingBody(c.body)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-xs text-rose-500 hover:text-rose-600"
                    onClick={() => remove.mutate(c.id)}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => resolveComment.mutate({ commentId: c.id, resolved: !c.resolvedAt })}
                  >
                    {c.resolvedAt ? 'Reopen' : 'Resolve'}
                  </button>
                  {workspaceId && (
                    <select
                      className="h-6 rounded border border-border bg-background px-1 text-[10px]"
                      value={c.assignedToUserId ?? ''}
                      onChange={(e) => assign.mutate({ commentId: c.id, userId: e.target.value || null })}
                    >
                      <option value="">Assign…</option>
                      {(membersQuery.data ?? []).map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.displayName || member.email}
                        </option>
                      ))}
                    </select>
                  )}
                  {replies.length > 0 && (
                    <span className="text-xs text-accent ml-auto">{replies.length} repl{replies.length === 1 ? 'y' : 'ies'}</span>
                  )}
                </div>
                {editingCommentId === c.id && (
                  <div className="mt-2 space-y-2">
                    <Textarea rows={2} value={editingBody} onChange={(e) => setEditingBody(e.target.value)} />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingCommentId(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => update.mutate({ commentId: c.id, body: editingBody })}
                        disabled={!editingBody.trim() || update.isPending}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                )}
                <div className="mt-2 flex gap-1">
                  {['👍', '🎉', '❤️'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => react.mutate({ commentId: c.id, emoji })}
                      className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-muted"
                    >
                      {emoji}
                      {c.reactions?.filter((r) => r.emoji === emoji).length
                        ? ` ${c.reactions.filter((r) => r.emoji === emoji).length}`
                        : ''}
                    </button>
                  ))}
                </div>
                {replies.length > 0 && (
                  <ul className="mt-2 space-y-1.5 border-l border-border pl-3">
                    {replies.map((reply) => (
                      <li key={reply.id} className="rounded border border-border/70 p-2 bg-card/50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">
                            {reply.author?.displayName ?? reply.author?.email ?? 'User'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(reply.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-1 text-sm whitespace-pre-wrap">{prettifyMentions(reply.body, namesById)}</div>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => setReplyTo(reply.id)}
                          >
                            Reply
                          </button>
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setEditingCommentId(reply.id)
                              setEditingBody(reply.body)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-xs text-rose-500 hover:text-rose-600"
                            onClick={() => remove.mutate(reply.id)}
                          >
                            Delete
                          </button>
                        </div>
                        {editingCommentId === reply.id && (
                          <div className="mt-2 space-y-2">
                            <Textarea rows={2} value={editingBody} onChange={(e) => setEditingBody(e.target.value)} />
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setEditingCommentId(null)}>
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => update.mutate({ commentId: reply.id, body: editingBody })}
                                disabled={!editingBody.trim() || update.isPending}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        )}
                        <div className="mt-2 flex gap-1">
                          {['👍', '🎉', '❤️'].map((emoji) => (
                            <button
                              key={`${reply.id}-${emoji}`}
                              type="button"
                              onClick={() => react.mutate({ commentId: reply.id, emoji })}
                              className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-muted"
                            >
                              {emoji}
                              {reply.reactions?.filter((r) => r.emoji === emoji).length
                                ? ` ${reply.reactions.filter((r) => r.emoji === emoji).length}`
                                : ''}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="border-t border-border pt-3">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded border border-border bg-muted/30 px-2 py-1 text-xs">
            <span className="truncate">
              Replying to {parentPreview?.author?.displayName ?? parentPreview?.author?.email ?? 'comment'}: {parentPreview?.body ?? ''}
            </span>
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setReplyTo(null)}>
              Cancel
            </button>
          </div>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment… use @ to mention"
          rows={3}
          onKeyDown={(e) => {
            if (!showMentions || activeCandidates.length === 0) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setMentionIndex((prev) => (prev + 1) % activeCandidates.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setMentionIndex((prev) => (prev - 1 + activeCandidates.length) % activeCandidates.length)
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (mentionTab === 'people' && activeMention) insertMention(activeMention)
              if (mentionTab === 'tasks' && taskMentionCandidates[mentionIndex]) insertTaskMention(taskMentionCandidates[mentionIndex])
              if (mentionTab === 'docs' && docMentionCandidates[mentionIndex]) insertDocMention(docMentionCandidates[mentionIndex])
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setText((prev) => prev.replace(/@[^ ]*$/, ''))
              setMentionIndex(0)
            }
          }}
        />
        {showMentions && mentionCandidates.length > 0 && (
          <div className="mt-2 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
            <div className="px-2 pt-2 pb-1 border-b border-border/70 flex items-center gap-1">
              {([
                ['people', 'People'],
                ['tasks', 'Tasks'],
                ['docs', 'Docs'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMentionTab(id)
                    setMentionIndex(0)
                  }}
                  className={cn(
                    'px-2 py-1 rounded text-[11px]',
                    mentionTab === id ? 'bg-accent/15 text-foreground font-medium' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {mentionTab === 'people' && (
              <div className="max-h-40 overflow-auto">
                {mentionCandidates.slice(0, 8).map((member, idx) => (
                  <button
                    key={member.userId}
                    type="button"
                    className={cn(
                      'w-full px-2.5 py-2 text-left text-xs flex items-center gap-2',
                      idx === mentionIndex ? 'bg-muted' : 'hover:bg-muted/70',
                    )}
                    onMouseEnter={() => setMentionIndex(idx)}
                    onClick={() => insertMention(member)}
                  >
                    <div className="h-6 w-6 rounded-full bg-brand-100 text-foreground text-[10px] font-semibold flex items-center justify-center">
                      {(member.displayName || member.email)[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{member.displayName || member.email}</div>
                      <div className="text-muted-foreground truncate">{member.email}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {mentionTab === 'tasks' && (
              <div className="max-h-40 overflow-auto">
                {taskMentionCandidates.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">No matching tasks.</div>
                ) : (
                  taskMentionCandidates.slice(0, 8).map((task, idx) => (
                    <button
                      key={task.id}
                      type="button"
                      className={cn(
                        'w-full px-2.5 py-2 text-left text-xs',
                        idx === mentionIndex ? 'bg-muted' : 'hover:bg-muted/70',
                      )}
                      onMouseEnter={() => setMentionIndex(idx)}
                      onClick={() => insertTaskMention(task)}
                    >
                      <div className="font-medium text-foreground truncate">#{task.title}</div>
                      <div className="text-muted-foreground truncate">{task.projectName ?? task.listName ?? 'Task'}</div>
                    </button>
                  ))
                )}
              </div>
            )}
            {mentionTab === 'docs' && (
              <div className="max-h-40 overflow-auto">
                {docMentionCandidates.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">No matching docs.</div>
                ) : (
                  docMentionCandidates.slice(0, 8).map((doc, idx) => (
                    <button
                      key={doc.id}
                      type="button"
                      className={cn(
                        'w-full px-2.5 py-2 text-left text-xs',
                        idx === mentionIndex ? 'bg-muted' : 'hover:bg-muted/70',
                      )}
                      onMouseEnter={() => setMentionIndex(idx)}
                      onClick={() => insertDocMention(doc)}
                    >
                      <div className="font-medium text-foreground truncate">Doc:{doc.title}</div>
                      <div className="text-muted-foreground truncate">{doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : 'Document'}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            onClick={() => create.mutate()}
            disabled={!text.trim() || create.isPending}
          >
            Comment
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

function ActivityPanel({ taskId }: { taskId: string }) {
  const activityQuery = useQuery({
    queryKey: ['task', taskId, 'activity'],
    queryFn: async () => {
      try {
        return await api<ActivityEntry[]>(`/tasks/${taskId}/activity`)
      } catch (err) {
        if (isNotWired(err)) return null
        throw err
      }
    },
  })

  if (activityQuery.data === null) {
    return <NotWiredNote>Activity feed is not available.</NotWiredNote>
  }

  const entries = activityQuery.data ?? []
  const actionLabel = (action: string) =>
    action
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  const iconForAction = (action: string) => {
    if (action.includes('assigned')) return '👤'
    if (action.includes('comment')) return '💬'
    if (action.includes('status')) return '🔁'
    if (action.includes('attachment')) return '📎'
    if (action.includes('checklist')) return '☑️'
    if (action.includes('created')) return '✨'
    if (action.includes('deleted')) return '🗑️'
    return '•'
  }

  if (entries.length === 0) {
    return <EmptyState title="No activity yet" hint="Changes will show up here." />
  }

  return (
    <ol className="relative border-l border-border pl-4 space-y-3">
      {entries.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-700" />
          <div className="text-sm">
            <span className="mr-1">{iconForAction(a.action)}</span>
            <span className="font-medium">
              {a.actor?.displayName ?? a.actor?.email ?? 'System'}
            </span>{' '}
            <span className="text-muted-foreground">{actionLabel(a.action)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(a.createdAt).toLocaleString()}
          </div>
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Time entries
// ---------------------------------------------------------------------------

function TimePanel({ taskId }: { taskId: string }) {
  const qc = useQueryClient()
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [manualDescription, setManualDescription] = useState('')
  const [quickMinutes, setQuickMinutes] = useState('')
  const [startDescription, setStartDescription] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())

  const entriesQuery = useQuery({
    queryKey: ['task', taskId, 'time'],
    queryFn: async () => {
      try {
        return await api<TimeEntry[]>(`/tasks/${taskId}/time-entries`)
      } catch (err) {
        if (isNotWired(err)) return null
        throw err
      }
    },
  })

  const running = useMemo(
    () => entriesQuery.data?.find((e) => e.endedAt === null) ?? null,
    [entriesQuery.data],
  )
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])

  const start = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/time-entries/start`, {
        method: 'POST',
        body: JSON.stringify({ description: startDescription.trim() || undefined }),
      }),
    onSuccess: async () => {
      setStartDescription('')
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'time'] })
    },
  })

  const stop = useMutation({
    mutationFn: (entryId: string) =>
      api(`/tasks/${taskId}/time-entries/stop/${entryId}`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'time'] })
    },
  })

  const addManual = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/time-entries/manual`, {
        method: 'POST',
        body: JSON.stringify({
          startedAt: new Date(manualStart).toISOString(),
          endedAt: new Date(manualEnd).toISOString(),
          description: manualDescription.trim() || undefined,
          isBillable: false,
        }),
      }),
    onSuccess: async () => {
      setManualStart('')
      setManualEnd('')
      setManualDescription('')
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'time'] })
    },
  })

  const addQuickDuration = useMutation({
    mutationFn: () => {
      const mins = Number(quickMinutes)
      const now = Date.now()
      const startedAt = new Date(now - Math.max(1, mins) * 60_000)
      const endedAt = new Date(now)
      return api(`/tasks/${taskId}/time-entries/manual`, {
        method: 'POST',
        body: JSON.stringify({
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          description: manualDescription.trim() || `Quick log (${mins}m)`,
          isBillable: false,
        }),
      })
    },
    onSuccess: async () => {
      setQuickMinutes('')
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'time'] })
    },
  })

  const entries = entriesQuery.data ?? []
  const totalTrackedMs = useMemo(() => {
    return entries.reduce((sum, entry) => {
      if (typeof entry.duration === 'number' && entry.duration > 0) return sum + entry.duration
      if (!entry.endedAt) return sum
      return sum + Math.max(0, new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime())
    }, 0)
  }, [entries])
  if (entriesQuery.data === null) {
    return <NotWiredNote>Time tracking is not available.</NotWiredNote>
  }
  const manualRangeValid =
    !!manualStart &&
    !!manualEnd &&
    !Number.isNaN(new Date(manualStart).getTime()) &&
    !Number.isNaN(new Date(manualEnd).getTime()) &&
    new Date(manualEnd).getTime() > new Date(manualStart).getTime()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
        <div className="text-sm">
          {running ? (
            <>
              <span className="font-medium">Timer running</span>{' '}
              <span className="text-muted-foreground">
                since {new Date(running.startedAt).toLocaleTimeString()} · elapsed {formatDuration(nowMs - new Date(running.startedAt).getTime())}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">No timer running</span>
          )}
        </div>
        {running ? (
          <Button size="sm" variant="destructive" onClick={() => stop.mutate(running.id)}>
            Stop
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              value={startDescription}
              onChange={(e) => setStartDescription(e.target.value)}
              placeholder="What are you working on?"
              className="h-8 w-[220px]"
            />
            <Button size="sm" onClick={() => start.mutate()} disabled={start.isPending}>
              Start timer
            </Button>
          </div>
        )}
      </div>
      <div className="rounded-md border border-border/70 bg-card px-3 py-2 text-sm flex items-center justify-between">
        <span className="text-muted-foreground">Total tracked</span>
        <span className="font-mono font-medium">{formatDuration(totalTrackedMs)}</span>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="No time logged yet" hint="Start a timer to begin tracking." />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">
                  {e.description?.trim() ? e.description : 'Time entry'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(e.startedAt).toLocaleString()} →{' '}
                  {e.endedAt ? new Date(e.endedAt).toLocaleTimeString() : 'running'}
                </div>
              </div>
              <div className="text-sm font-mono">
                {formatDuration(
                  e.duration ??
                    (e.endedAt
                      ? new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()
                      : null),
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Add manual entry</div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <div className="text-[11px] text-muted-foreground mb-1">Quick log (minutes)</div>
            <Input
              type="number"
              min={1}
              value={quickMinutes}
              onChange={(e) => setQuickMinutes(e.target.value)}
              placeholder="e.g. 30"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => addQuickDuration.mutate()}
            disabled={!quickMinutes || Number(quickMinutes) <= 0 || addQuickDuration.isPending}
          >
            Add minutes
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input
            type="datetime-local"
            value={manualStart}
            onChange={(e) => setManualStart(e.target.value)}
          />
          <Input
            type="datetime-local"
            value={manualEnd}
            onChange={(e) => setManualEnd(e.target.value)}
          />
        </div>
        <Input
          value={manualDescription}
          onChange={(e) => setManualDescription(e.target.value)}
          placeholder="Description (optional)"
        />
        {!manualRangeValid && (manualStart || manualEnd) && (
          <div className="text-xs text-amber-600">
            End time must be after start time.
          </div>
        )}
        {addManual.isError && (
          <div className="text-xs text-rose-600">
            Couldn&apos;t add manual entry. Please verify dates and try again.
          </div>
        )}
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => addManual.mutate()}
            disabled={!manualRangeValid || addManual.isPending}
          >
            Add time entry
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------

type CustomFieldDef = {
  id: string
  projectId: string
  name: string
  type: 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url'
  isRequired: boolean
  options: Array<{ label: string; value: string; color?: string }> | null
}

type CustomFieldRow = {
  definition: CustomFieldDef
  value: string | number | boolean | null
}

function CustomFieldsPanel({
  taskId,
  workspaceId,
}: {
  taskId: string
  workspaceId?: string
}) {
  if (!workspaceId) {
    return <NotWiredNote>Custom fields require workspace context.</NotWiredNote>
  }
  return <CustomFieldsPanelInner taskId={taskId} workspaceId={workspaceId} />
}

function CustomFieldsPanelInner({
  taskId,
  workspaceId,
}: {
  taskId: string
  workspaceId: string
}) {
  const qc = useQueryClient()

  const fieldsQuery = useQuery({
    queryKey: ['custom-fields', workspaceId, taskId],
    queryFn: () =>
      api<CustomFieldRow[]>(`/workspaces/${workspaceId}/tasks/${taskId}/custom-fields`),
  })

  const setValue = useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: string; value: string | number | boolean | null }) =>
      api(`/workspaces/${workspaceId}/tasks/${taskId}/custom-fields/${fieldId}`, {
        method: 'PUT',
        body: { value },
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['custom-fields', workspaceId, taskId] }),
  })

  if (fieldsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading custom fields…</p>
  }

  const fields = fieldsQuery.data ?? []
  if (fields.length === 0) {
    return (
      <EmptyState
        title="No custom fields yet"
        hint="Add fields at the project level — they'll appear here for every task."
      />
    )
  }

  return (
    <div className="space-y-3">
      {fields.map(({ definition, value }) => (
        <div key={definition.id}>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
            {definition.name}
            {definition.isRequired && <span className="text-destructive">*</span>}
            <span className="ml-auto text-[10px] opacity-70">{definition.type}</span>
          </div>
          <CustomFieldEditor
            definition={definition}
            value={value}
            disabled={setValue.isPending}
            onCommit={(next) => setValue.mutate({ fieldId: definition.id, value: next })}
          />
        </div>
      ))}
    </div>
  )
}

function CustomFieldEditor({
  definition,
  value,
  disabled,
  onCommit,
}: {
  definition: CustomFieldDef
  value: string | number | boolean | null
  disabled?: boolean
  onCommit: (next: string | number | boolean | null) => void
}) {
  const [draft, setDraft] = useState<string>(() => {
    if (value == null) return ''
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return String(value)
  })

  switch (definition.type) {
    case 'text':
    case 'url':
      return (
        <Input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(draft.trim() === '' ? null : draft)}
          placeholder={definition.type === 'url' ? 'https://...' : ''}
        />
      )
    case 'number':
      return (
        <Input
          type="number"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(draft === '' ? null : Number(draft))}
        />
      )
    case 'date':
      return (
        <Input
          type="date"
          value={typeof value === 'string' ? value.slice(0, 10) : ''}
          disabled={disabled}
          onChange={(e) => onCommit(e.target.value || null)}
        />
      )
    case 'checkbox':
      return (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onCommit(!value)}
          className={cn(
            'h-5 w-5 rounded border-2 inline-flex items-center justify-center transition-colors',
            value ? 'bg-primary border-primary text-primary-foreground' : 'border-border',
          )}
        >
          {value ? '✓' : ''}
        </button>
      )
    case 'dropdown': {
      const opts = definition.options ?? []
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e) => onCommit(e.target.value || null)}
          className="text-sm rounded-md border border-input bg-transparent px-2 py-1.5 w-full"
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    }
  }
}
