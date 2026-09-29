import { createFileRoute, Link, Outlet, useMatches, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, EmptyState as EmptyStateCard, Button, Badge, toast } from '@rundesk/ui'
import { ListSkeleton } from '../components/loading-skeletons'
import { LoadOlder } from '../components/load-older'
import { FLAGS } from '@rundesk/feature-flags'
import {
  Bell,
  MessageCircleReply,
  UserRoundCheck,
  CircleCheck,
  CalendarClock,
  ListChecks,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
  Circle,
  AlarmClock,
} from 'lucide-react'
import { api } from '../lib/api'
import { ASSIGNED_COMMENT_TYPES, REPLY_TYPES } from '../lib/reply-types'
import { notificationsUrl, typesKey, useNotificationPages, useUnreadCount } from '../lib/notifications-query'
import { useEffect, useState } from 'react'
import { formatDistanceToNowStrict, isToday, isPast } from 'date-fns'
import { useAuthStore } from '../store/auth'
import { MentionText } from '../components/mention-text'
import { useMentionNames } from '../hooks/use-mention-names'
import { OnboardingChecklist } from '../components/onboarding-checklist'
import { useTranslation } from '../lib/i18n'
import { useResolvedFlags } from '../lib/use-feature-flags'

type Notification = {
  id: string
  type: string
  title: string
  body?: string | null
  readAt?: string | null
  createdAt: string
  actor?: { displayName?: string | null } | null
  target?: { url?: string; entityType?: string; entityId?: string } | null
}

type MemberTask = {
  id: string
  title: string
  status: string
  dueDate?: string | null
  listId: string
  projectId: string
  spaceId: string
  listName: string
}
type PersonalTask = {
  id: string
  title: string
  done: boolean
  position: number
  createdAt: string
}
type WorkspaceAnnouncement = {
  id: string
  title: string
  body: string
  tone: 'info' | 'celebrate' | 'warn'
}

/**
 * §G15 [21:22] — "MY TASKS … ASSIGNED TO ME, TODAY, aur PERSONAL LIST."
 *
 * All three existed, and none of them had an address: they were `useState` on
 * this page, so "where did my task go" had no answer you could navigate to,
 * bookmark, or send to somebody. Reading the section from the URL is what makes
 * My Tasks a place rather than a state the page happens to be in.
 */
const HOME_SECTIONS = [
  'inbox',
  'replies',
  'assigned-comments',
  'my-tasks',
  'assigned-to-me',
  'today-overdue',
  'personal-list',
  'reminders',
  'more',
] as const
type HomeSection = (typeof HOME_SECTIONS)[number]

/** How many of your open tasks Home lists; it asks the server for one more, to know when it cut. */
const HOME_TASKS_SHOWN = 500

/** One of the caller's still-pending reminders, as GET /workspaces/:ws/reminders answers. */
type PendingReminder = {
  id: string
  taskId: string | null
  taskTitle: string | null
  messageId: string | null
  messageBody: string | null
  channelId: string | null
  channelName: string | null
  note: string | null
  remindAt: string
  notifiedAt: string | null
}

export const Route = createFileRoute('/app/$workspaceId')({
  validateSearch: (search: Record<string, unknown>): { section?: HomeSection } => {
    const raw = search.section
    // An unknown ?section= falls back to the Inbox rather than rendering
    // nothing: a stale bookmark should land somewhere useful.
    return typeof raw === 'string' && (HOME_SECTIONS as readonly string[]).includes(raw)
      ? { section: raw as HomeSection }
      : {}
  },
  component: WorkspaceShell,
})

function WorkspaceShell() {
  const matches = useMatches()
  const isNested = matches.some(
    (m) =>
      m.routeId !== '/app/$workspaceId' &&
      m.routeId.startsWith('/app/$workspaceId/'),
  )
  if (isNested) return <Outlet />
  return <WorkspaceHome />
}

