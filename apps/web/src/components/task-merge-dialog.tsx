/**
 * §V2-08 — "Merge", frame `15:32`.
 *
 * THE DIRECTION IS SPELLED OUT, not implied by a title. "Merge" is ambiguous
 * in the one way that matters — which of the two tasks survives — and getting
 * it backwards bins the wrong one. So the dialog names both tasks in the
 * sentence a person reads, and the button says what will happen rather than
 * "Merge".
 *
 * NO CONFIRMATION STEP, deliberately, because there is nothing to confirm
 * against: the merged-away task is BINNED, not deleted, its work has moved
 * rather than been destroyed, and both tasks carry an activity entry saying
 * what happened. A confirm dialog on a reversible action teaches people to
 * click through confirm dialogs.
 *
 * WHAT IT REPORTS AFTERWARDS. The API returns a count per kind of thing moved,
 * and the toast says how many comments and attachments arrived. That is the
 * only way somebody can tell the merge did what they wanted, and it is the one
 * operation where "it worked" is least worth taking on trust.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from '@rundesk/ui'
import { Merge } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { useTaskSearch } from '../lib/use-task-search'

type Candidate = {
  id: string
  title: string
  listName?: string | null
  projectName?: string | null
}

type MergeResult = {
  targetTaskId: string
  moved: Record<string, number>
}

/** A task's field as `GET …/tasks/:id/custom-fields` answers it: the field, and its value on the task. */
type FieldRow = {
  definition: { id: string; name: string; type: string; options?: Array<{ label: string; value: string }> | null }
  value: unknown
}

/** Fields worked out on read: they hold no value of their own to carry. */
const DERIVED = new Set(['formula', 'progress_auto'])
const holdsSomething = (v: unknown) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0)

