/**
 * §V2-08 — "Convert to", frame `15:32`.
 *
 * `[15:38]` "aur task ko CONVERT bhi kar sakte ho. Theek hai — kisi aur cheez
 * mein." She names it and never says into WHAT, and never opens the submenu, so
 * the video specifies the action and not its targets.
 *
 * WHAT IT CONVERTS INTO, and why that is the defensible reading. Inventing a
 * list of targets from a chevron would be building from a guess. The one
 * conversion Rundesk's own schema already supports is a task becoming a subtask
 * of another task — `parentTaskId`, with the service's existing one-level-deep
 * rule. The opposite direction was already built (`promoteToTask`, reachable
 * from the parent strip), so this completes a pair rather than opening a new
 * concept.
 *
 * THE PARENT LIST IS FILTERED, NOT JUST LISTED. The API refuses a parent that
 * is itself a subtask, and refuses to demote a task that has children of its
 * own. A picker that offers those choices anyway is a picker most of whose
 * options return an error, so the ones that cannot work are not offered — and
 * when the task itself cannot be converted at all, the dialog says why instead
 * of showing an empty list.
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
  cn,
  toast,
} from '@rundesk/ui'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { useTaskSearch } from '../lib/use-task-search'

type Candidate = {
  id: string
  title: string
  parentTaskId?: string | null
  listName?: string | null
  projectName?: string | null
}

export function TaskConvertDialog({
  taskId,
  workspaceId,
  hasSubtasks,
  open,
  onOpenChange,
}: {
  taskId: string
  workspaceId?: string
  /** A task with children cannot itself become a subtask — one level only. */
  hasSubtasks: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')

  const candidatesQuery = useTaskSearch<Candidate>(workspaceId, search, {
    key: 'convert-parents',
    enabled: open && !hasSubtasks,
  })

  const convert = useMutation({
    mutationFn: (parentTaskId: string) =>
      api(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ parentTaskId }) }),
    onSuccess: async () => {
      toast.success(t('taskConvert.converted'))
      await qc.invalidateQueries({ queryKey: ['task', taskId] })
      await qc.invalidateQueries({ queryKey: ['tasks'] })
      onOpenChange(false)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('taskConvert.failed'))
    },
  })

  const candidates = (candidatesQuery.data ?? [])
    // Itself, and anything that is already a subtask: both are refused by the
    // API, so offering them would be offering an error.
    .filter((c) => c.id !== taskId && !c.parentTaskId)
    // Narrowed by the server, which also matches the list's and project's
    // names; a title-only filter here would drop those.
    .slice(0, 50)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="task-convert-dialog">
        <DialogHeader>
          <DialogTitle>{t('taskConvert.title')}</DialogTitle>
        </DialogHeader>

        {hasSubtasks ? (
          /*
           * Said plainly rather than shown as an empty list. "A task with
           * subtasks cannot become a subtask itself" is the API's rule, and a
           * person who does not know it would read an empty picker as a bug.
           */
          <p data-testid="task-convert-blocked" className="py-6 text-sm text-muted-foreground">
            {t('taskConvert.hasSubtasks')}
          </p>
        ) : (
          <>
            <Input
              autoFocus
              data-testid="task-convert-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('taskConvert.searchPlaceholder')}
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
                <li className="py-6 text-center text-sm text-muted-foreground" data-testid="task-convert-empty">{t('taskConvert.noMatches')}</li>
              ) : (
                candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      data-testid="task-convert-candidate"
                      disabled={convert.isPending}
                      onClick={() => convert.mutate(c.id)}
                      className={cn(
                        'w-full rounded px-2.5 py-2 text-left text-sm hover:bg-muted disabled:opacity-50',
                      )}
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