function WorkspaceHome() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { workspaceId } = Route.useParams()
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  /*
   * The section lives in the URL, not in state. Picking one replaces the entry
   * rather than pushing, so Back leaves Home instead of walking you through
   * every section you clicked on the way here.
   */
  const { section: sectionParam } = Route.useSearch()
  const section: HomeSection = sectionParam ?? 'inbox'
  const setSection = (next: HomeSection) =>
    navigate({ to: '/app/$workspaceId', params: { workspaceId }, search: { section: next }, replace: true })

  /*
   * Home's three notification panels, each asked for by type and scoped to this
   * workspace, with their counts from the server.
   *
   * They were one bare `/notifications` read — the newest fifty, from every
   * workspace — filtered and counted here, so a reply older than fifty other
   * notifications was neither listed nor counted, and another workspace's rows
   * were. A failed read was caught and shown as an empty inbox.
   */
  const panelTypes =
    section === 'replies' ? REPLY_TYPES : section === 'assigned-comments' ? ASSIGNED_COMMENT_TYPES : undefined
  const notificationsQuery = useNotificationPages<Notification>(
    [workspaceId, 'home', typesKey(panelTypes)],
    { workspaceId, types: panelTypes },
    { enabled: section === 'inbox' || section === 'replies' || section === 'assigned-comments' },
  )
  const inboxUnread = useUnreadCount({ workspaceId })
  const repliesUnread = useUnreadCount({ workspaceId, types: REPLY_TYPES })
  const assignedUnread = useUnreadCount({ workspaceId, types: ASSIGNED_COMMENT_TYPES })
  // The newest briefing, asked for as itself: it was found among the newest
  // fifty notifications, so one busy morning was enough to hide it.
  const briefingQuery = useQuery({
    queryKey: ['notifications', workspaceId, 'home-briefing'],
    queryFn: () =>
      api<Notification[]>(notificationsUrl('/notifications', { workspaceId, types: ['ai_briefing'], limit: 1 })),
  })
  /*
   * One more than Home shows, so a list that was cut says "500+" instead of a
   * confident 500. The server returns OPEN tasks only (not binned), soonest
   * due first, so a cut takes the least urgent.
   */
  const myTasksQuery = useQuery({
    queryKey: ['home-my-tasks', workspaceId, user?.id],
    enabled: !!workspaceId && !!user?.id,
    queryFn: () =>
      api<MemberTask[]>(`/tasks/workspace/${workspaceId}/members/${user!.id}?limit=${HOME_TASKS_SHOWN + 1}`),
  })
  const announcementsQuery = useQuery({
    queryKey: ['workspace-announcements', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      try {
        return await api<WorkspaceAnnouncement[]>(`/workspaces/${workspaceId}/announcements/active`)
      } catch {
        return [] as WorkspaceAnnouncement[]
      }
    },
  })

  /*
   * REMINDERS HAD NO READER. `+ Create › Reminder` makes a standalone one and
   * invalidates `['reminders', ws]`, and nothing on the page held that key:
   * `GET /workspaces/:ws/reminders` answered, and no screen asked. A reminder
   * made there could be neither seen nor taken back until it went off — only a
   * task's own reminders were ever listed, from inside that task. Home is where
   * the rest of your own work already is, so this is where they are listed,
   * under the key the modal was already refreshing.
   */
  const remindersQuery = useQuery({
    queryKey: ['reminders', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => api<PendingReminder[]>(`/workspaces/${workspaceId}/reminders`),
  })
  const deleteReminder = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/reminders/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['reminders', workspaceId] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : t('appWorkspace.couldNotDeleteReminder')),
  })

  const personalTasksQuery = useQuery({
    queryKey: ['personal-tasks', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => api<PersonalTask[]>(`/workspaces/${workspaceId}/personal-tasks`),
  })
  const [newPersonalTitle, setNewPersonalTitle] = useState('')

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notifications', workspaceId] })
      await qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const invalidatePersonal = () => qc.invalidateQueries({ queryKey: ['personal-tasks', workspaceId] })
  const addPersonalTask = useMutation({
    mutationFn: (title: string) =>
      api(`/workspaces/${workspaceId}/personal-tasks`, { method: 'POST', body: { title } }),
    onSuccess: () => {
      setNewPersonalTitle('')
      void invalidatePersonal()
    },
  })
  const togglePersonalTask = useMutation({
    mutationFn: (task: PersonalTask) =>
      api(`/personal-tasks/${task.id}`, { method: 'PATCH', body: { done: !task.done } }),
    onSuccess: () => void invalidatePersonal(),
  })
  const deletePersonalTask = useMutation({
    mutationFn: (id: string) => api(`/personal-tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => void invalidatePersonal(),
  })

  const { namesById } = useMentionNames(workspaceId)
  const notifications = notificationsQuery.rows
  /*
   * NO STATUS FILTER HERE ANY MORE. "Assigned to me" kept tasks whose status
   * KEY was not `done` or `cancelled`, and status keys are renamable, so a
   * task in a closed status called anything else stayed listed; "Today &
   * overdue" did not filter at all, so every finished task with a past due
   * date was counted overdue. The server now returns open work only, by
   * category, before its limit, which is where that rule belongs.
   */
  const myTasksCut = (myTasksQuery.data?.length ?? 0) > HOME_TASKS_SHOWN
  const myTasks = (myTasksQuery.data ?? []).slice(0, HOME_TASKS_SHOWN)
  const assignedToMe = myTasks
  const todayAndOverdue = myTasks.filter((task) => {
    if (!task.dueDate) return false
    const due = new Date(task.dueDate)
    return isToday(due) || isPast(due)
  })
  // Rows come soonest-due first, so a cut can only have dropped more of these
  // when every row shown was already due.
  const todayAndOverdueCut = myTasksCut && todayAndOverdue.length === myTasks.length
  const personalTasks = personalTasksQuery.data ?? []
  const pendingReminders = remindersQuery.data ?? []
  // Where a reminder leads: its task, through the same resolver the Inbox
  // uses, or its message in the channel it was said in.
  const openReminder = async (r: PendingReminder) => {
    if (r.taskId) {
      try {
        const nav = await api<{ url: string }>(`/tasks/${r.taskId}/navigation`)
        navigate({ to: nav.url as any })
      } catch {
        toast.error(t('appWorkspace.reminderTargetGone'))
      }
      return
    }
    if (r.channelId) navigate({ to: `/app/${workspaceId}/chat?channel=${r.channelId}${r.messageId ? `&message=${r.messageId}` : ''}` as any })
  }
  const visibleAnnouncement = (announcementsQuery.data ?? [])[0]
  /*
   * SHOWN IS SEEN: the banner records a view when it is drawn, and the server
   * counts each person once (`found-28-sep/announcement-views-counted-per-click`).
   * A Mark seen button added one per click and changed nothing on the page.
   */
  const shownAnnouncementId = visibleAnnouncement?.id
  useEffect(() => {
    if (!workspaceId || !shownAnnouncementId) return
    void api(`/workspaces/${workspaceId}/announcements/${shownAnnouncementId}/view`, { method: 'POST' }).catch(() => {})
  }, [workspaceId, shownAnnouncementId])
  // §A6.5 — the scheduled briefing arrives as a notification; Home is where the
  // user starts their day, so the most recent one is shown here rather than
  // being left to be discovered on the Insights page.
  const latestBriefing = briefingQuery.data?.[0] ?? null

  // The panel's rows are already the section's: the server filtered them.
  const selectedItems = notifications

  const resolveDestination = async (notif: Notification) => {
    const raw = notif.target?.url?.trim()
    if (!raw) return null
    let path = raw
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      try {
        const parsed = new URL(raw)
        path = `${parsed.pathname}${parsed.search}${parsed.hash}`
      } catch {
        path = raw
      }
    }
    if (path.startsWith('/app/') && !/\/tasks\/[0-9a-f-]{36}$/i.test(path)) return path
    const taskIdFromTarget = notif.target?.entityType === 'task' ? notif.target.entityId : null
    const taskIdFromLegacyPath = path.match(/\/tasks\/([0-9a-f-]{36})$/i)?.[1] ?? null
    const taskId = taskIdFromTarget ?? taskIdFromLegacyPath
    if (!taskId) return path.startsWith('/') ? path : null
    try {
      const nav = await api<{ url: string }>(`/tasks/${taskId}/navigation`)
      return nav.url
    } catch {
      return workspaceId ? `/app/${workspaceId}` : null
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <OnboardingChecklist workspaceId={workspaceId} />
      {visibleAnnouncement && (
        <Card
          variant="glass"
          className={`mb-4 p-3 border ${
            visibleAnnouncement.tone === 'warn'
              ? 'border-warning/40'
              : visibleAnnouncement.tone === 'celebrate'
                ? 'border-emerald-500/30'
                : 'border-accent/30'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{visibleAnnouncement.title}</div>
              {visibleAnnouncement.body && (
                <div className="text-xs text-muted-foreground mt-1">{visibleAnnouncement.body}</div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void api(`/workspaces/${workspaceId}/announcements/${visibleAnnouncement.id}/dismiss`, { method: 'POST' })
                    .finally(() => {
                      void announcementsQuery.refetch()
                    })
                }}
              >
                {t('appWorkspace.dismiss')}
              </Button>
            </div>
          </div>
        </Card>
      )}
      <DailyBriefingCard workspaceId={workspaceId} latest={latestBriefing} />
      {/* §G01-9 [00:35] — "save Rundesk items or any URL from around the web". */}
      <BookmarksCard workspaceId={workspaceId} />
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4">
        <Card variant="glass" className="p-3 h-fit">
          <h1 className="text-3xl font-display font-semibold mb-3">{t('appWorkspace.home')}</h1>
          <div className="space-y-1">
            <HomeItem icon={Bell} label={t('appWorkspace.inbox')} active={section === 'inbox'} onClick={() => setSection('inbox')} count={inboxUnread.data?.count} testId="home-nav-inbox" />
            <HomeItem icon={MessageCircleReply} label={t('appWorkspace.replies')} active={section === 'replies'} onClick={() => setSection('replies')} count={repliesUnread.data?.count} testId="home-nav-replies" />
            <HomeItem icon={UserRoundCheck} label={t('appWorkspace.assignedComments')} active={section === 'assigned-comments'} onClick={() => setSection('assigned-comments')} count={assignedUnread.data?.count} testId="home-nav-assigned-comments" />
            <div className="pt-2 pb-1 text-xs uppercase tracking-wider text-muted-foreground">{t('appWorkspace.myTasks')}</div>
            <HomeItem icon={CircleCheck} label={t('appWorkspace.assignedToMe')} active={section === 'assigned-to-me'} onClick={() => setSection('assigned-to-me')} count={assignedToMe.length} more={myTasksCut} testId="home-nav-assigned-to-me" />
            <HomeItem icon={CalendarClock} label={t('appWorkspace.todayOverdue')} active={section === 'today-overdue'} onClick={() => setSection('today-overdue')} count={todayAndOverdue.length} more={todayAndOverdueCut} testId="home-nav-today-overdue" />
            <HomeItem icon={ListChecks} label={t('appWorkspace.personalList')} active={section === 'personal-list'} onClick={() => setSection('personal-list')} count={personalTasks.filter((task) => !task.done).length} />
            <HomeItem icon={AlarmClock} label={t('appWorkspace.reminders')} active={section === 'reminders'} onClick={() => setSection('reminders')} count={pendingReminders.length} testId="home-nav-reminders" />
            <HomeItem icon={MoreHorizontal} label={t('appWorkspace.more')} active={section === 'more'} onClick={() => setSection('more')} />
          </div>
        </Card>

        <Card variant="glass" className="p-4 min-h-[420px]">
          {(section === 'inbox' || section === 'replies' || section === 'assigned-comments') && (
            <div className="space-y-2">
              {/* §A2.9 — this panel only ever shows the live slice; the route
                  behind it is where read replies stay browsable. */}
              {section === 'replies' && (
                <div className="flex justify-end">
                  <Link
                    to="/app/$workspaceId/replies"
                    params={{ workspaceId }}
                    search={{ filter: 'all' as const }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t('appWorkspace.viewAllReplies')} →
                  </Link>
                </div>
              )}
              {/* §2.9a — this is the screen you land on after "new workspace
                  mein le ke aata", and every panel on it read `data ?? []` and
                  went straight to its empty state, so a fresh workspace
                  announced it had nothing before a single request had come
                  back. Shapes until we know. */}
              {notificationsQuery.isPending ? (
                <ListSkeleton rows={3} rowClassName="h-16" />
              ) : notificationsQuery.isError && selectedItems.length === 0 ? (
                <p className="text-sm text-destructive" data-testid="home-notifications-failed">
                  {t('inbox.loadFailed')}
                </p>
              ) : selectedItems.length === 0 ? (
                <EmptyStateCard
                  icon={<Bell className="h-6 w-6" />}
                  title={t('appWorkspace.emptyInboxTitle')}
                  description={t('appWorkspace.emptyInboxBody')}
                />
              ) : (
                selectedItems.map((n) => (
                  <Card
                    key={n.id}
                    variant="glass"
                    data-testid={`home-notification-${n.id}`}
                    className="p-3 cursor-pointer hover:border-accent/30"
                    onClick={async () => {
                      if (!n.readAt) await markRead.mutateAsync(n.id)
                      const destination = await resolveDestination(n)
                      if (destination) navigate({ to: destination as any })
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{n.title}</div>
                        {n.body && (
                          <MentionText
                            text={n.body}
                            namesById={namesById}
                            className="text-xs text-muted-foreground mt-1 line-clamp-2"
                          />
                        )}
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                      {(section === 'assigned-comments' || section === 'replies') && !n.readAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            void markRead.mutateAsync(n.id)
                          }}
                        >
                          {t('appWorkspace.resolve')}
                        </Button>
                      )}
                    </div>
                  </Card>
                ))
              )}
              {/* Fifty at a time, like the Inbox, and the rest one click away
                  rather than silently left out of the panel. */}
              {notificationsQuery.hasNextPage && <LoadOlder query={notificationsQuery} testId="home-load-more" />}
            </div>
          )}

          {(section === 'assigned-to-me' || section === 'today-overdue') && (
            <div className="space-y-2" data-testid={`home-section-${section}`}>
              {(section === 'assigned-to-me' ? assignedToMe : todayAndOverdue).map((task) => (
                <Link
                  key={task.id}
                  to="/app/$workspaceId/$spaceId/$projectId/$listId"
                  params={{ workspaceId, spaceId: task.spaceId, projectId: task.projectId, listId: task.listId }}
                  search={{ task: task.id } as any}
                  className="block"
                  data-testid="home-task-row"
                  data-task-id={task.id}
                >
                  <Card variant="glass" className="p-3 hover:border-accent/30">
                    <div className="text-sm font-medium">{task.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{task.listName} · {task.status}</div>
                  </Card>
                </Link>
              ))}
              {myTasksQuery.isPending && <ListSkeleton rows={3} rowClassName="h-14" />}
              {/*
                A failed read is not an empty list. It fell through to "no
                tasks" below, the confident zero this page must not show.
              */}
              {myTasksQuery.isError && (
                <p className="text-sm text-destructive" data-testid="home-tasks-failed">
                  {t('appWorkspace.tasksLoadFailed')}
                </p>
              )}
              {myTasksQuery.isSuccess &&
                (section === 'assigned-to-me' ? assignedToMe : todayAndOverdue).length === 0 && (
                  <EmptyStateCard icon={<ListChecks className="h-6 w-6" />} title={t('appWorkspace.emptyTasksTitle')} description={t('appWorkspace.emptyTasksBody')} />
                )}
            </div>
          )}

          {section === 'personal-list' && (
            <div className="space-y-3" data-testid="home-section-personal-list">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const trimmed = newPersonalTitle.trim()
                  if (trimmed) addPersonalTask.mutate(trimmed)
                }}
                className="flex items-center gap-2"
              >
                <input
                  value={newPersonalTitle}
                  onChange={(e) => setNewPersonalTitle(e.target.value)}
                  placeholder={t('appWorkspace.addPersonalTaskPlaceholder')}
                  className="flex-1 h-9 rounded-md border border-border/60 bg-card/40 px-3 text-sm outline-none focus:border-accent/50"
                />
                <Button type="submit" size="sm" disabled={!newPersonalTitle.trim() || addPersonalTask.isPending}>
                  <Plus className="h-4 w-4" /> {t('appWorkspace.add')}
                </Button>
              </form>
              {personalTasksQuery.isPending ? (
                <ListSkeleton rows={3} rowClassName="h-11" />
              ) : personalTasks.length === 0 ? (
                <EmptyStateCard
                  icon={<ListChecks className="h-6 w-6" />}
                  title={t('appWorkspace.emptyPersonalTitle')}
                  description={t('appWorkspace.emptyPersonalBody')}
                />
              ) : (
                <div className="space-y-1.5">
                  {personalTasks.map((task) => (
                    <Card key={task.id} variant="glass" className="p-2.5 flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => togglePersonalTask.mutate(task)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label={task.done ? t('appWorkspace.markNotDone') : t('appWorkspace.markDone')}
                      >
                        {task.done ? (
                          <CircleCheck className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Circle className="h-4 w-4" />
                        )}
                      </button>
                      <span className={`flex-1 text-sm ${task.done ? 'line-through text-muted-foreground' : ''}`}>
                        {task.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => deletePersonalTask.mutate(task.id)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={t('appWorkspace.deletePersonalTask')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {section === 'reminders' && (
            <div className="space-y-2" data-testid="home-section-reminders">
              {remindersQuery.isPending ? (
                <ListSkeleton rows={3} rowClassName="h-14" />
              ) : pendingReminders.length === 0 ? (
                <EmptyStateCard
                  icon={<AlarmClock className="h-6 w-6" />}
                  title={t('appWorkspace.emptyRemindersTitle')}
                  description={t('appWorkspace.emptyRemindersBody')}
                />
              ) : (
                pendingReminders.map((r) => {
                  const label = r.note?.trim() || r.taskTitle || r.messageBody || t('appWorkspace.reminders')
                  const where = r.taskTitle ?? (r.channelName ? `#${r.channelName}` : null)
                  const leads = Boolean(r.taskId || r.channelId)
                  return (
                    <Card
                      key={r.id}
                      variant="glass"
                      data-testid="home-reminder"
                      data-reminder-id={r.id}
                      className={`p-3 ${leads ? 'cursor-pointer hover:border-accent/30' : ''}`}
                      onClick={() => {
                        if (leads) void openReminder(r)
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate" data-testid="home-reminder-label">{label}</div>
                          <div className="text-[11px] text-muted-foreground mt-1" data-testid="home-reminder-when">
                            {formatDistanceToNowStrict(new Date(r.remindAt), { addSuffix: true })}
                            {where && label !== where ? ` · ${where}` : ''}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 shrink-0"
                          aria-label={t('appWorkspace.deleteReminder')}
                          title={t('appWorkspace.deleteReminder')}
                          data-testid="home-reminder-delete"
                          disabled={deleteReminder.isPending}
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteReminder.mutate(r.id)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Card>
                  )
                })
              )}
            </div>
          )}

          {section === 'more' && (
            <div className="space-y-2">
              <Button variant="outline" onClick={() => navigate({ to: '/app/$workspaceId/inbox', params: { workspaceId } })}>
                {t('appWorkspace.openFullInbox')}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

type BriefingRun = {
  body: string
  data: { overdue: string[]; dueToday: string[]; atRisk: string[]; blocking: string[] }
}

/**
 * §A6.5 — the briefing generator already ran on a schedule and delivered a
 * notification nobody looked for. This puts the latest one on Home and adds the
 * missing action: run it again right now, without waiting for tomorrow.
 */
function DailyBriefingCard({
  workspaceId,
  latest,
}: {
  workspaceId: string
  latest: Notification | null
}) {
  const { t } = useTranslation()
  const { featureEnabled } = useResolvedFlags(workspaceId)
  const [run, setRun] = useState<BriefingRun | null>(null)
  const [failed, setFailed] = useState(false)

  const generate = useMutation({
    mutationFn: () => api<BriefingRun>('/ai/briefing', { method: 'POST' }),
    onMutate: () => setFailed(false),
    onSuccess: (result) => setRun(result),
    onError: () => setFailed(true),
  })

  if (!featureEnabled(FLAGS.AI_DAILY_BRIEFINGS)) return null

  const body = run?.body ?? latest?.body ?? null
  const counts = run
    ? [
        { labelKey: 'appWorkspace.briefingOverdue' as const, value: run.data.overdue.length },
        { labelKey: 'appWorkspace.briefingDueToday' as const, value: run.data.dueToday.length },
        { labelKey: 'appWorkspace.briefingAtRisk' as const, value: run.data.atRisk.length },
        { labelKey: 'appWorkspace.briefingBlocking' as const, value: run.data.blocking.length },
      ]
    : []

  return (
    <Card variant="glass" className="mb-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sun className="h-3.5 w-3.5 text-amber-500" />
            {t('appWorkspace.briefingTitle')}
            {latest && !run && (
              <span>· {formatDistanceToNowStrict(new Date(latest.createdAt), { addSuffix: true })}</span>
            )}
          </div>
          <p className="text-sm mt-1.5 whitespace-pre-wrap">
            {body ?? t('appWorkspace.briefingEmpty')}
          </p>
          {counts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {counts.map((c) => (
                <Badge key={c.labelKey} variant="soft" className="text-[10px]">
                  {t(c.labelKey)}: {c.value}
                </Badge>
              ))}
            </div>
          )}
          {failed && <p className="text-xs text-destructive mt-2">{t('appWorkspace.briefingFailed')}</p>}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            disabled={generate.isPending}
            onClick={() => generate.mutate()}
          >
            <RefreshCw className={generate.isPending ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            {generate.isPending ? t('appWorkspace.briefingGenerating') : t('appWorkspace.briefingGenerate')}
          </Button>
          <Link to="/app/profile" className="text-[11px] text-muted-foreground hover:text-foreground">
            {t('appWorkspace.briefingDeliveryTime')}
          </Link>
        </div>
      </div>
    </Card>
  )
}

function HomeItem({
  icon: Icon,
  label,
  active,
  count,
  more,
  onClick,
  testId,
}: {
  icon: typeof Bell
  label: string
  active: boolean
  count?: number
  /** The list behind the count was cut: the count is a floor, drawn "500+". */
  more?: boolean
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm ${
        active ? 'bg-accent/15 text-foreground' : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
      {!!count && (
        <Badge variant="soft" className="ml-auto text-[10px]" data-testid={testId ? `${testId}-count` : undefined}>
          {count}
          {more ? '+' : ''}
        </Badge>
      )}
    </button>
  )
}


type Bookmark = { id: string; title: string; url: string }

/**
 * §G01-9 [00:35] — the Overview's Bookmarks card.
 *
 * > "Bookmarks make it easy to save ClickUp items or any URL from around the
 * >  web." + "Add Bookmark"
 *
 * Deliberately not the existing favourites. Those hold internal nav paths and
 * are handed to the router; the point of a bookmark is the "or any URL from
 * around the web" half, and a router given `https://…` goes nowhere. So an
 * external one opens in a new tab and an internal one navigates, decided by
 * what was saved rather than by hope.
 */
function BookmarksCard({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')

  const bookmarks = useQuery({
    enabled: Boolean(workspaceId),
    queryKey: ['bookmarks', workspaceId],
    queryFn: () => api<Bookmark[]>(`/workspaces/${workspaceId}/bookmarks`),
  })

  const add = useMutation({
    mutationFn: () =>
      api<Bookmark>(`/workspaces/${workspaceId}/bookmarks`, {
        method: 'POST',
        body: { url: url.trim(), title: title.trim() || undefined },
      }),
    onSuccess: () => {
      setUrl('')
      setTitle('')
      setAdding(false)
      void qc.invalidateQueries({ queryKey: ['bookmarks', workspaceId] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  })

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/workspaces/${workspaceId}/bookmarks/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['bookmarks', workspaceId] }),
  })

  const rows = bookmarks.data ?? []
  return (
    <Card variant="glass" className="p-4" data-testid="home-bookmarks">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('bookmarks.title')}</h2>
        <Button size="sm" variant="outline" data-testid="bookmark-add-open" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          {t('bookmarks.add')}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t('bookmarks.blurb')}</p>

      {adding && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (url.trim()) add.mutate()
          }}
        >
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('bookmarks.urlPlaceholder')}
            data-testid="bookmark-url"
            className="h-8 flex-1 min-w-[14rem] rounded-md border border-border/60 bg-card/40 px-2 text-xs outline-none focus:border-accent/50"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('bookmarks.namePlaceholder')}
            data-testid="bookmark-title"
            className="h-8 w-40 rounded-md border border-border/60 bg-card/40 px-2 text-xs outline-none focus:border-accent/50"
          />
          <Button type="submit" size="sm" disabled={!url.trim() || add.isPending} data-testid="bookmark-save">
            {t('bookmarks.save')}
          </Button>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="bookmarks-empty">
          {t('bookmarks.empty')}
        </p>
      ) : (
        <ul className="mt-3 space-y-1" data-testid="bookmarks-list">
          {rows.map((b) => (
            <li key={b.id} className="group flex items-center gap-2">
              {/*
                An in-app path navigates; an http(s) one opens a new tab. The
                server refuses anything else, so this only has to tell the two
                apart rather than defend against a third.
              */}
              {b.url.startsWith('/') ? (
                <button
                  type="button"
                  data-testid={`bookmark-${b.id}`}
                  onClick={() => navigate({ to: b.url as '/app' })}
                  className="flex-1 min-w-0 truncate text-left text-xs text-muted-foreground hover:text-foreground"
                >
                  {b.title}
                </button>
              ) : (
                <a
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`bookmark-${b.id}`}
                  className="flex-1 min-w-0 truncate text-xs text-muted-foreground hover:text-foreground"
                >
                  {b.title}
                </a>
              )}
              <button
                type="button"
                aria-label={t('bookmarks.remove')}
                data-testid={`bookmark-remove-${b.id}`}
                onClick={() => remove.mutate(b.id)}
                className="shrink-0 p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