export function TaskMergeDialog({
  taskId,
  taskTitle,
  workspaceId,
  open,
  onOpenChange,
  onMerged,
}: {
  taskId: string
  taskTitle: string
  workspaceId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The merged-away task is binned, so the sheet should move on. */
  onMerged: (targetTaskId: string) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  /*
   * "ADD SELECTED CFS" (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`).
   * ClickUp's merge, when the task merged has a field the other lacks, asks
   * whether to add it ("Add selected CFs") or merge without it ("Do nothing").
   * Picked here: the task to merge into, and this task's fields it lacks that
   * hold a value, each ticked to be added unless unticked.
   */
  const [pending, setPending] = useState<{ targetId: string; targetTitle: string; lacking: FieldRow[] } | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [checking, setChecking] = useState(false)

  const candidatesQuery = useTaskSearch<Candidate>(workspaceId, search, { key: 'merge-targets', enabled: open })

  const merge = useMutation({
    mutationFn: ({ targetTaskId, addFields }: { targetTaskId: string; addFields?: string[] }) =>
      api<MergeResult>(`/tasks/${taskId}/merge`, {
        method: 'POST',
        body: JSON.stringify(addFields ? { targetTaskId, addFields } : { targetTaskId }),
      }),
    onSuccess: async (result) => {
      const moved = result?.moved ?? {}
      const carried = (moved.comments ?? 0) + (moved.attachments ?? 0) + (moved.checklists ?? 0)
      setPending(null)
      toast.success(t('taskMerge.merged', { count: String(carried) }))
      await qc.invalidateQueries({ queryKey: ['tasks'] })
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
      await qc.invalidateQueries({ queryKey: ['task', result.targetTaskId] })
      onOpenChange(false)
      onMerged(result.targetTaskId)
    },
    onError: (err) => {
      // The API's refusals are sentences, not codes — "a task cannot be merged
      // into its own subtask" is the whole explanation, so it is shown as is.
      toast.error(err instanceof ApiError ? err.message : t('taskMerge.failed'))
    },
  })

  /** A task picked: merged at once, unless this task holds values in fields it lacks — then asked first. */
  const pick = async (c: Candidate) => {
    if (!workspaceId) return merge.mutate({ targetTaskId: c.id })
    setChecking(true)
    const fieldsOf = (id: string) => api<FieldRow[]>(`/workspaces/${workspaceId}/tasks/${id}/custom-fields`).catch(() => [] as FieldRow[])
    const [mine, theirs] = await Promise.all([fieldsOf(taskId), fieldsOf(c.id)])
    setChecking(false)
    const theirIds = new Set((theirs ?? []).map((r) => r.definition.id))
    const lacking = (mine ?? []).filter((r) => !theirIds.has(r.definition.id) && !DERIVED.has(r.definition.type) && holdsSomething(r.value))
    if (lacking.length === 0) return merge.mutate({ targetTaskId: c.id })
    setChosen(new Set(lacking.map((r) => r.definition.id)))
    setPending({ targetId: c.id, targetTitle: c.title, lacking })
  }
  /** What a value reads as in the prompt: an option's label, a count of a list, or the value itself. */
  const shown = (row: FieldRow): string => {
    const v = row.value
    if (Array.isArray(v)) return String(v.length)
    if (typeof v === 'boolean') return v ? '✓' : '✗'
    const option = row.definition.options?.find((o) => o.value === v)
    return option ? option.label : String(v)
  }

  const candidates = (candidatesQuery.data ?? [])
    .filter((c) => c.id !== taskId)
    // Narrowed by the server, which also matches the list's and project's
    // names; a title-only filter here would drop those.
    .slice(0, 50)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPending(null)
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-lg" data-testid="task-merge-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-4 w-4" />
            {t('taskMerge.title')}
          </DialogTitle>
        </DialogHeader>

        {/* The direction, in words, before anything can be clicked. */}
        <p data-testid="task-merge-direction" className="text-sm text-muted-foreground">
          {t('taskMerge.direction', { name: taskTitle })}
        </p>

        {pending ? (
          <div data-testid="task-merge-fields" className="space-y-3">
            <p className="text-sm">{t('taskMerge.fieldsPrompt', { name: pending.targetTitle })}</p>
            <ul className="space-y-1">
              {pending.lacking.map((row) => (
                <li key={row.definition.id}>
                  <label className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      data-testid={`task-merge-field-${row.definition.id}`}
                      checked={chosen.has(row.definition.id)}
                      onChange={(e) =>
                        setChosen((now) => {
                          const next = new Set(now)
                          if (e.target.checked) next.add(row.definition.id)
                          else next.delete(row.definition.id)
                          return next
                        })
                      }
                    />
                    <span className="font-medium">{row.definition.name}</span>
                    <span className="truncate text-muted-foreground">{shown(row)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                data-testid="task-merge-do-nothing"
                disabled={merge.isPending}
                onClick={() => merge.mutate({ targetTaskId: pending.targetId })}
              >
                {t('taskMerge.doNothing')}
              </Button>
              <Button
                size="sm"
                data-testid="task-merge-add-selected"
                disabled={merge.isPending || chosen.size === 0}
                onClick={() => merge.mutate({ targetTaskId: pending.targetId, addFields: [...chosen] })}
              >
                {t('taskMerge.addSelected')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Input
              autoFocus
              data-testid="task-merge-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('taskMerge.searchPlaceholder')}
            />
            <ul className="mt-2 max-h-[50vh] space-y-1 overflow-auto">
              {candidatesQuery.isPending ? (
                /* §2.9a — the shape of the list that is coming, not the word. */
                <li aria-busy="true" aria-live="polite">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="mb-1 h-10 rounded bg-muted/30 animate-pulse" />
                  ))}
                </li>
              ) : candidates.length === 0 ? (
                <li className="py-6 text-center text-sm text-muted-foreground">{t('taskMerge.noMatches')}</li>
              ) : (
                candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      data-testid="task-merge-candidate"
                      disabled={merge.isPending || checking}
                      onClick={() => void pick(c)}
                      className="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <div className="truncate font-medium">{c.title}</div>
                      {(c.projectName || c.listName) && (
                        <div className="truncate text-[11px] text-muted-foreground">
                          {[c.projectName, c.listName].filter(Boolean).join(' / ')}
                        </div>
                      )}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
