import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  toast,
  cn,
} from '@rundesk/ui'
import { FileText, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'

type TaskTemplate = {
  id: string
  workspaceId: string
  name: string
  description: string | null
  icon: string | null
  payload: {
    title: string
    description: string | null
    priority: string
    timeEstimate: number | null
    startDateOffsetDays: number | null
    dueDateOffsetDays: number | null
    labels: string[]
    checklists: Array<{ title: string; items: Array<{ content: string }> }>
    subtasks: Array<{ title: string }>
    customFieldValues: Array<{ fieldName: string; value: any }>
  }
  usageCount: number
  createdAt: string
  updatedAt: string
}

type Space = { id: string; name: string }
type Project = { id: string; name: string }
type ListRow = { id: string; name: string }

/**
 * Real, workspace-scoped task templates section. Displays templates
 * from the API and offers Apply / Edit / Delete actions. Lives on the
 * Templates page alongside the existing built-in catalog so users can
 * see their own saves in the same place.
 */
export function TaskTemplatesSection({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<TaskTemplate | null>(null)
  const [applyTarget, setApplyTarget] = useState<TaskTemplate | null>(null)

  const templatesQuery = useQuery({
    queryKey: ['task-templates', workspaceId],
    queryFn: () => api<TaskTemplate[]>(`/workspaces/${workspaceId}/task-templates`),
  })

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/workspaces/${workspaceId}/task-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Template deleted')
      qc.invalidateQueries({ queryKey: ['task-templates', workspaceId] })
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete template'),
  })

  if (templatesQuery.isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Loading your task templates…</Card>
  }

  const templates = templatesQuery.data ?? []

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Your task templates
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Templates you’ve saved from tasks. Click apply to drop them into any list.
          </p>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {templates.length}
        </Badge>
      </div>

      {templates.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          No saved task templates yet. Open any task and click <em>Save as template</em> to capture
          its title, description, checklists, subtasks, labels, and custom fields for reuse.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <Card key={t.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{t.name}</div>
                  {t.description && (
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {t.description}
                    </div>
                  )}
                </div>
                {t.usageCount > 0 && (
                  <Badge variant="soft" className="text-[10px] shrink-0">
                    {t.usageCount} uses
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                <Badge variant="outline" className="capitalize">
                  {t.payload.priority}
                </Badge>
                {t.payload.subtasks.length > 0 && (
                  <Badge variant="outline">{t.payload.subtasks.length} subtasks</Badge>
                )}
                {t.payload.checklists.length > 0 && (
                  <Badge variant="outline">
                    {t.payload.checklists.reduce((sum, c) => sum + c.items.length, 0)} checklist
                  </Badge>
                )}
                {t.payload.labels.length > 0 && (
                  <Badge variant="outline">{t.payload.labels.length} labels</Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-border/40">
                <Button size="sm" onClick={() => setApplyTarget(t)} className="flex-1">
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  Apply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)} title="Rename">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(`Delete template "${t.name}"?`)) remove.mutate(t.id)
                  }}
                  className="text-destructive hover:bg-destructive/10"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <EditTemplateDialog
        workspaceId={workspaceId}
        template={editing}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['task-templates', workspaceId] })}
      />
      <ApplyTemplateDialog
        workspaceId={workspaceId}
        template={applyTarget}
        onClose={() => setApplyTarget(null)}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------

