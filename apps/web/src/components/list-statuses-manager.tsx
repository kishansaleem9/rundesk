import { useState, type DragEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GripVertical, Plus, Trash2, X } from 'lucide-react'
import { Button, Input, Dialog, DialogContent, DialogHeader, DialogTitle, cn } from '@rundesk/ui'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type StatusCategory = 'open' | 'in_progress' | 'closed'

type StatusScope = 'list' | 'project' | 'space'

type ListStatus = {
  id: string
  listId: string
  key: string
  name: string
  color: string
  category: StatusCategory
  position: number
  scope?: StatusScope
}

const PRESET_COLORS = [
  '#94a3b8', '#64748b', '#3b82f6', '#06b6d4', '#10b981',
  '#a855f7', '#ec4899', '#f59e0b', '#ef4444', '#f43f5e',
]

// Category display maps to i18n catalog entries; the raw category key
// ('open' | 'in_progress' | 'closed') stays the value persisted to the API.
const CATEGORY_LABEL_KEYS: Record<StatusCategory, TranslationKey> = {
  open: 'listStatuses.category.open',
  in_progress: 'listStatuses.category.inProgress',
  closed: 'listStatuses.category.closed',
}

/** Manage a List's own status pipeline (read-only when it inherits a template). */
export function ListStatusesManager({
  listId,
  open,
  onOpenChange,
}: {
  listId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <StatusPipelineManager
      open={open}
      onOpenChange={onOpenChange}
      basePath={`/lists/${listId}/statuses`}
      queryKey={['list-statuses', listId]}
      extraInvalidateKeys={[['tasks', listId]]}
      title={t('listStatuses.manageTitle')}
      supportsScope
      listIdForScope={listId}
    />
  )
}

