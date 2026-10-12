import { useCallback, useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, EmptyState, Badge, toast } from '@rundesk/ui'
import { GanttChart as GanttIcon } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { InlineSkeleton } from '../components/loading-skeletons'
import { GanttChart, type DatePatch, type GanttLink, type GanttTask } from '../components/gantt-chart'
import { useFeatureGate, type GatedFeature } from '../components/feature-gate'

/*
 * THE WORKSPACE'S GANTT: every dated task the reader may see, across spaces,
 * drawn by the one Gantt the list's tab draws too (`components/gantt-chart.tsx`,
 * `resume-defects/resume-5`). This page reads the tasks, groups them as its
 * header says, and saves what the chart changes.
 */

type TimelineTask = GanttTask & {
  listId: string
  listName: string
  projectId: string
  projectName: string
  spaceId: string
  spaceName: string
  /** The tasks it waits on, each with the dependency's own row (`resume-defects/resume-5`). */
  dependencyLinks?: Array<{ id: string; blocker: string }>
}

const PRIORITY_LABEL: Record<string, TranslationKey> = {
  urgent: 'timeline.priorityUrgent',
  high: 'timeline.priorityHigh',
  normal: 'timeline.priorityNormal',
  low: 'timeline.priorityLow',
}

// §5.4 — how the cross-project timeline groups its rows. "project" keeps the
// original space·project header behaviour; the others mirror the per-list Gantt.
type GroupMode = 'project' | 'status' | 'priority' | 'none'

const GROUP_MODES: Array<{ value: GroupMode; labelKey: TranslationKey }> = [
  { value: 'project', labelKey: 'timeline.groupProject' },
  { value: 'status', labelKey: 'timeline.groupStatus' },
  { value: 'priority', labelKey: 'timeline.groupPriority' },
  { value: 'none', labelKey: 'timeline.groupNone' },
]

// Reuse the existing per-status labels; keep a canonical order for headers.
const STATUS_LABEL: Record<string, TranslationKey> = {
  backlog: 'taskDetail.status.backlog',
  todo: 'taskDetail.status.todo',
  in_progress: 'taskDetail.status.inProgress',
  in_review: 'taskDetail.status.inReview',
  done: 'taskDetail.status.done',
  cancelled: 'taskDetail.status.cancelled',
}
const STATUS_ORDER = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']
const PRIORITY_ORDER = ['urgent', 'high', 'normal', 'low']

/** Title-case a raw enum value as a last-resort header for unexpected values. */
function humanize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '—'
}

