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
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { InlineSkeleton } from './loading-skeletons'

/**
 * Maps a stored priority identifier to its display label key. The raw value is
 * the canonical persisted identifier; only the shown label is localized.
 */
const TEMPLATE_PRIORITY_LABEL_KEYS: Record<string, TranslationKey> = {
  urgent: 'taskTemplates.priority.urgent',
  high: 'taskTemplates.priority.high',
  normal: 'taskTemplates.priority.normal',
  low: 'taskTemplates.priority.low',
}

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
  const { t, tCount } = useTranslation()
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
      toast.success(t('taskTemplates.deleted'))
      qc.invalidateQueries({ queryKey: ['task-templates', workspaceId] })
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('taskTemplates.deleteFailed')),
  })

  if (templatesQuery.isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground"><InlineSkeleton /></Card>
  }

  const templates = templatesQuery.data ?? []

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {t('taskTemplates.heading')}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('taskTemplates.subtitle')}
          </p>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {templates.length}
        </Badge>
      </div>

      {templates.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {t('taskTemplates.emptyBody')}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((tpl) => (
            <Card key={tpl.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{tpl.name}</div>
                  {tpl.description && (
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {tpl.description}
                    </div>
                  )}
                </div>
                {tpl.usageCount > 0 && (
                  <Badge variant="soft" className="text-[10px] shrink-0">
                    {tCount('taskTemplates.usesCount', tpl.usageCount)}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                <Badge variant="outline" className="capitalize">
                  {TEMPLATE_PRIORITY_LABEL_KEYS[tpl.payload.priority]
                    ? t(TEMPLATE_PRIORITY_LABEL_KEYS[tpl.payload.priority])
                    : tpl.payload.priority}
                </Badge>
                {tpl.payload.subtasks.length > 0 && (
                  <Badge variant="outline">{tCount('taskTemplates.subtasksCount', tpl.payload.subtasks.length)}</Badge>
                )}
                {tpl.payload.checklists.length > 0 && (
                  <Badge variant="outline">
                    {tCount('taskTemplates.checklistItems', tpl.payload.checklists.reduce((sum, c) => sum + c.items.length, 0))}
                  </Badge>
                )}
                {tpl.payload.labels.length > 0 && (
                  <Badge variant="outline">{tCount('taskTemplates.labelsCount', tpl.payload.labels.length)}</Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-border/40">
                <Button size="sm" onClick={() => setApplyTarget(tpl)} className="flex-1">
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  {t('taskTemplates.apply')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(tpl)} title={t('taskTemplates.rename')}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(t('taskTemplates.confirmDelete', { name: tpl.name }))) remove.mutate(tpl.id)
                  }}
                  className="text-destructive hover:bg-destructive/10"
                  title={t('common.delete')}
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
  const { t } = useTranslation()
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
      toast.success(t('taskTemplates.updated'))
      onSaved()
      onClose()
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('taskTemplates.updateFailed')),
  })

  return (
    <Dialog open={Boolean(template)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('taskTemplates.editTitle')}</DialogTitle>
          <DialogDescription>
            {t('taskTemplates.editDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t('taskTemplates.nameLabel')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>{t('taskTemplates.descriptionOptional')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!name.trim() || save.isPending}
            >
              {save.isPending ? t('common.saving') : t('common.save')}
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
  const { t } = useTranslation()
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
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}`),
    enabled: Boolean(spaceId),
  })

  const listsQuery = useQuery({
    queryKey: ['lists-for-template-apply', projectId],
    queryFn: () => api<ListRow[]>(`/lists/project/${projectId}`),
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
      toast.success(t('taskTemplates.taskCreated'))
      qc.invalidateQueries({ queryKey: ['task-templates', workspaceId] })
      // Conservative invalidation — re-fetch any list view that might
      // hold the new task. The list/board/calendar views all use
      // queries keyed by listId so this catches every variant.
      qc.invalidateQueries({ predicate: (q) => q.queryKey.includes(listId) })
      onClose()
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('taskTemplates.applyFailed')),
  })

  const lists = listsQuery.data ?? []

  return (
    <Dialog open={Boolean(template)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('taskTemplates.applyTitle', { name: template?.name ?? '' })}</DialogTitle>
          <DialogDescription>
            {t('taskTemplates.applyDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">{t('taskTemplates.spaceLabel')}</Label>
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
                <option value="">{t('taskTemplates.selectPlaceholder')}</option>
                {spacesQuery.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">{t('taskTemplates.projectLabel')}</Label>
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
                <option value="">{t('taskTemplates.selectPlaceholder')}</option>
                {projectsQuery.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">{t('taskTemplates.listLabel')}</Label>
              <select
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                disabled={!projectId}
                className={cn(
                  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm',
                )}
              >
                <option value="">{t('taskTemplates.selectPlaceholder')}</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label className="text-xs">{t('taskTemplates.titleOverrideLabel')}</Label>
            <Input
              placeholder={template?.payload.title || t('taskTemplates.useTemplateTitle')}
              value={titleOverride}
              onChange={(e) => setTitleOverride(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => apply.mutate()} disabled={!listId || apply.isPending}>
              {apply.isPending ? t('taskTemplates.applying') : t('taskTemplates.apply')}
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
  const { t } = useTranslation()
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
      toast.success(t('taskTemplates.savedAsTemplate'))
      qc.invalidateQueries({ queryKey: ['task-templates', workspaceId] })
      onOpenChange(false)
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('taskTemplates.saveFailed')),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('taskTemplates.saveTitle')}</DialogTitle>
          <DialogDescription>
            {t('taskTemplates.saveDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t('taskTemplates.templateNameLabel')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('taskTemplates.namePlaceholder')}
              autoFocus
            />
          </div>
          <div>
            <Label>{t('taskTemplates.descriptionOptional')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t('taskTemplates.descriptionPlaceholder')}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
              {save.isPending ? t('common.saving') : t('taskTemplates.saveTemplate')}
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
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!workspaceId) return null
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title={t('taskTemplates.saveAsTemplate')}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        {t('taskTemplates.saveAsTemplate')}
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
