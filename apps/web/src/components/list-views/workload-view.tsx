import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, PersonAvatar, Popover, PopoverContent, PopoverTrigger, cn } from '@rundesk/ui'
import { addDays, format, startOfWeek } from 'date-fns'
import { api } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'
import { CapacityBadge, loadColor, useSetsCapacityOf } from '../workload-parts'

type Measure = 'hours' | 'tasks' | 'points'
type Contribution = { taskId: string; title: string; loads: number[] }
type Row = {
  userId: string
  name: string | null
  email: string
  avatarUrl: string | null
  weeklyCapacityHours: number
  dailyCapacities: number[] | null
  daysOff: string[]
  dailyLoads: number[]
  total: number
  tasks: Contribution[]
}
export type ListWorkload = {
  start: string
  days: number
  measure: Measure
  members: Row[]
  unassigned: { dailyLoads: number[]; total: number; tasks: Contribution[] }
  noEstimate: Array<{ taskId: string; title: string; assigneeIds: string[] }>
  backlog: {
    unscheduled: Array<{ taskId: string; title: string }>
    overdue: Array<{ taskId: string; title: string; dueDate: string | null }>
    unassigned: Array<{ taskId: string; title: string }>
  }
}

/**
 * A LIST'S WORKLOAD VIEW (`commit-log/log-68bc188-1`, `ledger-rows/row-777`).
 *
 * ClickUp's Workload: a row per assignee (and one for the unassigned) over a
 * scale of days, measured in Time estimates by default, or Tasks, or Sprint
 * points; each cell coloured against that person's capacity, which is set
 * beside their name; and a Backlog of what the view cannot place. The numbers
 * are the server's (`GET /lists/:listId/workload`, the workspace workload's own
 * rule); the colour is the workspace page's own `loadColor`, and the capacity
 * editor its own `CapacityBadge`, so the two can never disagree about a day.
 */