export function TimelinePage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/timeline' })
  const qc = useQueryClient()
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [groupMode, setGroupMode] = useState<GroupMode>('project')
  const { requireFeature, gateDialog } = useFeatureGate(workspaceId)

  const tasksQuery = useQuery({
    queryKey: ['timeline', workspaceId],
    queryFn: () => api<TimelineTask[]>(`/tasks/workspace/${workspaceId}/timeline`),
  })
  /*
   * A DRAG'S CHANGE, AND THE SERVER'S WORDS WHEN IT IS REFUSED
   * (`found-30-sep/timeline-drags-refused-silently`). This had a refetch and no
   * `onError`, and its caller dropped the rejection, so a refused drag put the
   * bar back — or, for a task binned meanwhile, took it away — without a word:
   * the reason reached only the console. It is said now in the server's words,
   * as the list page says a refused row edit (`patchTaskSaying`); the rows are
   * read again either way, and only then is the bar's own patch dropped (the
   * chart drops it when this settles).
   */
  const persistDates = useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: DatePatch }) =>
      api(`/tasks/${taskId}`, { method: 'PATCH', body: patch }),
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateTask'))
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ['timeline', workspaceId] })
    },
  })

  const allTasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])

  const projectOptions = useMemo(() => {
    const seen = new Map<string, { id: string; label: string }>()
    for (const t of allTasks) {
      if (!seen.has(t.projectId)) {
        seen.set(t.projectId, { id: t.projectId, label: `${t.spaceName} · ${t.projectName}` })
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [allTasks])

  const tasks = useMemo(() => {
    if (projectFilter === 'all') return allTasks
    return allTasks.filter((t) => t.projectId === projectFilter)
  }, [allTasks, projectFilter])

  // Group tasks by the selected mode (§5.4). "none" renders one headerless
  // group; the others emit a labelled header row per group. Group order is
  // canonical for status/priority, alphabetical (space·project) for projects.
  const groups = useMemo<Array<{ key: string; title: string | null; rows: TimelineTask[] }>>(() => {
    if (groupMode === 'none') {
      return [{ key: 'all', title: null, rows: tasks }]
    }
    const m = new Map<string, { title: string; rows: TimelineTask[]; sort: number }>()
    for (const task of tasks) {
      let key: string
      let title: string
      let sort: number
      if (groupMode === 'status') {
        key = task.status || 'unknown'
        title = STATUS_LABEL[task.status] ? t(STATUS_LABEL[task.status]) : humanize(task.status)
        sort = STATUS_ORDER.indexOf(task.status)
      } else if (groupMode === 'priority') {
        key = task.priority || 'unknown'
        title = PRIORITY_LABEL[task.priority] ? t(PRIORITY_LABEL[task.priority]) : humanize(task.priority)
        sort = PRIORITY_ORDER.indexOf(task.priority)
      } else {
        // project
        key = `${task.spaceId}:${task.projectId}`
        title = `${task.spaceName} · ${task.projectName}`
        sort = 0
      }
      if (!m.has(key)) m.set(key, { title, rows: [], sort })
      m.get(key)!.rows.push(task)
    }
    const arr = Array.from(m.entries()).map(([key, g]) => ({ key, title: g.title, rows: g.rows, sort: g.sort }))
    if (groupMode === 'project') {
      arr.sort((a, b) => a.title.localeCompare(b.title))
    } else {
      // Known enum values in canonical order; unexpected values fall to the end.
      arr.sort((a, b) => {
        const as = a.sort < 0 ? Number.MAX_SAFE_INTEGER : a.sort
        const bs = b.sort < 0 ? Number.MAX_SAFE_INTEGER : b.sort
        return as !== bs ? as - bs : a.title.localeCompare(b.title)
      })
    }
    return arr.map(({ key, title, rows }) => ({ key, title, rows }))
  }, [tasks, groupMode, t])

  /** The dependencies between the tasks drawn, as lines from the one waited on. */
  const links = useMemo<GanttLink[]>(
    () => tasks.flatMap((task) => (task.dependencyLinks ?? []).map((l) => ({ id: l.id, blocker: l.blocker, blocked: task.id }))),
    [tasks],
  )

  /*
   * A LINE DRAWN OR TAKEN OUT IS A DEPENDENCY MADE OR DELETED, by the routes
   * the task sheet's Relationships use, and refused in their words.
   */
  const saySaid = useCallback(
    (err: unknown) => toast.error(err instanceof ApiError ? err.message : t('taskDetail.couldNotUpdateTask')),
    [t],
  )
  const link = useCallback(
    async (blocker: string, blocked: string) => {
      try {
        await api(`/tasks/${blocked}/dependencies`, { method: 'POST', body: { relatedTaskId: blocker, type: 'blocked_by' } })
      } catch (err) {
        saySaid(err)
      }
      await qc.invalidateQueries({ queryKey: ['timeline', workspaceId] })
    },
    [qc, workspaceId, saySaid],
  )
  const unlink = useCallback(
    async (line: GanttLink) => {
      try {
        await api(`/tasks/${line.blocked}/dependencies/${line.id}`, { method: 'DELETE' })
      } catch (err) {
        saySaid(err)
      }
      await qc.invalidateQueries({ queryKey: ['timeline', workspaceId] })
    },
    [qc, workspaceId, saySaid],
  )

  const GANTT_EXPORT_GATE: GatedFeature = {
    planFeature: 'ganttExport',
    name: t('gate.ganttExport'),
    blurb: t('gate.ganttExportBlurb'),
    highlights: [t('gate.ganttExportPoint1'), t('gate.ganttExportPoint2'), t('gate.ganttExportPoint3')],
  }

  return (
    <div className="p-6 space-y-5 max-w-full">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            {t('timeline.eyebrow')}
          </div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
              <GanttIcon className="h-4 w-4" />
            </span>
            {t('timeline.title')}
            <Badge variant="secondary" className="ml-1">{t('timeline.live')}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            {t('timeline.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            data-testid="timeline-group-mode"
            value={groupMode}
            onChange={(e) => setGroupMode(e.target.value as GroupMode)}
            className="text-xs h-8 px-2.5 rounded-md border border-border/60 bg-card/60 text-foreground backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            title={t('timeline.groupByLabel')}
            aria-label={t('timeline.groupByLabel')}
          >
            {GROUP_MODES.map((g) => (
              <option key={g.value} value={g.value}>
                {t('timeline.groupByLabel')}: {t(g.labelKey)}
              </option>
            ))}
          </select>
          {projectOptions.length > 1 && (
            <select
              data-testid="timeline-project-filter"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="text-xs h-8 px-2.5 rounded-md border border-border/60 bg-card/60 text-foreground backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              title={t('timeline.filterByProject')}
            >
              <option value="all">{t('reports.allProjects')}</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {tasksQuery.isLoading ? (
        <Card variant="glass" className="p-12 text-center text-sm text-muted-foreground">
          <InlineSkeleton />
        </Card>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<GanttIcon className="h-6 w-6" />}
          title={t('timeline.emptyTitle')}
          description={t('timeline.emptyDesc')}
        />
      ) : (
        <GanttChart
          groups={groups}
          links={links}
          onCommitDates={(taskId, patch) => persistDates.mutateAsync({ taskId, patch }).catch(() => undefined)}
          onLink={link}
          onUnlink={unlink}
          mayExportPicture={() => requireFeature(GANTT_EXPORT_GATE)}
          exportName="rundesk-timeline"
          exportTitle={t('timeline.title')}
          storageKey="rundesk.timeline"
          plotKey={`${groupMode}|${projectFilter}`}
        />
      )}
      {gateDialog}
    </div>
  )
}
