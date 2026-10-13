import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Button, Card, PersonAvatar, cn } from '@rundesk/ui'
import { Filter, Search, User } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { api } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'
import { relativeTime } from '../../lib/relative-time'
import { activityActionName, activitySentence } from '../../lib/activity-actions'
import { LoadOlder } from '../load-older'
import { ListSkeleton } from '../loading-skeletons'

/** One entry of `GET /lists/:listId/activity`. */
export type ListActivityEntry = {
  id: string
  action: string
  meta: Record<string, unknown> | null
  createdAt: string
  taskId: string
  taskTitle: string
  isSubtask: boolean
  actor: { id: string; displayName: string | null; email: string; avatarUrl: string | null } | null
}

type ActivityPage = { items: ListActivityEntry[]; nextBefore: string | null }

/** Entries per page. The server allows up to 100. */
export const ACTIVITY_PAGE = 50

/**
 * A LIST'S ACTIVITY VIEW (`commit-log/log-68bc188-1`, `ledger-rows/row-777`).
 *
 * ClickUp's Activity view is a live feed of everything that happened in its
 * location, grouped by day with the newest first, a search, an activity filter
 * that picks the kinds of change, Me Mode (only tasks assigned to you) and a
 * Subtasks switch. Every narrowing is asked of the server, so a filter
 * searches the whole feed rather than the page this happened to hold, and the
 * counts beside each kind are the server's.
 *
 * `stamp` is the list's own refresh stamp: when the list refetches because a
 * task changed, the feed refetches the pages it holds, which is what makes it
 * live without a socket of its own.
 */
