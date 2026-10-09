/**
 * A SECTION OF ONE'S OWN IN THE PLANNER'S RAIL (`ledger-rows/row-835`): its
 * emoji and name, the tasks put in it — each picked up and dropped on the grid
 * as Backlog's are, to block time for it — and its "+", which searches the
 * tasks the person may open and puts the chosen one in. A task already in
 * another of their sections moves here (ClickUp's one section at a time); ✕
 * takes it out and leaves the task as it was.
 */
import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@rundesk/ui'
import { Plus } from 'lucide-react'
import { api, refusalMessage } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { useTaskSearch } from '../lib/use-task-search'
import { plannerSectionsKey, sectionKey, sectionLabel, type OwnRailSection, type OwnRailSectionTask } from '../lib/planner-sections'

export function PlannerOwnSection({
  workspaceId,
  section,
  onPickUp,
}: {
  workspaceId: string
  section: OwnRailSection
  onPickUp: (task: OwnRailSectionTask, e: ReactPointerEvent<HTMLLIElement>) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const search = useTaskSearch<{ id: string; title: string }>(workspaceId, query, {
    enabled: adding,
    limit: 8,
    key: 'planner-own-section',
  })
  const reread = () => qc.invalidateQueries({ queryKey: plannerSectionsKey(workspaceId) })
  const add = useMutation({
    mutationFn: (taskId: string) =>
      api(`/planner/${workspaceId}/sections/${section.id}/tasks`, { method: 'POST', body: { taskId } }),
    onSuccess: () => {
      setQuery('')
      setAdding(false)
      void reread()
    },
    onError: (err) => toast.error(refusalMessage(err, t('plannerSections.addFailed'))),
  })
  const remove = useMutation({
    mutationFn: (taskId: string) =>
      api(`/planner/${workspaceId}/sections/${section.id}/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => void reread(),
    onError: (err) => toast.error(refusalMessage(err, t('plannerSections.removeFailed'))),
  })
  const label = sectionLabel(section)
  const held = new Set(section.tasks.map((task) => task.id))

  return (
    <section data-testid="planner-own-section" data-rail-section={sectionKey(section.id)} data-section-id={section.id}>
      <h2 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {section.emoji && <span data-testid="planner-own-section-emoji" className="normal-case">{section.emoji}</span>}
        <span data-testid="planner-own-section-name" className="min-w-0 flex-1 truncate">{section.name}</span>
        <button
          type="button"
          data-testid="planner-own-section-add"
          aria-label={t('plannerSections.addTask', { name: label })}
          title={t('plannerSections.addTask', { name: label })}
          aria-expanded={adding}
          onClick={() => setAdding((v) => !v)}
          className="rounded p-0.5 hover:bg-muted/60 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </h2>
      {adding && (
        <div className="mb-1.5 space-y-1" data-testid="planner-own-section-picker">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder={t('plannerSections.searchTasks')}
            aria-label={t('plannerSections.searchTasks')}
            data-testid="planner-own-section-search"
            className="h-7 w-full rounded-md border border-border bg-background px-2 text-[12px]"
          />
          <ul className="max-h-48 overflow-y-auto">
            {(search.data ?? []).filter((task) => !held.has(task.id)).slice(0, 8).map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  data-testid="planner-own-section-pick"
                  data-task-id={task.id}
                  disabled={add.isPending}
                  onClick={() => add.mutate(task.id)}
                  className="w-full truncate rounded px-2 py-1 text-left text-[12px] hover:bg-muted/40"
                >
                  {task.title}
                </button>
              </li>
            ))}
            {search.isSuccess && (search.data ?? []).filter((task) => !held.has(task.id)).length === 0 && (
              <li className="px-2 py-1 text-[11px] text-muted-foreground" data-testid="planner-own-section-no-match">
                {t('plannerSections.noMatches')}
              </li>
            )}
          </ul>
        </div>
      )}
      {section.tasks.length === 0 ? (
        <p className="px-1 text-[11px] text-muted-foreground" data-testid="planner-own-section-empty">
          {t('plannerSections.empty')}
        </p>
      ) : (
        <ul className="space-y-1">
          {section.tasks.map((task) => (
            <li
              key={task.id}
              data-testid="planner-own-section-item"
              data-task-id={task.id}
              onPointerDown={(e) => onPickUp(task, e)}
              className="group flex cursor-grab items-center gap-1.5 rounded px-2 py-1 text-[12px] hover:bg-muted/40 active:cursor-grabbing"
            >
              <span className="min-w-0 flex-1 truncate">{task.title}</span>
              <button
                type="button"
                data-testid={`planner-own-section-remove-${task.id}`}
                aria-label={t('plannerSections.removeTask', { name: label })}
                title={t('plannerSections.removeTask', { name: label })}
                // A press on ✕ is not the start of a drag to the grid.
                onPointerDown={(e) => e.stopPropagation()}
                disabled={remove.isPending}
                onClick={() => remove.mutate(task.id)}
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 focus-visible:opacity-100"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
