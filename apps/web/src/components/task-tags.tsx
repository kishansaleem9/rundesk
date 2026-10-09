/**
 * §G15 [23:16–23:31] — putting a tag on a task.
 *
 * "task ke ooper feature ke lehaz se TAG rakh sakein, likh ke ENTER dabao to
 * naya tag ban jaye — YouTube jaisa."
 *
 * The whole backend for this shipped long ago: a `labels` table, a
 * `task_label_assignments` join, and `POST`/`DELETE /tasks/:taskId/labels/:id`.
 * The task sheet even rendered the badges. What did not exist was any way to
 * put one there — grep `/labels/` across the web app before this file and the
 * only hits were the rename and delete buttons in Workspace Settings. Tags were
 * write-only from a settings screen and could never reach a task, which is a
 * more complete kind of missing than "not built": everything was there except
 * the part a person touches.
 *
 * "YouTube jaisa" is the whole interaction spec, and it is a good one: one box,
 * type to filter what exists, press Enter to get what does not. No separate
 * "manage tags" trip, no colour picker in the way of naming a thing.
 */
import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Input, Popover, PopoverContent, PopoverTrigger, cn, toast } from '@rundesk/ui'
import { Tag, Plus, X, Check } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { InlineSkeleton } from './loading-skeletons'
import { useTranslation } from '../lib/i18n'

export type TaskLabel = { id: string; name: string; color: string }

/**
 * Colours a new tag can be born with.
 *
 * Picked from the name rather than asked for. Being made to choose a colour
 * before you can finish naming a thing is the friction "type and press Enter"
 * exists to remove — and a tag nobody chose a colour for still has to be
 * distinguishable from the one next to it, so "pick one at random" is worse
 * than "pick one from the name": the same word gets the same colour every
 * time, in every workspace, which is what makes a wall of tags readable.
 */
const TAG_COLORS = [
  '#7c3aed', '#2563eb', '#0891b2', '#059669',
  '#ca8a04', '#ea580c', '#dc2626', '#db2777',
]

export function colorForTagName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