function EditTemplateDialog({
  workspaceId,
  template,
  onClose,
  onSaved,
}: {
  workspaceId: string
  template: TaskTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (template) {
      setName(template.name)
      setDescription(template.description ?? '')
    }
  }, [template])

  const save = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/task-templates/${template!.id}`, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          description: description.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success('Template updated')
      onSaved()
      onClose()
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to update template'),
  })

  return (
    <Dialog open={Boolean(template)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit template</DialogTitle>
          <DialogDescription>
            Update the template’s name and description. The captured payload (title, checklists,
            subtasks, custom fields) stays untouched.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!name.trim() || save.isPending}
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------

function ApplyTemplateDialog({
  workspaceId,
  template,
  onClose,
}: {
  workspaceId: string
  template: TaskTemplate | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [spaceId, setSpaceId] = useState<string>('')
  const [projectId, setProjectId] = useState<string>('')
  const [listId, setListId] = useState<string>('')
  const [titleOverride, setTitleOverride] = useState('')

  useEffect(() => {
    if (template) setTitleOverride('')
    if (!template) {
      setSpaceId('')
      setProjectId('')
      setListId('')
    }
  }, [template])

  const spacesQuery = useQuery({
    queryKey: ['spaces-for-template-apply', workspaceId],
    queryFn: () => api<Space[]>(`/spaces/workspace/${workspaceId}`),
    enabled: Boolean(template),
  })

  const projectsQuery = useQuery({
    queryKey: ['projects-for-template-apply', spaceId],
    queryFn: () => api<Project[]>(`/spaces/${spaceId}/projects`),
    enabled: Boolean(spaceId),
  })

  const listsQuery = useQuery({
    queryKey: ['lists-for-template-apply', projectId],
    queryFn: () => api<ListRow[]>(`/projects/${projectId}/lists`),
    enabled: Boolean(projectId),
  })

  const apply = useMutation({
    mutationFn: () =>
      api<{ taskId: string }>(
        `/workspaces/${workspaceId}/task-templates/${template!.id}/instantiate`,
        {
          method: 'POST',
          body: { listId, titleOverride: titleOverride.trim() || undefined },
        },
      ),
    onSuccess: () => {
      toast.success('Task created from template')
      qc.invalidateQueries({ queryKey: ['task-templates', workspaceId] })
      // Conservative invalidation — re-fetch any list view that might
      // hold the new task. The list/board/calendar views all use
      // queries keyed by listId so this catches every variant.
      qc.invalidateQueries({ predicate: (q) => q.queryKey.includes(listId) })
      onClose()
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to apply template'),
  })

  const lists = listsQuery.data ?? []

  return (
    <Dialog open={Boolean(template)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply template: {template?.name}</DialogTitle>
          <DialogDescription>
            Pick a destination list. The template will create a task with all captured subtasks,
            checklists, labels, and custom-field values.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Space</Label>
              <select
                value={spaceId}
                onChange={(e) => {
                  setSpaceId(e.target.value)
                  setProjectId('')
                  setListId('')
                }}
                className={cn(
                  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm',
                )}
              >
                <option value="">Select…</option>
                {spacesQuery.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Project</Label>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value)
                  setListId('')
                }}
                disabled={!spaceId}
                className={cn(
                  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm',
                )}
              >
                <option value="">Select…</option>
                {projectsQuery.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">List</Label>
              <select
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                disabled={!projectId}
                className={cn(
                  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm',
                )}
              >
                <option value="">Select…</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Task title (optional override)</Label>
            <Input
              placeholder={template?.payload.title || 'Use template title'}
              value={titleOverride}
              onChange={(e) => setTitleOverride(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => apply.mutate()} disabled={!listId || apply.isPending}>
              {apply.isPending ? 'Applying…' : 'Apply'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------

/**
 * Compact dialog used from the task detail sheet to capture a task as
 * a new template. Exported separately so the detail sheet can compose
 * it without pulling in the entire section above.
 */
export function SaveTaskAsTemplateDialog({
  workspaceId,
  taskId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  taskId: string
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
    }
  }, [open])

  const save = useMutation({
    mutationFn: () =>
      api<TaskTemplate>(
        `/workspaces/${workspaceId}/task-templates/from-task/${taskId}`,
        {
          method: 'POST',
          body: { name: name.trim(), description: description.trim() || null },
        },
      ),
    onSuccess: () => {
      toast.success('Task saved as template')
      qc.invalidateQueries({ queryKey: ['task-templates', workspaceId] })
      onOpenChange(false)
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to save template'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as task template</DialogTitle>
          <DialogDescription>
            Capture this task — title, description, priority, checklists, subtasks, labels, and
            custom-field values — as a reusable template for this workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Template name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bug report intake"
              autoFocus
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="When should teammates use this template?"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save template'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Tiny inline button that opens the SaveTaskAsTemplateDialog. Use from
 * the task detail header.
 */
export function SaveAsTemplateButton({
  workspaceId,
  taskId,
}: {
  workspaceId?: string
  taskId: string
}) {
  const [open, setOpen] = useState(false)
  if (!workspaceId) return null
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="Save as template">
        <Plus className="h-3.5 w-3.5 mr-1" />
        Save as template
      </Button>
      <SaveTaskAsTemplateDialog
        workspaceId={workspaceId}
        taskId={taskId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
