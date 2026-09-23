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

  const candidatesQuery = useTaskSearch<Candidate>(workspaceId, search, { key: 'merge-targets', enabled: open })

  const merge = useMutation({
    mutationFn: (targetTaskId: string) =>
      api<MergeResult>(`/tasks/${taskId}/merge`, {
        method: 'POST',
        body: JSON.stringify({ targetTaskId }),
      }),
    onSuccess: async (result) => {
      const moved = result?.moved ?? {}
      const carried = (moved.comments ?? 0) + (moved.attachments ?? 0) + (moved.checklists ?? 0)
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

  const candidates = (candidatesQuery.data ?? [])
    .filter((c) => c.id !== taskId)
    // Narrowed by the server, which also matches the list's and project's
    // names; a title-only filter here would drop those.
    .slice(0, 50)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                  disabled={merge.isPending}
                  onClick={() => merge.mutate(c.id)}
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

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
