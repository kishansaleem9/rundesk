import { createFileRoute, Link, Outlet, useMatches, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, EmptyState as EmptyStateCard, Button, Badge } from '@rundesk/ui'
import {
  Bell,
  MessageCircleReply,
  UserRoundCheck,
  CircleCheck,
  CalendarClock,
  ListChecks,
  MoreHorizontal,
  Plus,
  Trash2,
  Circle,
} from 'lucide-react'
import { api } from '../lib/api'
import { useMemo, useState } from 'react'
import { formatDistanceToNowStrict, isToday, isPast } from 'date-fns'
import { useAuthStore } from '../store/auth'
import { MentionText } from '../components/mention-text'
import { useMentionNames } from '../hooks/use-mention-names'
import { OnboardingChecklist } from '../components/onboarding-checklist'
import { useTranslation } from '../lib/i18n'

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

export const Route = createFileRoute('/app/$workspaceId')({
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
  const [section, setSection] = useState<
    'inbox' | 'replies' | 'assigned-comments' | 'my-tasks' | 'assigned-to-me' | 'today-overdue' | 'personal-list' | 'more'
  >('inbox')

  const notificationsQuery = useQuery({
    queryKey: ['notifications', workspaceId],
    queryFn: async () => {
      try {
        return await api<Notification[]>(`/notifications`)
      } catch {
        return [] as Notification[]
      }
    },
  })
  const myTasksQuery = useQuery({
    queryKey: ['home-my-tasks', workspaceId, user?.id],
    enabled: !!workspaceId && !!user?.id,
    queryFn: () => api<MemberTask[]>(`/tasks/workspace/${workspaceId}/members/${user!.id}`),
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
  const notifications = notificationsQuery.data ?? []
  const unread = notifications.filter((n) => !n.readAt)
  const replies = notifications.filter((n) => ['task_commented', 'comment'].includes(n.type))
  const assignedComments = notifications.filter((n) => ['task_mentioned', 'mention'].includes(n.type))
  const myTasks = myTasksQuery.data ?? []
  const assignedToMe = myTasks.filter((task) => !['done', 'cancelled'].includes(task.status))
  const todayAndOverdue = myTasks.filter((task) => {
    if (!task.dueDate) return false
    const due = new Date(task.dueDate)
    return isToday(due) || isPast(due)
  })
  const personalTasks = personalTasksQuery.data ?? []
  const visibleAnnouncement = (announcementsQuery.data ?? [])[0]

  const selectedItems = useMemo(() => {
    switch (section) {
      case 'inbox':
        return notifications
      case 'replies':
        return replies
      case 'assigned-comments':
        return assignedComments
      default:
        return []
    }
  }, [section, notifications, replies, assignedComments])

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
                variant="outline"
                onClick={() => {
                  void api(`/workspaces/${workspaceId}/announcements/${visibleAnnouncement.id}/view`, { method: 'POST' })
                }}
              >
                {t('appWorkspace.markSeen')}
              </Button>
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
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4">
        <Card variant="glass" className="p-3 h-fit">
          <h1 className="text-3xl font-display font-semibold mb-3">{t('appWorkspace.home')}</h1>
          <div className="space-y-1">
            <HomeItem icon={Bell} label={t('appWorkspace.inbox')} active={section === 'inbox'} onClick={() => setSection('inbox')} count={unread.length} />
            <HomeItem icon={MessageCircleReply} label={t('appWorkspace.replies')} active={section === 'replies'} onClick={() => setSection('replies')} count={replies.filter((n) => !n.readAt).length} />
            <HomeItem icon={UserRoundCheck} label={t('appWorkspace.assignedComments')} active={section === 'assigned-comments'} onClick={() => setSection('assigned-comments')} count={assignedComments.filter((n) => !n.readAt).length} />
            <div className="pt-2 pb-1 text-xs uppercase tracking-wider text-muted-foreground">{t('appWorkspace.myTasks')}</div>
            <HomeItem icon={CircleCheck} label={t('appWorkspace.assignedToMe')} active={section === 'assigned-to-me'} onClick={() => setSection('assigned-to-me')} count={assignedToMe.length} />
            <HomeItem icon={CalendarClock} label={t('appWorkspace.todayOverdue')} active={section === 'today-overdue'} onClick={() => setSection('today-overdue')} count={todayAndOverdue.length} />
            <HomeItem icon={ListChecks} label={t('appWorkspace.personalList')} active={section === 'personal-list'} onClick={() => setSection('personal-list')} count={personalTasks.filter((task) => !task.done).length} />
            <HomeItem icon={MoreHorizontal} label={t('appWorkspace.more')} active={section === 'more'} onClick={() => setSection('more')} />
          </div>
        </Card>

        <Card variant="glass" className="p-4 min-h-[420px]">
          {(section === 'inbox' || section === 'replies' || section === 'assigned-comments') && (
            <div className="space-y-2">
              {selectedItems.length === 0 ? (
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
            </div>
          )}

          {(section === 'assigned-to-me' || section === 'today-overdue') && (
            <div className="space-y-2">
              {(section === 'assigned-to-me' ? assignedToMe : todayAndOverdue).map((task) => (
                <Link
                  key={task.id}
                  to="/app/$workspaceId/$spaceId/$projectId/$listId"
                  params={{ workspaceId, spaceId: task.spaceId, projectId: task.projectId, listId: task.listId }}
                  search={{ task: task.id } as any}
                  className="block"
                >
                  <Card variant="glass" className="p-3 hover:border-accent/30">
                    <div className="text-sm font-medium">{task.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{task.listName} · {task.status}</div>
                  </Card>
                </Link>
              ))}
              {(section === 'assigned-to-me' ? assignedToMe : todayAndOverdue).length === 0 && (
                <EmptyStateCard icon={<ListChecks className="h-6 w-6" />} title={t('appWorkspace.emptyTasksTitle')} description={t('appWorkspace.emptyTasksBody')} />
              )}
            </div>
          )}

          {section === 'personal-list' && (
            <div className="space-y-3">
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
              {personalTasks.length === 0 ? (
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

function HomeItem({
  icon: Icon,
  label,
  active,
  count,
  onClick,
}: {
  icon: typeof Bell
  label: string
  active: boolean
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm ${
        active ? 'bg-accent/15 text-foreground' : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
      {!!count && (
        <Badge variant="soft" className="ml-auto text-[10px]">
          {count}
        </Badge>
      )}
    </button>
  )
}