/** Manage a Space/Project shared status template. */
export function ScopedStatusesManager({
  scope,
  containerId,
  containerName,
  open,
  onOpenChange,
}: {
  scope: 'space' | 'project'
  containerId: string
  containerName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const target = containerName
    ? `“${containerName}”`
    : t(scope === 'space' ? 'listStatuses.thisSpace' : 'listStatuses.thisProject')
  return (
    <StatusPipelineManager
      open={open}
      onOpenChange={onOpenChange}
      basePath={`/${scope}s/${containerId}/statuses`}
      queryKey={[`${scope}-statuses`, containerId]}
      title={t(scope === 'space' ? 'listStatuses.spaceStatuses' : 'listStatuses.projectStatuses')}
      subtitle={t(scope === 'space' ? 'listStatuses.sharedSetSpace' : 'listStatuses.sharedSetProject', { target })}
    />
  )
}

function StatusPipelineManager({
  basePath,
  queryKey,
  extraInvalidateKeys = [],
  title,
  subtitle,
  supportsScope = false,
  listIdForScope,
  open,
  onOpenChange,
}: {
  basePath: string
  queryKey: unknown[]
  extraInvalidateKeys?: unknown[][]
  title: string
  subtitle?: string
  supportsScope?: boolean
  listIdForScope?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: statuses = [] } = useQuery({
    queryKey,
    queryFn: () => api<ListStatus[]>(basePath),
    enabled: open,
  })

  const [reassignFor, setReassignFor] = useState<{ id: string; name: string } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey })
    for (const k of extraInvalidateKeys) void qc.invalidateQueries({ queryKey: k })
  }

  const createStatus = useMutation({
    mutationFn: (input: { name: string; color: string; category: StatusCategory }) =>
      api(`${basePath}`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })

  const updateStatus = useMutation({
    mutationFn: ({ statusId, patch }: { statusId: string; patch: Partial<ListStatus> }) =>
      api(`${basePath}/${statusId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: invalidate,
  })

  const reorderStatuses = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api(`${basePath}/reorder`, { method: 'POST', body: { orderedIds } }),
    onSuccess: invalidate,
  })

  const scope: StatusScope = supportsScope ? statuses[0]?.scope ?? 'list' : 'list'
  const inherited = scope !== 'list'
  const sortedStatuses = statuses.slice().sort((a, b) => a.position - b.position)

  const switchScope = useMutation({
    mutationFn: (nextScope: StatusScope) =>
      api(`/lists/${listIdForScope}/status-scope`, { method: 'PATCH', body: { scope: nextScope } }),
    onSuccess: invalidate,
    onError: (err: any) => window.alert(err?.message ?? t('listStatuses.changeSourceError')),
  })
  const handleDropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      return
    }
    const ids = sortedStatuses.map((s) => s.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) {
      setDragId(null)
      return
    }
    ids.splice(to, 0, ids.splice(from, 1)[0])
    reorderStatuses.mutate(ids)
    setDragId(null)
  }

  const deleteStatus = useMutation({
    mutationFn: ({ statusId, reassignToStatusId }: { statusId: string; reassignToStatusId?: string }) =>
      api(
        `${basePath}/${statusId}${reassignToStatusId ? `?reassignToStatusId=${reassignToStatusId}` : ''}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      setReassignFor(null)
      invalidate()
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {inherited ? (
            <p className="text-sm rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
              {t('listStatuses.inheritedNotice', {
                scope: t(scope === 'space' ? 'listStatuses.space' : 'listStatuses.project'),
              })}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {subtitle ?? t('listStatuses.defaultSubtitle')}
            </p>
          )}

          {listIdForScope && (
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <span className="font-medium text-foreground">{t('listStatuses.statusSource')}</span>
              <select
                value={scope}
                disabled={switchScope.isPending}
                onChange={(e) => switchScope.mutate(e.target.value as StatusScope)}
                className="h-8 rounded-md border border-border/80 bg-background px-2 text-[13px]"
              >
                <option value="list">{t('listStatuses.sourceThisList')}</option>
                <option value="project">{t('listStatuses.sourceProjectTemplate')}</option>
                <option value="space">{t('listStatuses.sourceSpaceTemplate')}</option>
              </select>
              {switchScope.isPending && <span className="text-xs">{t('listStatuses.switching')}</span>}
            </label>
          )}

          <div className="space-y-2">
            {sortedStatuses
              .map((status) => (
                <StatusRow
                  key={status.id}
                  status={status}
                  readOnly={inherited}
                  isDragging={dragId === status.id}
                  onDragStart={inherited ? undefined : () => setDragId(status.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropOn(status.id)}
                  onDragEnd={() => setDragId(null)}
                  onPatch={(patch) => updateStatus.mutate({ statusId: status.id, patch })}
                  onDelete={() => deleteStatus.mutate({ statusId: status.id }, {
                    onError: (err: any) => {
                      // 400 means there are still tasks referencing this status
                      // — surface the reassignment picker.
                      if (typeof err?.message === 'string' && err.message.includes('still use it')) {
                        setReassignFor({ id: status.id, name: status.name })
                      }
                    },
                  })}
                />
              ))}
          </div>

          {!inherited && (
            <AddStatusForm
              onAdd={(input) => createStatus.mutate(input)}
              isPending={createStatus.isPending}
            />
          )}
        </div>

        {reassignFor && (
          <ReassignDialog
            open
            sourceName={reassignFor.name}
            options={statuses.filter((s) => s.id !== reassignFor.id)}
            onCancel={() => setReassignFor(null)}
            onConfirm={(toId) =>
              deleteStatus.mutate({ statusId: reassignFor.id, reassignToStatusId: toId })
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function StatusRow({
  status,
  onPatch,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  readOnly = false,
}: {
  status: ListStatus
  onPatch: (patch: Partial<ListStatus>) => void
  onDelete: () => void
  onDragStart?: () => void
  onDragOver?: (e: DragEvent) => void
  onDrop?: () => void
  onDragEnd?: () => void
  isDragging?: boolean
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(status.name)
  return (
    <div
      draggable={Boolean(onDragStart) && !readOnly}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        'flex items-center gap-2 rounded-md border border-border/70 bg-card px-2 py-1.5',
        isDragging && 'opacity-50',
      )}
    >
      {readOnly ? (
        <span className="h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <GripVertical className="h-4 w-4 text-muted-foreground/60 shrink-0 cursor-grab active:cursor-grabbing" />
      )}
      {readOnly ? (
        <span className="h-5 w-5 rounded-full border border-border/70 shrink-0" style={{ backgroundColor: status.color }} />
      ) : (
        <ColorSwatch color={status.color} onChange={(color) => onPatch({ color })} />
      )}
      {readOnly ? (
        <span className="h-8 flex items-center text-sm flex-1 px-1 truncate">{status.name}</span>
      ) : (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim()
            if (trimmed && trimmed !== status.name) onPatch({ name: trimmed })
            else setName(status.name)
          }}
          className="h-8 text-sm flex-1 border-0 shadow-none focus-visible:ring-0 px-1"
        />
      )}
      <select
        value={status.category}
        onChange={(e) => onPatch({ category: e.target.value as StatusCategory })}
        disabled={readOnly}
        className="h-7 rounded border border-border/70 bg-background px-2 text-xs disabled:opacity-70"
        aria-label={t('listStatuses.statusCategoryLabel')}
      >
        {(Object.entries(CATEGORY_LABEL_KEYS) as Array<[StatusCategory, TranslationKey]>).map(([value, labelKey]) => (
          <option key={value} value={value}>{t(labelKey)}</option>
        ))}
      </select>
      {!readOnly && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onDelete}
          aria-label={t('listStatuses.deleteStatus', { name: status.name })}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      )}
    </div>
  )
}

function ColorSwatch({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        className={cn('h-5 w-5 rounded-full border border-border/70')}
        style={{ backgroundColor: color }}
        onClick={() => setOpen((o) => !o)}
        aria-label={t('listStatuses.pickColor')}
      />
      {open && (
        <div
          className="absolute z-30 mt-1 grid grid-cols-5 gap-1 rounded-md border border-border bg-popover p-2 shadow-md"
        >
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cn('h-5 w-5 rounded-full border border-border/40', color === c && 'ring-2 ring-ring')}
              style={{ backgroundColor: c }}
              onClick={() => {
                onChange(c)
                setOpen(false)
              }}
              aria-label={t('listStatuses.useColor', { color: c })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AddStatusForm({
  onAdd,
  isPending,
}: {
  onAdd: (input: { name: string; color: string; category: StatusCategory }) => void
  isPending: boolean
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[2])
  const [category, setCategory] = useState<StatusCategory>('open')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd({ name: trimmed, color, category })
    setName('')
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-border/70 px-2 py-1.5">
      <Plus className="h-4 w-4 text-muted-foreground/70 shrink-0" />
      <ColorSwatch color={color} onChange={setColor} />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={t('listStatuses.addStatusPlaceholder')}
        className="h-8 text-sm flex-1 border-0 shadow-none focus-visible:ring-0 px-1"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as StatusCategory)}
        className="h-7 rounded border border-border/70 bg-background px-2 text-xs"
      >
        {(Object.entries(CATEGORY_LABEL_KEYS) as Array<[StatusCategory, TranslationKey]>).map(([value, labelKey]) => (
          <option key={value} value={value}>{t(labelKey)}</option>
        ))}
      </select>
      <Button size="sm" className="h-7 text-xs" onClick={submit} disabled={isPending || !name.trim()}>
        {t('listStatuses.add')}
      </Button>
    </div>
  )
}

function ReassignDialog({
  open,
  sourceName,
  options,
  onCancel,
  onConfirm,
}: {
  open: boolean
  sourceName: string
  options: ListStatus[]
  onCancel: () => void
  onConfirm: (toId: string) => void
}) {
  const { t } = useTranslation()
  const [toId, setToId] = useState(options[0]?.id ?? '')
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('listStatuses.reassignTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t('listStatuses.reassignBody', { name: sourceName })}
        </p>
        <select
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          className="h-9 w-full rounded border border-border bg-background px-2 text-sm"
        >
          {options.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} size="sm">
            <X className="h-3.5 w-3.5 mr-1" /> {t('common.cancel')}
          </Button>
          <Button onClick={() => onConfirm(toId)} size="sm" disabled={!toId}>
            {t('listStatuses.moveAndDelete')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
