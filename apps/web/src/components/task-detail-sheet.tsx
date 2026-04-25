import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { useMemo, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../store/auth'

type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'cancelled'

type UserLite = { id: string; displayName?: string | null; email?: string | null }

type Subtask = {
  id: string
  title: string
  priority: TaskPriority
  status: TaskStatus
  isArchived?: boolean
}

type ChecklistItem = { id: string; content: string; isDone: boolean }
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
  author?: UserLite | null
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

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
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
}: {
  taskId: string | null
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  const enabled = Boolean(taskId && open)
  const detailQuery = useQuery({
    enabled,
    queryKey: ['task', taskId],
    queryFn: () => api<TaskDetail>(`/tasks/${taskId}`),
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl w-full overflow-y-auto">
        {!taskId ? null : detailQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading task…</p>
        ) : detailQuery.data ? (
          <>
            <SheetHeader className="pb-3">
              <SheetTitle className="text-xl">{detailQuery.data.title}</SheetTitle>
              <SheetDescription className="sr-only">Task details</SheetDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="secondary">{detailQuery.data.status}</Badge>
                <Badge
                  variant="outline"
                  className={cn('capitalize', priorityColor(detailQuery.data.priority))}
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
            <div className="flex gap-4 overflow-x-auto border-b border-border -mx-6 px-6">
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
                        ? 'border-b-2 border-brand-700 text-brand-900 font-medium -mb-px'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>

            <div className="pt-4">
              {activeTab === 'overview' && <OverviewPanel detail={detailQuery.data} />}
              {activeTab === 'subtasks' && (
                <SubtasksPanel taskId={detailQuery.data.id} inline={detailQuery.data.subtasks ?? []} />
              )}
              {activeTab === 'checklists' && (
                <ChecklistsPanel taskId={detailQuery.data.id} checklists={detailQuery.data.checklists ?? []} />
              )}
              {activeTab === 'watchers' && (
                <WatchersPanel taskId={detailQuery.data.id} inline={detailQuery.data.watchers ?? []} />
              )}
              {activeTab === 'dependencies' && (
                <DependenciesPanel taskId={detailQuery.data.id} inline={detailQuery.data.dependencies ?? []} />
              )}
              {activeTab === 'attachments' && (
                <AttachmentsPanel taskId={detailQuery.data.id} inline={detailQuery.data.attachments ?? []} />
              )}
              {activeTab === 'comments' && <CommentsPanel taskId={detailQuery.data.id} />}
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

function OverviewPanel({ detail }: { detail: TaskDetail }) {
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
              <Badge key={a.user.id} variant="secondary">
                {a.user.displayName ?? a.user.email ?? 'User'}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Unassigned</span>
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

function SubtasksPanel({ taskId, inline }: { taskId: string; inline: Subtask[] }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')

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
        body: JSON.stringify({ title, parentTaskId: taskId, listId: undefined }),
      }),
    onSuccess: async () => {
      setTitle('')
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
              <span
                className={cn(
                  'flex-1 text-sm truncate',
                  s.status === 'done' && 'line-through text-muted-foreground',
                )}
              >
                {s.title}
              </span>
              <Badge variant="outline" className={cn('capitalize text-xs', priorityColor(s.priority))}>
                {s.priority}
              </Badge>
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
          Couldn&apos;t create subtask — parent list context may be required.
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
        body: JSON.stringify({ content: itemText }),
      })
    },
    onSuccess: async () => {
      setItemText('')
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

  return (
    <div className="space-y-3">
      {checklists.length === 0 ? (
        <EmptyState title="No checklists yet" hint="Add an item below to create one." />
      ) : (
        checklists.map((cl) => (
          <div key={cl.id} className="rounded-md border border-border">
            <div className="border-b border-border px-3 py-2 text-sm font-medium">{cl.title}</div>
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
                    <span
                      className={cn(
                        'text-sm',
                        item.isDone && 'line-through text-muted-foreground',
                      )}
                    >
                      {item.content}
                    </span>
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

function WatchersPanel({ taskId, inline }: { taskId: string; inline: Watcher[] }) {
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const isWatching = useMemo(
    () => (currentUser ? inline.some((w) => w.userId === currentUser.id) : false),
    [inline, currentUser],
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

      {inline.length === 0 ? (
        <EmptyState title="Nobody is watching yet" hint="Watchers get notified on updates." />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {inline.map((w) => (
            <li key={w.userId} className="flex items-center gap-3 px-3 py-2">
              <div className="h-7 w-7 rounded-full bg-brand-100 text-brand-900 flex items-center justify-center text-xs font-medium">
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

function DependenciesPanel({ taskId, inline }: { taskId: string; inline: Dependency[] }) {
  const qc = useQueryClient()
  const [relatedId, setRelatedId] = useState('')
  const [type, setType] = useState<'blocks' | 'blocked_by' | 'related_to'>('blocks')

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
      <DepGroup label="Blocking" items={blocking} onRemove={(id) => remove.mutate(id)} />
      <DepGroup label="Waiting on" items={waitingOn} onRemove={(id) => remove.mutate(id)} />
      {related.length > 0 ? (
        <DepGroup label="Related" items={related} onRemove={(id) => remove.mutate(id)} />
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
        <Button type="submit" size="sm" disabled={!relatedId.trim() || add.isPending}>
          Add
        </Button>
      </form>
    </div>
  )
}

function DepGroup({
  label,
  items,
  onRemove,
}: {
  label: string
  items: Dependency[]
  onRemove: (depId: string) => void
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
          <div className="mt-2 text-xs">Upload endpoint not wired yet.</div>
        ) : null}
      </div>

      {attachments.length === 0 ? (
        <EmptyState title="No files attached" hint="Drop files above to get started." />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded bg-brand-100 text-brand-900 text-xs font-medium">
                {(a.mimeType ?? a.fileName.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{a.fileName}</div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(a.fileSize)}
                  {a.uploadedBy ? ` · ${a.uploadedBy}` : ''}
                </div>
              </div>
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

function CommentsPanel({ taskId }: { taskId: string }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')

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
        body: JSON.stringify({ body: text }),
      }),
    onSuccess: async () => {
      setText('')
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'activity'] })
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

  if (commentsQuery.data === null) {
    return <NotWiredNote>Comments endpoint is not available.</NotWiredNote>
  }

  const comments = commentsQuery.data ?? []

  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <EmptyState title="No comments yet" hint="Be the first to leave a note." />
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border border-border p-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">
                  {c.author?.displayName ?? c.author?.email ?? 'User'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="mt-1 text-sm whitespace-pre-wrap">{c.body}</div>
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
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-border pt-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment… use @ to mention"
          rows={3}
        />
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

  if (entries.length === 0) {
    return <EmptyState title="No activity yet" hint="Changes will show up here." />
  }

  return (
    <ol className="relative border-l border-border pl-4 space-y-3">
      {entries.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-700" />
          <div className="text-sm">
            <span className="font-medium">
              {a.actor?.displayName ?? a.actor?.email ?? 'System'}
            </span>{' '}
            <span className="text-muted-foreground">{a.action}</span>
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

  const start = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/time-entries/start`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
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

  if (entriesQuery.data === null) {
    return <NotWiredNote>Time tracking is not available.</NotWiredNote>
  }

  const entries = entriesQuery.data ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
        <div className="text-sm">
          {running ? (
            <>
              <span className="font-medium">Timer running</span>{' '}
              <span className="text-muted-foreground">
                since {new Date(running.startedAt).toLocaleTimeString()}
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
          <Button size="sm" onClick={() => start.mutate()} disabled={start.isPending}>
            Start timer
          </Button>
        )}
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
    </div>
  )
}