export function WorkloadView({
  workspaceId,
  listId,
  stamp,
  onOpenTask,
}: {
  workspaceId: string
  listId: string
  /** The list's refresh stamp: a task changed, so the load did. */
  stamp: number
  onOpenTask: (id: string) => void
}) {
  const { t, locale } = useTranslation()
  const [measure, setMeasure] = useState<Measure>('hours')
  const [days, setDays] = useState<7 | 14>(14)
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const setsCapacityOf = useSetsCapacityOf(workspaceId)
  const start = format(anchor, 'yyyy-MM-dd')

  const load = useQuery({
    queryKey: ['list-workload', listId, measure, days, start, stamp],
    queryFn: () => api<ListWorkload>(`/lists/${listId}/workload?measure=${measure}&days=${days}&start=${start}`),
    placeholderData: (prev: ListWorkload | undefined) => prev,
    retry: false,
  })

  const dates = Array.from({ length: days }, (_, i) => addDays(anchor, i))
  const unit = (n: number) => (measure === 'hours' ? `${Math.round(n * 10) / 10}h` : `${Math.round(n * 10) / 10}`)
  const data = load.data

  const cell = (
    key: string,
    loads: number[],
    capacities: number[] | null,
    contributions: Contribution[],
    i: number,
    away: boolean,
  ) => {
    const value = loads[i] ?? 0
    const capacity = capacities ? capacities[i] ?? 0 : null
    const ratio = capacity === null ? (value > 0 ? 0.3 : 0) : capacity > 0 ? value / capacity : value > 0 ? 2 : 0
    const here = contributions.filter((c) => (c.loads[i] ?? 0) > 0)
    const box = (
      <button
        type="button"
        data-testid="workload-view-cell"
        data-row={key}
        data-day={format(dates[i], 'yyyy-MM-dd')}
        data-load={Math.round(value * 100) / 100}
        data-capacity={capacity ?? ''}
        data-away={away || undefined}
        disabled={here.length === 0}
        className={cn(
          'h-9 w-full rounded text-[11px] font-medium tabular-nums transition-colors',
          away ? 'bg-amber-100/60 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100' : loadColor(ratio),
        )}
        title={capacity !== null ? `${unit(value)} / ${unit(capacity)}` : unit(value)}
      >
        {value > 0 ? unit(value) : away ? t('list.workload.away') : ''}
      </button>
    )
    if (here.length === 0) return box
    return (
      <Popover>
        <PopoverTrigger asChild>{box}</PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="center" data-testid="workload-view-drill">
          <ul className="space-y-1">
            {here.map((c) => (
              <li key={c.taskId}>
                <button
                  type="button"
                  data-testid="workload-view-drill-task"
                  data-task-id={c.taskId}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
                  onClick={() => onOpenTask(c.taskId)}
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{unit(c.loads[i])}</span>
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    )
  }

  const grid = `200px repeat(${days}, minmax(44px, 1fr)) 64px`

  return (
    <Card className="p-0" data-testid="workload-view" data-measure={measure}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs" data-testid="workload-measure">
          {(['hours', 'tasks', 'points'] as const).map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`workload-measure-${m}`}
              aria-pressed={measure === m}
              onClick={() => setMeasure(m)}
              className={cn('rounded px-2 py-0.5', measure === m ? 'bg-brand-700 text-white' : 'text-muted-foreground hover:text-foreground')}
            >
              {m === 'hours' ? t('list.workload.byEstimate') : m === 'tasks' ? t('list.workload.byTasks') : t('list.workload.byPoints')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
          {([7, 14] as const).map((n) => (
            <button
              key={n}
              type="button"
              data-testid={`workload-days-${n}`}
              aria-pressed={days === n}
              onClick={() => setDays(n)}
              className={cn('rounded px-2 py-0.5', days === n ? 'bg-brand-700 text-white' : 'text-muted-foreground hover:text-foreground')}
            >
              {t('workload.nDays', { count: n })}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" data-testid="workload-today" onClick={() => setAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
          {t('list.calendar.today')}
        </Button>
        <Button size="sm" variant="outline" data-testid="workload-prev" onClick={() => setAnchor((a) => addDays(a, -7))}>
          ‹
        </Button>
        <Button size="sm" variant="outline" data-testid="workload-next" onClick={() => setAnchor((a) => addDays(a, 7))}>
          ›
        </Button>
        <span className="text-sm font-medium" data-testid="workload-period" data-start={start}>
          {dates[0].toLocaleDateString(locale, { month: 'short', day: 'numeric' })} –{' '}
          {dates[dates.length - 1].toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>

      {load.isError ? (
        <p className="p-4 text-sm text-destructive" data-testid="workload-view-failed">
          {t('list.workload.failed')}
        </p>
      ) : !data ? (
        <div className="p-4 text-sm text-muted-foreground" data-testid="workload-view-loading" aria-busy />
      ) : (
        <div className="flex">
          <div className="min-w-0 flex-1 overflow-x-auto p-3">
            <div className="grid items-center gap-1 text-[10px] text-muted-foreground" style={{ gridTemplateColumns: grid }}>
              <div />
              {dates.map((d) => (
                <div key={d.toISOString()} className="text-center">
                  {d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
                </div>
              ))}
              <div className="text-right">{t('list.workload.total')}</div>
            </div>
            {data.members.map((row) => {
              const name = row.name || row.email
              const away = new Set(row.daysOff)
              const daily = row.dailyCapacities ? Math.max(...row.dailyCapacities, 0) : 0
              return (
                <div
                  key={row.userId}
                  data-testid="workload-view-row"
                  data-user-id={row.userId}
                  data-total={row.total}
                  className="mt-1 grid items-center gap-1"
                  style={{ gridTemplateColumns: grid }}
                >
                  <div className="flex min-w-0 items-center gap-2 pr-2">
                    <PersonAvatar name={name} imageUrl={row.avatarUrl} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                    {measure === 'hours' && (
                      <CapacityBadge
                        workspaceId={workspaceId}
                        person={{ userId: row.userId, name, capacity: daily, weeklyCapacityHours: row.weeklyCapacityHours }}
                        editable={setsCapacityOf(row.userId)}
                        onSaved={() => void load.refetch()}
                      />
                    )}
                  </div>
                  {dates.map((d, i) => (
                    <div key={i}>{cell(row.userId, row.dailyLoads, row.dailyCapacities, row.tasks, i, away.has(format(d, 'yyyy-MM-dd')))}</div>
                  ))}
                  <div className="text-right text-xs tabular-nums" data-testid="workload-view-total">
                    {unit(row.total)}
                  </div>
                </div>
              )
            })}
            <div
              data-testid="workload-view-row"
              data-user-id="unassigned"
              data-total={data.unassigned.total}
              className="mt-1 grid items-center gap-1"
              style={{ gridTemplateColumns: grid }}
            >
              <div className="truncate pr-2 text-sm italic text-muted-foreground">{t('list.workload.unassigned')}</div>
              {dates.map((_, i) => (
                <div key={i}>{cell('unassigned', data.unassigned.dailyLoads, null, data.unassigned.tasks, i, false)}</div>
              ))}
              <div className="text-right text-xs tabular-nums">{unit(data.unassigned.total)}</div>
            </div>
            {data.members.length === 0 && data.unassigned.total === 0 && (
              <p className="mt-3 text-sm text-muted-foreground" data-testid="workload-view-empty">
                {t('list.workload.empty')}
              </p>
            )}
          </div>
          <aside className="w-60 shrink-0 space-y-4 border-l border-border p-3" data-testid="workload-backlog">
            {measure !== 'tasks' && (
              <BacklogSection
                testId="workload-no-estimate"
                title={measure === 'hours' ? t('list.workload.noEstimate') : t('list.workload.noPoints')}
                items={data.noEstimate}
                onOpenTask={onOpenTask}
              />
            )}
            <BacklogSection testId="workload-unscheduled" title={t('list.workload.unscheduled')} items={data.backlog.unscheduled} onOpenTask={onOpenTask} />
            <BacklogSection testId="workload-overdue" title={t('list.workload.overdue')} items={data.backlog.overdue} onOpenTask={onOpenTask} />
            <BacklogSection testId="workload-backlog-unassigned" title={t('list.workload.unassigned')} items={data.backlog.unassigned} onOpenTask={onOpenTask} />
          </aside>
        </div>
      )}
    </Card>
  )
}

function BacklogSection({
  testId,
  title,
  items,
  onOpenTask,
}: {
  testId: string
  title: string
  items: Array<{ taskId: string; title: string }>
  onOpenTask: (id: string) => void
}) {
  return (
    <section data-testid={testId} data-count={items.length}>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title} <span className="tabular-nums">{items.length}</span>
      </h4>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.taskId}>
            <button
              type="button"
              data-testid={`${testId}-item`}
              data-task-id={item.taskId}
              className="w-full truncate rounded border border-border px-2 py-1 text-left text-xs hover:bg-muted"
              onClick={() => onOpenTask(item.taskId)}
            >
              {item.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