export function TaskTags({
  taskId,
  workspaceId,
  labels,
  onChanged,
  compact = false,
  mayChange = true,
}: {
  taskId: string
  workspaceId?: string
  /** The tags currently on this task, as the task detail already knows them. */
  labels: TaskLabel[]
  onChanged?: () => void
  /** Render only the add control, for rows too tight for the chips. */
  compact?: boolean
  /**
   * Whether this person may add or remove its tags — what Edit allows, and
   * where they only view, what their workspace lets them
   * (`found-25-sep/view-only-individual-permissions`). Without it the chips are
   * shown, not offered.
   */
  mayChange?: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const allQuery = useQuery({
    queryKey: ['workspace-labels', workspaceId],
    queryFn: () => api<TaskLabel[]>(`/workspaces/${workspaceId}/labels`),
    enabled: Boolean(workspaceId) && open,
  })

  const onTask = useMemo(() => new Set(labels.map((l) => l.id)), [labels])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['task', taskId] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['workspace-labels', workspaceId] })
    onChanged?.()
  }

  const addMutation = useMutation({
    mutationFn: (labelId: string) => api(`/tasks/${taskId}/labels/${labelId}`, { method: 'POST' }),
    onSuccess: refresh,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  const removeMutation = useMutation({
    mutationFn: (labelId: string) => api(`/tasks/${taskId}/labels/${labelId}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  /**
   * Enter on a name that does not exist yet.
   *
   * Create-then-attach, in that order, because a tag that exists but is on
   * nothing is a recoverable half-step and a tag attached to a task that was
   * never created is not. The server returns the existing row for a name it
   * already has, case-insensitively, so pressing Enter on a tag you already
   * made attaches it rather than failing on the unique index.
   */
  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const label = await api<TaskLabel>(`/workspaces/${workspaceId}/labels`, {
        method: 'POST',
        body: { name, color: colorForTagName(name) },
      })
      if (!onTask.has(label.id)) {
        await api(`/tasks/${taskId}/labels/${label.id}`, { method: 'POST' })
      }
      return label
    },
    onSuccess: () => {
      setQuery('')
      refresh()
      inputRef.current?.focus()
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  const trimmed = query.trim()
  const all = allQuery.data ?? []
  const matches = useMemo(
    () => (trimmed ? all.filter((l) => l.name.toLowerCase().includes(trimmed.toLowerCase())) : all),
    [all, trimmed],
  )
  // Case-insensitive, to match what the server will do with the same name.
  const exact = all.find((l) => l.name.toLowerCase() === trimmed.toLowerCase())
  const busy = addMutation.isPending || removeMutation.isPending || createMutation.isPending

  const submit = () => {
    if (!trimmed) return
    if (exact) {
      if (!onTask.has(exact.id)) addMutation.mutate(exact.id)
      setQuery('')
      return
    }
    createMutation.mutate(trimmed)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="task-tags">
      {!compact &&
        labels.map((l) => (
          <Badge
            key={l.id}
            variant="outline"
            data-testid={`task-tag-${l.id}`}
            className="border-transparent text-white gap-1 pr-1"
            style={{ backgroundColor: l.color }}
          >
            {l.name}
            {mayChange && (
            <button
              type="button"
              title={t('tags.remove')}
              aria-label={t('tags.remove')}
              data-testid={`task-tag-remove-${l.id}`}
              disabled={busy}
              className="rounded-full opacity-70 hover:opacity-100 disabled:opacity-40"
              onClick={() => removeMutation.mutate(l.id)}
            >
              <X className="h-3 w-3" />
            </button>
            )}
          </Badge>
        ))}

      {mayChange && (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="task-tag-add"
            title={t('tags.add')}
            disabled={!workspaceId}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5',
              'text-[11px] text-muted-foreground transition-colors hover:border-violet-500/60 hover:text-foreground',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <Tag className="h-3 w-3" />
            {labels.length === 0 ? t('tags.add') : <Plus className="h-3 w-3" />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2" data-testid="task-tag-popover">
          <Input
            ref={inputRef}
            autoFocus
            value={query}
            data-testid="task-tag-input"
            placeholder={t('tags.searchOrCreate')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            className="h-8 text-sm"
          />

          <div className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
            {/* The create row comes FIRST while typing something new. It is
                what Enter will do, and a list that puts it last makes Enter
                feel like a shortcut for whatever happens to be on top. */}
            {trimmed && !exact && (
              <button
                type="button"
                data-testid="task-tag-create"
                disabled={busy}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                onClick={submit}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: colorForTagName(trimmed) }}
                />
                <span className="truncate">{t('tags.createNamed', { name: trimmed })}</span>
              </button>
            )}

            {/* §2.9a — a skeleton, not the word "Loading". The app answers
                every wait with the shape of what is coming; a suite enforces
                it, and this box was the one place that said it out loud. */}
            {allQuery.isLoading && <InlineSkeleton />}

            {!allQuery.isLoading && matches.length === 0 && !trimmed && (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                {t('tags.noneYet')}
              </div>
            )}

            {matches.map((l) => {
              const on = onTask.has(l.id)
              return (
                <button
                  key={l.id}
                  type="button"
                  data-testid={`task-tag-option-${l.id}`}
                  disabled={busy}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                  onClick={() => (on ? removeMutation.mutate(l.id) : addMutation.mutate(l.id))}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="flex-1 truncate">{l.name}</span>
                  {on && <Check className="h-3.5 w-3.5 text-violet-500" />}
                </button>
              )
            })}
          </div>

          {/* Named, not just implied by the create row: the gesture is the
              feature, and somebody who has not tried it cannot discover it
              from a list of things that already exist. */}
          <p className="mt-2 border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">
            {t('tags.enterHint')}
          </p>
        </PopoverContent>
      </Popover>
      )}

      {compact && labels.length > 0 && (
        <span className="text-[11px] text-muted-foreground">{labels.length}</span>
      )}
    </div>
  )
}

/** A read-only row of tag badges, for surfaces that only display them. */
export function TaskTagBadges({ labels }: { labels: TaskLabel[] }) {
  if (!labels?.length) return null
  return (
    <>
      {labels.map((l) => (
        <Badge
          key={l.id}
          variant="outline"
          className="border-transparent text-white"
          style={{ backgroundColor: l.color }}
        >
          {l.name}
        </Badge>
      ))}
    </>
  )
}

export default TaskTags
