import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { toast } from '@rundesk/ui'
import { Plus, X } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'

/** `GET /tasks/:id/lists` — the task's home list first, then the lists it was added to (`task-lists.service.ts`). */
export type TaskListsAnswer = {
  /** The Tasks in Multiple Lists ClickApp is on in this workspace. */
  on: boolean
  /** This reader may add the task to another list, or take it out of one. */
  canChange: boolean
  /** Why not, in the server's words, when they may not. */
  reason: string | null
  lists: Array<{ id: string; name: string; projectId: string; spaceId: string; home: boolean }>
}

export function useTaskLists(taskId: string | null | undefined) {
  return useQuery({
    queryKey: ['task-lists', taskId],
    enabled: Boolean(taskId),
    queryFn: () => api<TaskListsAnswer>(`/tasks/${taskId}/lists`),
  })
}

/**
 * THE TASK'S LISTS, under its title (`commit-log/log-713a611-1`): ClickUp's
 * location breadcrumb, with the lists it was added to beside its home one, a
 * way into each, an × to take it out of an added one ("Remove task from this
 * List") and + to add it to another. Drawn while the ClickApp is on, or while
 * the task is still in more lists than its home.
 */
export function TaskListsRow({
  taskId,
  workspaceId,
  data,
  onAdd,
}: {
  taskId: string
  workspaceId: string
  data: TaskListsAnswer | undefined
  onAdd: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const remove = useMutation({
    mutationFn: (listId: string) => api<TaskListsAnswer>(`/tasks/${taskId}/lists/${listId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('taskDetail.listsRemoved'))
      void qc.invalidateQueries({ queryKey: ['task-lists', taskId] })
      void qc.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('taskDetail.listsFailed')),
  })
  if (!data || (!data.on && data.lists.length <= 1)) return null
  return (
    <div data-testid="task-lists-row" className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
      <span className="text-muted-foreground">{t('taskDetail.lists')}</span>
      {data.lists.map((l) => (
        <span
          key={l.id}
          data-testid={`task-lists-chip-${l.id}`}
          data-home={l.home ? 'yes' : 'no'}
          className="inline-flex items-center gap-1 rounded border border-border/70 px-1.5 py-0.5"
        >
          <Link
            to="/app/$workspaceId/$spaceId/$projectId/$listId"
            params={{ workspaceId, spaceId: l.spaceId, projectId: l.projectId, listId: l.id }}
            className="max-w-[12rem] truncate hover:underline"
          >
            {l.name}
          </Link>
          {l.home && <span className="text-[10px] text-muted-foreground">{t('taskDetail.listsHome')}</span>}
          {!l.home && data.canChange && (
            <button
              type="button"
              data-testid={`task-lists-remove-${l.id}`}
              aria-label={t('taskDetail.listsRemove')}
              title={t('taskDetail.listsRemove')}
              disabled={remove.isPending}
              onClick={() => remove.mutate(l.id)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {data.canChange && (
        <button
          type="button"
          data-testid="task-lists-add"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded border border-dashed border-border px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {t('taskDetail.listsAdd')}
        </button>
      )}
    </div>
  )
}