export function ActivityView({
  listId,
  stamp,
  onOpenTask,
}: {
  listId: string
  stamp: number
  onOpenTask: (taskId: string) => void
}) {
  const { t, locale } = useTranslation()
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [actions, setActions] = useState<string[]>([])
  const [me, setMe] = useState(false)
  const [subtasks, setSubtasks] = useState(true)
  const [filterOpen, setFilterOpen] = useState(false)

  // A search is asked once typing stops, not on every key.
  useEffect(() => {
    const id = window.setTimeout(() => setQ(draft.trim()), 250)
    return () => window.clearTimeout(id)
  }, [draft])

  const params = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (me) sp.set('me', 'true')
    if (!subtasks) sp.set('subtasks', 'false')
    for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v)
    const s = sp.toString()
    return s ? `?${s}` : ''
  }

  const feed = useInfiniteQuery({
    queryKey: ['list-activity', listId, q, actions.join(','), me, subtasks],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<ActivityPage>(
        `/lists/${listId}/activity${params({
          action: actions.length ? actions.join(',') : undefined,
          before: pageParam,
          limit: String(ACTIVITY_PAGE),
        })}`,
      ),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    retry: false,
  })

  // The activity filter's choices are what this feed holds under the other filters.
  const kinds = useQuery({
    queryKey: ['list-activity-actions', listId, q, me, subtasks],
    queryFn: () => api<Array<{ action: string; count: number }>>(`/lists/${listId}/activity/actions${params({})}`),
    retry: false,
  })

  // Live: the list's refresh refetches the pages held, without dropping back to one.
  const firstStamp = useRef(stamp)
  useEffect(() => {
    if (stamp === firstStamp.current) return
    void feed.refetch()
    void kinds.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp])

  const rows = useMemo(() => {
    const seen = new Set<string>()
    const out: ListActivityEntry[] = []
    for (const page of feed.data?.pages ?? []) {
      for (const row of page.items) {
        if (seen.has(row.id)) continue
        seen.add(row.id)
        out.push(row)
      }
    }
    return out
  }, [feed.data])

  // Grouped by the reader's own day, newest first, as the feed already is.
  const days = useMemo(() => {
    const groups: Array<{ key: string; date: Date; rows: ListActivityEntry[] }> = []
    for (const row of rows) {
      const date = new Date(row.createdAt)
      const key = format(date, 'yyyy-MM-dd')
      const last = groups[groups.length - 1]
      if (last && last.key === key) last.rows.push(row)
      else groups.push({ key, date, rows: [row] })
    }
    return groups
  }, [rows])

  const dayLabel = (date: Date) =>
    isToday(date)
      ? t('list.activity.today')
      : isYesterday(date)
        ? t('list.activity.yesterday')
        : date.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const toggleAction = (action: string) =>
    setActions((cur) => (cur.includes(action) ? cur.filter((a) => a !== action) : [...cur, action]))

  const narrowed = !!q || actions.length > 0 || me || !subtasks

  return (
    <Card className="p-4" data-testid="activity-view">
      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="activity-view-toolbar">
        <div className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            data-testid="activity-view-search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('list.activity.search')}
            className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-sm"
          />
        </div>
        <div className="relative">
          <Button
            size="sm"
            variant="outline"
            data-testid="activity-view-action-filter"
            data-selected={actions.join(',')}
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((o) => !o)}
          >
            <Filter className="mr-1 h-3.5 w-3.5" aria-hidden />
            {actions.length ? t('list.activity.filterSome', { count: actions.length }) : t('list.activity.filterAll')}
          </Button>
          {filterOpen && (
            <div
              data-testid="activity-view-action-menu"
              className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-border bg-popover p-2 shadow-lg"
            >
              {(kinds.data ?? []).length === 0 && (
                <p className="px-1 py-2 text-xs text-muted-foreground">{t('list.activity.noKinds')}</p>
              )}
              {(kinds.data ?? []).map((k) => (
                <label
                  key={k.action}
                  data-testid={`activity-view-action-${k.action}`}
                  data-count={k.count}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted"
                >
                  <input type="checkbox" checked={actions.includes(k.action)} onChange={() => toggleAction(k.action)} />
                  <span className="flex-1 truncate">{activityActionName(t, k.action)}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{k.count}</span>
                </label>
              ))}
              {actions.length > 0 && (
                <button
                  type="button"
                  data-testid="activity-view-action-clear"
                  className="mt-1 w-full rounded px-1 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
                  onClick={() => setActions([])}
                >
                  {t('list.activity.clear')}
                </button>
              )}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant={me ? 'default' : 'outline'}
          data-testid="activity-view-me"
          aria-pressed={me}
          onClick={() => setMe((v) => !v)}
        >
          <User className="mr-1 h-3.5 w-3.5" aria-hidden />
          {t('list.activity.me')}
        </Button>
        <Button
          size="sm"
          variant={subtasks ? 'default' : 'outline'}
          data-testid="activity-view-subtasks"
          aria-pressed={subtasks}
          onClick={() => setSubtasks((v) => !v)}
        >
          {t('list.activity.subtasks')}
        </Button>
      </div>

      {feed.isLoading ? (
        <ListSkeleton rows={6} rowClassName="h-9" />
      ) : feed.isError ? (
        <p className="text-sm text-destructive" data-testid="activity-view-failed">
          {t('list.activity.failed')}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground" data-testid="activity-view-empty" data-narrowed={narrowed}>
          {narrowed ? t('list.activity.emptyFiltered') : t('list.activity.empty')}
        </p>
      ) : (
        <div className="space-y-5" data-testid="activity-view-feed" data-count={rows.length}>
          {days.map((day) => (
            <section key={day.key} data-testid="activity-view-day" data-day={day.key}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{dayLabel(day.date)}</h3>
              <ul className="space-y-1">
                {day.rows.map((row) => {
                  const who = row.actor ? row.actor.displayName || row.actor.email : t('list.activity.someone')
                  return (
                    <li
                      key={row.id}
                      data-testid="activity-view-row"
                      data-entry-id={row.id}
                      data-action={row.action}
                      data-task-id={row.taskId}
                      data-subtask={row.isSubtask}
                      className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                    >
                      <PersonAvatar name={who} imageUrl={row.actor?.avatarUrl} size="xs" className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1 text-sm">
                        <span className="font-medium" data-testid="activity-view-actor">{who}</span>{' '}
                        <span className="text-muted-foreground" data-testid="activity-view-sentence">
                          {activitySentence(t, row)}
                        </span>{' '}
                        <button
                          type="button"
                          data-testid="activity-view-task"
                          className={cn('font-medium text-brand-700 hover:underline dark:text-brand-300', row.isSubtask && 'italic')}
                          onClick={() => onOpenTask(row.taskId)}
                        >
                          {row.taskTitle}
                        </button>
                      </div>
                      <time
                        dateTime={row.createdAt}
                        title={new Date(row.createdAt).toLocaleString(locale)}
                        className="shrink-0 text-xs text-muted-foreground"
                      >
                        {relativeTime(row.createdAt, locale)}
                      </time>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
          {feed.hasNextPage && (
            <LoadOlder query={feed} testId="activity-view-load-older" label={t('list.activity.loadOlder')} />
          )}
        </div>
      )}
    </Card>
  )
}
